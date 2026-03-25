import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"
import { browserHeaders } from "../_shared/dropi.ts"

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    let authHeader = req.headers.get('Authorization'); 
    if (!authHeader && supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data: dbData } = await supabase.from('dropi_tokens').select('token').eq('id', 1).single();
        if (dbData && dbData.token) authHeader = `Bearer ${dbData.token}`;
    }

    if (!authHeader) return new Response(JSON.stringify({ error: "No Token" }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    let body;
    try { body = await req.json(); } catch (e) { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

    const targetUrl = `https://api.dropi.co/api/orders/getOriginCityForCalculateShipping`;
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { ...browserHeaders, 'Authorization': authHeader, 'x-authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    const data = await response.json().catch(async () => ({ error: "Non-JSON response", text: await response.text() }));

    return new Response(JSON.stringify(data), {
      status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
})
