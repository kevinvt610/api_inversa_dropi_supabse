import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { getAdminClient, getDropiToken, callDropiWithAutoRelogin } from "../_shared/dropi-auth.ts"
import { browserHeaders } from "../_shared/dropi.ts"

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
      return new Response(JSON.stringify({ error: "Integración Dropi no activa o token no disponible." }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const filterDeptId = url.searchParams.get('department_id');
    const includeCities = url.searchParams.get('include_cities') === 'true';

    const targetUrl = `https://api.dropi.co/api/department/all/with-cities`;

    const data = await callDropiWithAutoRelogin(supabase, auth, (bearerToken) =>
      fetch(targetUrl, {
        method: 'GET',
        headers: { ...browserHeaders, 'x-authorization': bearerToken },
      })
    );

    // Apply filters on the response
    if (data && data.objects && Array.isArray(data.objects)) {
      if (filterDeptId) {
        // Return only cities of the requested department
        const dept = data.objects.find((d: any) => d.id.toString() === filterDeptId);
        data.objects = dept ? (dept.cities || []) : [];
        data.count = data.objects.length;
      } else if (!includeCities) {
        // Default: return only departments (strip city arrays)
        data.objects = data.objects.map((dept: any) => {
          const { cities, ...deptData } = dept;
          return deptData;
        });
      }
      // include_cities=true → return full hierarchy as-is
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
