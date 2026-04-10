import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { browserHeaders } from "../_shared/dropi.ts"
import { getAdminClient, getDropiToken, callDropiWithAutoRelogin } from "../_shared/dropi-auth.ts"

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = getAdminClient();
    const auth = await getDropiToken(supabase);

    if (!auth.token) {
      return new Response(
        JSON.stringify({ error: "Integración Dropi no activa o token no disponible." }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Leer query params del request entrante
    const incomingUrl = new URL(req.url);
    const result_number = incomingUrl.searchParams.get('result_number') || '50';
    const start = incomingUrl.searchParams.get('start') || '1';
    const textToSearch = incomingUrl.searchParams.get('textToSearch') || '';
    const from_date = incomingUrl.searchParams.get('from_date_last_incidence') || '';
    const until_date = incomingUrl.searchParams.get('until_date_last_incidence') || '';

    const data = await callDropiWithAutoRelogin(supabase, auth, (bearerToken) => {
      const dropiUrl = new URL('https://api.dropi.co/api/orders/myorders');
      dropiUrl.searchParams.set('result_number', result_number);
      dropiUrl.searchParams.set('start', start);
      dropiUrl.searchParams.set('haveIncidenceProcesamiento', 'true');
      dropiUrl.searchParams.set('issue_solved_by_parent_order', 'false');
      if (textToSearch) dropiUrl.searchParams.set('textToSearch', textToSearch);
      if (from_date)    dropiUrl.searchParams.set('from_date_last_incidence', from_date);
      if (until_date)   dropiUrl.searchParams.set('until_date_last_incidence', until_date);

      return fetch(dropiUrl.toString(), {
        method: 'GET',
        headers: { ...browserHeaders, 'x-authorization': bearerToken },
      });
    });

    // Summarize to the most useful fields
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
        novedad_servientrega: order.novedad_servientrega,
        last_incidence_date: order.last_incidence_date,
        issue_solved_by_parent_order: order.issue_solved_by_parent_order,
        have_incidence_procesamiento: order.have_incidence_procesamiento,
        distribution_company: order.distribution_company,
        sticker: order.sticker,
        products: Array.isArray(order.products)
          ? order.products.map((p: any) => ({ id: p.id, name: p.name, quantity: p.quantity }))
          : [],
        total: order.total,
        created_at: order.created_at,
      }));
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
