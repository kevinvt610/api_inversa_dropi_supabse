import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"
import { browserHeaders } from "../_shared/dropi.ts"

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: "Method Not Allowed, expected POST" }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    // 1. Obtener Token de la BD si no viene explicito
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

    // 2. Parsear el cuerpo enviado por el cliente
    let body;
    try {
        body = await req.json();
    } catch (e) {
        return new Response(JSON.stringify({ error: "Invalid JSON body provided to Edge Function" }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // 3. Redirigir a Dropi
    const targetUrl = `https://api.dropi.co/api/orders/myorders`;
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 
          ...browserHeaders, 
          'Authorization': authHeader,
          'x-authorization': authHeader
      },
      body: JSON.stringify(body)
    });
    
    let data;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = { error: "Non-JSON response from Dropi or Error", text: await response.text() };
    }

    // 4. Retornarle al cliente exactamente lo que dijo Dropi, con su mismo status (ej 400 si falta un campo)
    return new Response(JSON.stringify(data), {
      status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})
