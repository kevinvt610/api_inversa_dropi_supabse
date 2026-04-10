import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { browserHeaders } from "../_shared/dropi.ts"
import { getAdminClient, getDropiToken, callDropiWithAutoRelogin } from "../_shared/dropi-auth.ts"

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = getAdminClient();
    const auth = await getDropiToken(supabase);

    if (!auth.token) {
      return new Response(JSON.stringify({ error: "Integración Dropi no activa o token no disponible." }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body: any;
    try { body = await req.json(); }
    catch (_e) {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const data = await callDropiWithAutoRelogin(supabase, auth, (bearerToken) =>
      fetch('https://api.dropi.co/api/orders/cotizaEnvioTransportadoraV2', {
        method: 'POST',
        headers: { ...browserHeaders, 'x-authorization': bearerToken, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    );

    // Filter and sort carriers
    if (data?.objects && Array.isArray(data.objects)) {
      data.objects = data.objects.filter((t: any) => t.distributionCompany?.is_visible === true);
      data.objects.sort((a: any, b: any) => (a.objects?.precioEnvio || 0) - (b.objects?.precioEnvio || 0));
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})
