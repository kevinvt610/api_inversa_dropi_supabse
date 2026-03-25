import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"
import { browserHeaders } from "../_shared/dropi.ts"

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    let authHeader = req.headers.get('Authorization');

    if (!authHeader && supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data: dbData } = await supabase.from('dropi_tokens').select('token').eq('id', 1).single();
      if (dbData?.token) authHeader = `Bearer ${dbData.token}`;
    }

    if (!authHeader) return new Response(
      JSON.stringify({ error: "No Token" }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    // Leer query params del request entrante
    const incomingUrl = new URL(req.url);
    const result_number = incomingUrl.searchParams.get('result_number') || '50';
    const start = incomingUrl.searchParams.get('start') || '1';
    const textToSearch = incomingUrl.searchParams.get('textToSearch') || '';
    const from_date = incomingUrl.searchParams.get('from_date_last_incidence') || '';
    const until_date = incomingUrl.searchParams.get('until_date_last_incidence') || '';

    // Construir URL hacia Dropi
    const dropiUrl = new URL('https://api.dropi.co/api/orders/myorders');
    dropiUrl.searchParams.set('result_number', result_number);
    dropiUrl.searchParams.set('start', start);
    // Parámetros fijos que definen este endpoint como "novedades pendientes"
    dropiUrl.searchParams.set('haveIncidenceProcesamiento', 'true');
    dropiUrl.searchParams.set('issue_solved_by_parent_order', 'false');

    if (textToSearch) dropiUrl.searchParams.set('textToSearch', textToSearch);
    if (from_date)    dropiUrl.searchParams.set('from_date_last_incidence', from_date);
    if (until_date)   dropiUrl.searchParams.set('until_date_last_incidence', until_date);

    const response = await fetch(dropiUrl.toString(), {
      method: 'GET',
      headers: { ...browserHeaders, 'Authorization': authHeader, 'x-authorization': authHeader }
    });

    const data = await response.json().catch(async () => ({
      error: "Non-JSON response",
      text: await response.text()
    }));

    // Resumir los campos más útiles para no transferir payloads gigantes
    if (data?.objects && Array.isArray(data.objects)) {
      data.objects = data.objects.map((order: any) => ({
        id: order.id,
        reference: order.reference,
        state: order.state,
        name: order.name,
        phone: order.phone,
        department: order.department,
        city: order.city,
        address: order.address,
        // Novedad / incidencia actual
        novedad_servientrega: order.novedad_servientrega,
        last_incidence_date: order.last_incidence_date,
        issue_solved_by_parent_order: order.issue_solved_by_parent_order,
        have_incidence_procesamiento: order.have_incidence_procesamiento,
        // Transportadora
        distribution_company: order.distribution_company,
        sticker: order.sticker,
        // Producto resumido
        products: Array.isArray(order.products)
          ? order.products.map((p: any) => ({
              id: p.id,
              name: p.name,
              quantity: p.quantity,
            }))
          : [],
        total: order.total,
        created_at: order.created_at,
      }));
    }

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
