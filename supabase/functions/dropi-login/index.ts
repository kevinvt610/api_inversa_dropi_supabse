import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"
import { browserHeaders } from "../_shared/dropi.ts"

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    
    // Request a la API de Dropi
    const response = await fetch('https://api.dropi.co/api/login', {
      method: 'POST',
      headers: browserHeaders,
      body: JSON.stringify(body)
    });
    
    let data;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = { error: "Non-JSON response from Dropi", text: await response.text() };
    }

    // Persistencia del Token en Supabase DB
    if (data.token) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        
        if (supabaseUrl && supabaseKey) {
            const supabase = createClient(supabaseUrl, supabaseKey);
            
            const { error: dbError } = await supabase
                .from('dropi_tokens')
                .upsert({ id: 1, token: data.token, updated_at: new Date().toISOString() });
                
            if (dbError) {
                console.error("Error al persistir token:", dbError);
            } else {
                console.log("Token insertado/actualizado exitosamente en DB.");
            }
        } else {
            console.error("⚠️ Faltan variables de entorno de Supabase.");
        }
    }

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})
