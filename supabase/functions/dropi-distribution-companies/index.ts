import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { browserHeaders } from "../_shared/dropi.ts"
import { getAdminClient, getDropiToken, callDropiWithAutoRelogin } from "../_shared/dropi-auth.ts"

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = getAdminClient();
    const auth = await getDropiToken(supabase);

    if (!auth.token) {
      return new Response(JSON.stringify({ error: "Integracion Dropi no activa o token no disponible." }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const targetUrl = `https://api.dropi.co/api/distribution_companies`;

    const data = await callDropiWithAutoRelogin(supabase, auth, (bearerToken) =>
      fetch(targetUrl, {
        method: 'GET',
        headers: { ...browserHeaders, 'x-authorization': bearerToken },
      })
    );

    // Permite al frontend filtrar fácilmente añadiendo ?visible_only=true
    const url = new URL(req.url);
    if (url.searchParams.get('visible_only') === 'true' && data.objects && Array.isArray(data.objects)) {
        data.objects = data.objects.filter((c: any) => c.is_visible === true);
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})
