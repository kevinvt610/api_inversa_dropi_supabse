import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { browserHeaders } from "../_shared/dropi.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    // Seguimos usando el anonKey para instanciar el cliente sin problemas
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No user JWT provided. User must be authenticated." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Instanciamos Supabase inyectando el header de auth (Puede ser el propio Anon Key de test.js u otro).
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Llamamos al RPC con SECURITY DEFINER que preparé. 
    // Éste se salta el RLS y simplemente retorna el Token, Email y Password encapsulados y desencriptados.
    const { data: dbData, error } = await supabase.rpc('get_active_dropi_token_server_side');

    if (error || !dbData || !dbData.token) {
      return new Response(JSON.stringify({ error: "Integración Dropi no activa o sin token en BD (Fallo interno).", details: error }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let dropiAuthHeader = `Bearer ${dbData.token}`;
    const url = new URL(req.url);
    const productId = url.searchParams.get("id");

    if (!productId) {
      return new Response(JSON.stringify({ error: "Missing product id param" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tryFetchProduct = async (authToken: string) => {
      // URL de la api reestablecida según lo que capturamos previamente en las trazas.
      const targetUrl = `https://api.dropi.co/api/products/productlist/v1/show/?id=${productId}`;
      const res = await fetch(targetUrl, {
        method: "GET",
        headers: { ...browserHeaders, "Authorization": authToken, "x-authorization": authToken }
      });
      return res;
    };

    let response = await tryFetchProduct(dropiAuthHeader);

    // Auto-Login wrapper just like dropi-orders
    if (response.status === 401) {
      console.log("[dropi-product] Dropi returned 401 Token is Expired. Engaging Auto-Login procedure...");
      
      if (!dbData.email || !dbData.password) {
          throw new Error("Dropi token expiró pero no hay credenciales (email y password) disponibles en la base de datos.");
      }
      
      const loginPayload = {
          email: dbData.email,
          password: dbData.password,
          white_brand_id: 10,
          brand: "",
          ipAddress: "190.27.10.13",
          otp: null,
          with_cdc: false
      };
      
      const loginRes = await fetch("https://api.dropi.co/api/login", {
          method: 'POST',
          headers: browserHeaders,
          body: JSON.stringify(loginPayload)
      });
      
      if (!loginRes.ok) {
          throw new Error(`Dropi auto-login falló con status ${loginRes.status}.`);
      }
      
      const loginData = await loginRes.json();
      if (!loginData.token) {
          throw new Error("Dropi auto-login no devolvió token");
      }
      
      console.log("[dropi-product] Auto-Login success. Updating database with new Token...");
      dropiAuthHeader = `Bearer ${loginData.token}`;
      
      // Ahora este edge function solo dispara hacia DB el insert. Si tiene RLS nos fallará `test.js` al actualizar,
      // Pero no es crítico pues loginData.token ya lo tenemos en memoria y funciona para la peticion actual.
      // Lo ideal a futuro es que otro RPC guarde si el test.js se usa.
      await supabase.from('integrations')
         .update({ token: loginData.token, updated_at: new Date().toISOString() })
         .eq('provider', 'dropi');
         
      console.log("[dropi-product] Retrying Fetch Product with new token...");
      response = await tryFetchProduct(dropiAuthHeader);
    }

    let data;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = { error: "Non-JSON response", text: await response.text() };
    }

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
