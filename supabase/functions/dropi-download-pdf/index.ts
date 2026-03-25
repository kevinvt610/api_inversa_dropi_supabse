import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"
import { browserHeaders } from "../_shared/dropi.ts"

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    // Obtener Token de la BD si no viene explicito
    let authHeader = req.headers.get('Authorization'); 
    if (!authHeader && supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data: dbData } = await supabase.from('dropi_tokens').select('token').eq('id', 1).single();
        if (dbData && dbData.token) {
            authHeader = `Bearer ${dbData.token}`;
        }
    }

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No Token Provided or Found" }), {
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

    // Ruta a Dropi para el PDF
    const targetUrl = `https://api.dropi.co/guias/${transportadora}/${sticker}`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: { 
          ...browserHeaders, 
          'Authorization': authHeader,
          'x-authorization': authHeader,
          'Accept': 'application/pdf'
      }
    });

    if (!response.ok) {
        return new Response(JSON.stringify({ error: `Dropi responded with ${response.status}`, details: await response.text() }), {
            status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
    
    // Devolver el binario PDF directamente
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
