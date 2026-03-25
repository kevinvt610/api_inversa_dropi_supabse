import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"
import { browserHeaders } from "../_shared/dropi.ts"

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
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

    const targetUrl = `https://api.dropi.co/api/distribution_companies`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: { 
          ...browserHeaders, 
          'Authorization': authHeader,
          'x-authorization': authHeader
      }
    });
    
    let data;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = { error: "Non-JSON response from Dropi or Error", text: await response.text() };
    }

    // Permite al frontend filtrar fácilmente añadiendo ?visible_only=true
    const url = new URL(req.url);
    if (url.searchParams.get('visible_only') === 'true' && data.objects && Array.isArray(data.objects)) {
        data.objects = data.objects.filter((c: any) => c.is_visible === true);
    }

    return new Response(JSON.stringify(data), {
      status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})
