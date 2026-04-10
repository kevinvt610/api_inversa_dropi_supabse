import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { browserHeaders } from "../_shared/dropi.ts"
import { getAdminClient, getDropiToken, reloginDropi } from "../_shared/dropi-auth.ts"

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = getAdminClient();
    const auth = await getDropiToken(supabase);

    if (!auth.token) {
      return new Response(JSON.stringify({ error: "Integracion Dropi no activa o token no disponible." }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const transportadora = url.searchParams.get('transportadora');
    const sticker = url.searchParams.get('sticker');

    if (!transportadora || !sticker) {
      return new Response(JSON.stringify({ error: "Missing transportadora or sticker params" }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const targetUrl = `https://api.dropi.co/guias/${transportadora}/${sticker}`;

    const fetchPdf = async (token: string) => {
      return await fetch(targetUrl, {
        method: 'GET',
        headers: { 
          ...browserHeaders, 
          'x-authorization': `Bearer ${token}`,
          'Accept': 'application/pdf'
        }
      });
    };

    let response = await fetchPdf(auth.token);

    // If unauthorized, retry once
    if (response.status === 401 && auth.email && auth.password) {
      console.log("[dropi-download-pdf] 401 Unauthorized for PDF. Attempting auto-relogin...");
      const newToken = await reloginDropi(supabase, auth.email, auth.password);
      if (newToken) {
        response = await fetchPdf(newToken);
      }
    }

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Dropi responded with ${response.status}`, details: await response.text() }), {
        status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const arrayBuffer = await response.arrayBuffer();

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${sticker}"`
      },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})
