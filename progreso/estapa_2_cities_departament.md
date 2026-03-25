# Etapa 2: Unificación de Departamentos y Ciudades

## Contexto
Durante la implementación teórica de los flujos de Dropi, íbamos a estructurar las peticiones geográficas en dos Endpoints distintos (`dropi-departments` y `dropi-cities`). Sin embargo, identificamos una "super consulta" no documentada llamada `All-in-One`:
`GET https://api.dropi.co/api/department/all/with-cities`

Al descubrir que este endpoint carga de golpe el mapeo completo de departamentos en la base de datos de Dropi junto a todas sus ciudades anidadas, tomamos la decisión técnica de **eliminar `dropi-cities` y consolidar todo en `dropi-departments`**.

---

## La Nueva Arquitectura: `dropi-departments`

Esta Edge Function en Supabase actúa como un proxy inteligente. Siempre consulta el catálogo pesado hacia Dropi de manera interna servidor-a-servidor, y luego aplica **filtros en memoria** con base en los *Query Params* del cliente (tu página web), reduciendo brutalmente los megabytes y el esfuerzo de renderizado de la parte visual.

### Código Oficial de la Edge Function

```typescript
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
    
    // Autenticación principal o fallback a caché de BD
    let authHeader = req.headers.get('Authorization'); 
    if (!authHeader && supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data: dbData } = await supabase.from('dropi_tokens').select('token').eq('id', 1).single();
        if (dbData && dbData.token) authHeader = `Bearer ${dbData.token}`;
    }

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No Token" }), { status: 401, headers: corsHeaders });
    }

    // 1. Extraemos nuestras Query Params
    const url = new URL(req.url);
    const filterDeptId = url.searchParams.get('department_id');
    const includeCities = url.searchParams.get('include_cities') === 'true';

    // 2. Traemos TODO el país desde Supabase (súper veloz)
    const targetUrl = `https://api.dropi.co/api/department/all/with-cities`;
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: { ...browserHeaders, 'Authorization': authHeader, 'x-authorization': authHeader }
    });
    
    let data: any = await response.json();
      
    // 3. Aplicamos ingeniería y filtros de datos 
    if (data && data.objects && Array.isArray(data.objects)) {
        if (filterDeptId) {
            // MODO CIUDADES: Rescato solo el departamento por ID y devuelvo puro arreglo de ciudades.
            const dept = data.objects.find((d: any) => d.id.toString() === filterDeptId);
            data.objects = dept ? (dept.cities || []) : [];
            data.count = data.objects.length;
        } else if (!includeCities) {
            // MODO DEPARTAMENTO: Descompongo toda la información inmensa del País, 
            // le arranco la parte de "Cities" y retorno un arreglo liviano de lugares principales.
            data.objects = data.objects.map((dept: any) => {
                const { cities, ...deptData } = dept;
                return deptData;
            });
        }
    }

    return new Response(JSON.stringify(data), {
      status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
})
```

---

## Modos de Uso y Filtrado (Para el Frontend)

Toda vez que hagas una solicitud desde el frontend (ej. un formulario para una nueva orden), jugarás con esta misma URL jugando con las Query Params.

### 1. Pedir SÓLO la lista de Departamentos
Ideal para llenar el `primer Dropdown` (Selector de Departamentos).
- **Endpoint a golpear:** `GET /functions/v1/dropi-departments`
- **¿Qué Pasa?** Omite todos los detalles y el anidamiento.
- **Respuesta (Aprox 33 items):**
```json
{
  "id": 81,
  "name": "AMAZONAS",
  "country_id": 1,
  "department_code": null
}
```

### 2. Pedir las Ciudades de UN Departamento
Ideal para llenar el `segundo Dropdown` luego de que el usuario llenara el primero.
- **Endpoint a golpear:** `GET /functions/v1/dropi-departments?department_id=81` (Cambia 81 por la ciudad en memoria).
- **¿Qué Pasa?** Recorta todo Colombia, se mete a "Amazonas" (o el depto elegido), recolecta todas las ciudades e ignorando la etiqueta "departamento" te devuelve un array crudo de ciudades.
- **Respuesta:**
```json
{
  "id": 1222,
  "department_id": 81,
  "name": "LETICIA",
  "rate_type": "[]",
  "trajectory_type": "TRAYECTO ESPECIAL",
  "cod_dane": "91001000"
}
```
*Crucial el dato de RateType "[\"SIN RECAUDO\"]" para habilitar o deshabilitar tu botón de Pago contra Entrega.*

### 3. Pedir TODA La Estructura (Árbol Completo - Modo Respaldo)
Llega a ser útil si piensas diseñar un proceso cron job o un worker asíncrono que agarre todo esto una sola vez a media noche, y lo encierre directo en un LocalStorage o tu Base de datos de Supabase. Te olvidarías de llamar a internet por completo.
- **Endpoint:** `GET /functions/v1/dropi-departments?include_cities=true`
