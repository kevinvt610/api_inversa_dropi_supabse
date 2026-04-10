/**
 * _shared/dropi-auth.ts
 *
 * Shared Dropi authentication helper.
 * Mirrors the auto-relogin logic already implemented in dropi-product,
 * extracted so every Edge Function benefits from it consistently.
 *
 * How it works:
 *  1. getDropiToken()  — calls the SECURITY DEFINER RPC that bypasses RLS
 *                        and returns { token, email, password }
 *  2. reloginDropi()   — calls Dropi /api/login, saves new token to DB
 *  3. isTokenExpired() — detects "Token is Expired" in any Dropi response
 *  4. callDropiWithAutoRelogin() — wraps any Dropi fetch; retries once on expiry
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { browserHeaders } from "./dropi.ts";

const DROPI_BASE = "https://api.dropi.co";

// ─── Supabase admin client (service_role bypasses RLS) ───────────────────────

export function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ─── Token retrieval via the same RPC used by dropi-product ──────────────────

export interface DropiAuth {
  token: string | null;
  email: string | null;
  password: string | null;
}

/**
 * Calls the SECURITY DEFINER RPC `get_active_dropi_token_server_side`
 * which returns { token, email, password } regardless of RLS.
 *
 * Falls back to reading the legacy `dropi_tokens` table (id=1) for
 * backwards compatibility (token only — no creds for auto-relogin there).
 */
export async function getDropiToken(supabase: ReturnType<typeof getAdminClient>): Promise<DropiAuth> {
  // Primary: use the RPC (same as dropi-product — has email+password for relogin)
  const { data: rpcData, error: rpcError } = await supabase.rpc("get_active_dropi_token_server_side");

  if (!rpcError && rpcData?.token) {
    return {
      token: rpcData.token,
      email: rpcData.email ?? null,
      password: rpcData.password ?? null,
    };
  }

  // Fallback: legacy dropi_tokens table (token only)
  console.warn("[dropi-auth] RPC failed, falling back to dropi_tokens table:", rpcError?.message);
  const { data: dbData } = await supabase
    .from("dropi_tokens")
    .select("token")
    .eq("id", 1)
    .single();

  return { token: dbData?.token ?? null, email: null, password: null };
}

// ─── Token expiry detection ───────────────────────────────────────────────────

/**
 * Returns true if the Dropi JSON response indicates the token has expired.
 * Handles both response-level status 401 and body-level flags.
 */
export function isTokenExpired(data: any, httpStatus?: number): boolean {
  if (httpStatus === 401) return true;
  if (!data) return false;
  if (data.isSuccess === false) {
    const msg: string = (data.message ?? "").toLowerCase();
    if (
      msg.includes("expired") ||
      msg.includes("token") ||
      msg.includes("unauthorized")
    ) return true;
    if (data.status === 401) return true;
  }
  return false;
}

// ─── Auto re-login ────────────────────────────────────────────────────────────

/**
 * Authenticates with Dropi using stored credentials and persists the new token.
 * Returns the new token or null on failure.
 */
export async function reloginDropi(
  supabase: ReturnType<typeof getAdminClient>,
  email: string,
  password: string
): Promise<string | null> {
  console.log("[dropi-auth] 🔄 Token expirado — ejecutando re-login automático...");

  try {
    const loginRes = await fetch(`${DROPI_BASE}/api/login`, {
      method: "POST",
      headers: { ...browserHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        white_brand_id: 10,
        brand: "",
        ipAddress: "190.27.10.13",
        otp: null,
        with_cdc: false,
      }),
    });

    const loginData = await loginRes.json();

    if (!loginData?.token) {
      console.error("[dropi-auth] ❌ Re-login falló. Respuesta:", JSON.stringify(loginData));
      return null;
    }

    // Persist new token to both integrations and dropi_tokens tables
    await Promise.allSettled([
      // New integrations table
      supabase
        .from("integrations")
        .update({ token: loginData.token })
        .eq("provider", "dropi"),
      // Legacy dropi_tokens table
      supabase
        .from("dropi_tokens")
        .upsert({ id: 1, token: loginData.token, updated_at: new Date().toISOString() }),
    ]);

    console.log("[dropi-auth] ✅ Nuevo token guardado en DB.");
    return loginData.token;
  } catch (err: any) {
    console.error("[dropi-auth] ❌ Excepción en re-login:", err.message);
    return null;
  }
}

// ─── Main wrapper ─────────────────────────────────────────────────────────────

/**
 * Executes a Dropi API call using a fetcher function.
 * If the response signals an expired token AND credentials are available,
 * it automatically re-logins and retries the request ONCE.
 *
 * @param supabase  Admin Supabase client
 * @param auth      Object returned by getDropiToken()
 * @param fetcher   Function that receives a Bearer token and returns a fetch Response
 * @returns         Parsed JSON response from Dropi
 */
export async function callDropiWithAutoRelogin(
  supabase: ReturnType<typeof getAdminClient>,
  auth: DropiAuth,
  fetcher: (bearerToken: string) => Promise<Response>
): Promise<any> {
  if (!auth.token) {
    return { isSuccess: false, message: "Integración Dropi no activa o token ausente." };
  }

  // ── First attempt ──────────────────────────────────────────────────────────

  let res = await fetcher(`Bearer ${auth.token}`);
  let data: any;

  try {
    data = await res.json();
  } catch {
    data = { isSuccess: false, message: "Respuesta no-JSON de Dropi." };
  }

  // ── Check expiry ───────────────────────────────────────────────────────────

  if (!isTokenExpired(data, res.status)) {
    return data; // Happy path — token was valid
  }

  if (!auth.email || !auth.password) {
    console.error("[dropi-auth] Token expirado pero sin credenciales para re-login.");
    return {
      isSuccess: false,
      message: "Token expirado. Vuelve a configurar la integración Dropi en el panel de configuración.",
    };
  }

  // ── Re-login & retry ───────────────────────────────────────────────────────

  const newToken = await reloginDropi(supabase, auth.email, auth.password);

  if (!newToken) {
    return {
      isSuccess: false,
      message: "Token expirado y re-autenticación automática falló.",
    };
  }

  // Second attempt with fresh token
  try {
    const retryRes = await fetcher(`Bearer ${newToken}`);
    data = await retryRes.json();
  } catch {
    data = { isSuccess: false, message: "Respuesta no-JSON de Dropi (2do intento)." };
  }

  return data;
}
