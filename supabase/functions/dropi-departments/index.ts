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
    
    // Primero intentamos recuperar del Header por si el cliente lo manda forzado
    let authHeader = req.headers.get('Authorization'); 
    
    // Si no lo mandan directo, lo buscamos en la DB persistida
    if (!authHeader && supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data: dbData, error } = await supabase
            .from('dropi_tokens')
            .select('token')
            .eq('id', 1)
            .single();
            
        if (dbData && dbData.token) {
            authHeader = `Bearer ${dbData.token}`;
        } else if (error) {
            console.error("Error buscando token en DB:", error);
        }
    }

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No Authorization header provided nor token found in DB." }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const filterDeptId = url.searchParams.get('department_id');
    const includeCities = url.searchParams.get('include_cities') === 'true';

    const targetUrl = `https://api.dropi.co/api/department/all/with-cities`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: { 
          ...browserHeaders, 
          'Authorization': authHeader,
          'x-authorization': authHeader
      }
    });
    
    let data: any;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
      
      // Aplicar filtros
      if (data && data.objects && Array.isArray(data.objects)) {
          if (filterDeptId) {
              // 1. Si mandan department_id, devolvemos SOLO las ciudades de ese departamento
              const dept = data.objects.find((d: any) => d.id.toString() === filterDeptId);
              if (dept) {
                  data.objects = dept.cities || [];
                  data.count = data.objects.length;
              } else {
                  data.objects = [];
                  data.count = 0;
              }
          } else if (!includeCities) {
              // 2. Por defecto (sin params), devolvemos SÓLO los departamentos (quitamos el arreglo gigante de cities)
              data.objects = data.objects.map((dept: any) => {
                  const { cities, ...deptData } = dept;
                  return deptData;
              });
          }
          // 3. Si mandan include_cities=true y no hay filterDeptId, devuelve todo tal cual (jerarquía completa)
      }

    } else {
      data = { error: "Non-JSON response from Dropi or Error", text: await response.text() };
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
