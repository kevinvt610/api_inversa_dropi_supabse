# Etapa 9 — Novedades Pendientes (`dropi-pending-incidences`)

## ¿Qué hace este endpoint?

Devuelve el listado de **órdenes con problemas logísticos activos** que aún no han sido gestionados. Internamente reutiliza el endpoint `/api/orders/myorders` de Dropi pero con dos filtros fijos que lo convierten en un radar de novedades urgentes:

- `haveIncidenceProcesamiento=true` → solo órdenes con un problema logístico abierto
- `issue_solved_by_parent_order=false` → solo las que **tú aún no has gestionado**

**Propósito clave:** Detectar pedidos "enfermos" en tránsito que requieren acción (cambio de dirección, reagendamiento, contacto al cliente) para evitar devoluciones.

---

## Detalles Técnicos

| Campo | Valor |
|-------|-------|
| **Edge Function** | `dropi-pending-incidences` |
| **URL Supabase** | `GET {SUPABASE_URL}/functions/v1/dropi-pending-incidences` |
| **URL Dropi** | `GET https://api.dropi.co/api/orders/myorders?haveIncidenceProcesamiento=true&issue_solved_by_parent_order=false&...` |
| **Método** | `GET` |
| **Auth** | Token inyectado automáticamente desde `dropi_tokens` |

---

## Request — Qué debes enviar (Query Params)

```
GET /dropi-pending-incidences?result_number=20&start=1&from_date_last_incidence=2026-03-22&until_date_last_incidence=2026-03-24
```

| Parámetro                    | Tipo     | Requerido | Descripción |
|------------------------------|----------|-----------|-------------|
| `result_number`              | `number` | No        | Novedades por página. Default: `50`. |
| `start`                      | `number` | No        | Offset de paginación. Default: `1`. |
| `textToSearch`               | `string` | No        | Buscar por nombre de cliente, referencia, etc. |
| `from_date_last_incidence`   | `string` | No        | Fecha inicio del filtro. Formato: `yyyy-mm-dd`. Filtra por cuándo la transportadora reportó el problema, **no** por fecha de creación de la orden. |
| `until_date_last_incidence`  | `string` | No        | Fecha fin del filtro. Formato: `yyyy-mm-dd`. |

> **Nota:** Los parámetros `haveIncidenceProcesamiento=true` e `issue_solved_by_parent_order=false` son **inyectados automáticamente** por la Edge Function. No los envíes manualmente.

---

## Response — Qué devuelve

La Edge Function resume cada orden para no transferir el payload gigante de Dropi. Solo entrega los campos accionables:

```json
{
  "isSuccess": true,
  "count": 12,
  "objects": [
    {
      "id": 69985260,
      "reference": "ORD-69985260",
      "state": "EN_CAMINO",
      "name": "Kevin Villamil",
      "phone": "3224527647",
      "department": "CUNDINAMARCA",
      "city": "BOGOTA",
      "address": "Cll 100 # 15-20",
      "novedad_servientrega": "CERRADO POR VACACIONES",
      "last_incidence_date": "2026-03-22",
      "issue_solved_by_parent_order": false,
      "have_incidence_procesamiento": true,
      "distribution_company": "SERVIENTREGA",
      "sticker": "ORDEN-69985260-GUIA-240048852883.pdf",
      "products": [
        { "id": 1297563, "name": "ESPADA MOTOSIERRA ec", "quantity": 1 }
      ],
      "total": "270000.00",
      "created_at": "2026-03-18T00:00:00.000000Z"
    }
  ]
}
```

### Campos clave de cada novedad

| Campo                        | Descripción |
|------------------------------|-------------|
| `id`                         | ID de la orden. Usar con `dropi-download-pdf` para descargar la guía. |
| `reference`                  | Referencia visible al cliente. |
| `state`                      | Estado actual de la orden en Dropi. |
| `name` / `phone`             | 📱 Datos de contacto del destinatario. **Usar para WhatsApp automático.** |
| `city` / `address`           | Dirección de entrega del cliente. |
| `novedad_servientrega` 🔑    | **Descripción del problema** reportado por la transportadora (ej: `"CERRADO POR VACACIONES"`, `"DIRECCIÓN INCORRECTA"`). |
| `last_incidence_date`        | Fecha en que la transportadora reportó el problema. |
| `issue_solved_by_parent_order` | `false` = novedad activa sin gestionar. |
| `distribution_company`       | Nombre de la transportadora. |
| `sticker`                    | Nombre del archivo PDF de la guía. Usar con `dropi-download-pdf`. |
| `products`                   | Productos resumidos de la orden. |

---

## Casos de uso principales

### 1. Bot de WhatsApp para novedades
```javascript
const novedades = response.objects;
for (const orden of novedades) {
  await sendWhatsApp(orden.phone, 
    `Hola ${orden.name}, tu pedido ${orden.reference} tiene una novedad: "${orden.novedad_servientrega}". 
     Por favor confirma tu dirección o programa una nueva entrega.`
  );
}
```

### 2. Dashboard de novedades urgentes
```javascript
// Las más antiguas sin gestionar primero
const urgentes = novedades.sort((a, b) => 
  new Date(a.last_incidence_date) - new Date(b.last_incidence_date)
);
```

### 3. Monitoreo diario automático
```
GET /dropi-pending-incidences?from_date_last_incidence=2026-03-24&until_date_last_incidence=2026-03-24
```

---

## Errores comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `401 No Token` | No hay token en `dropi_tokens` | Ejecutar login primero |
| Array `objects` vacío | No hay novedades en ese rango de fechas | Ampliar el rango de fechas |
| `novedad_servientrega` null | La transportadora no envió mensaje de novedad | Revisar el historial de movimientos de la orden |

---

## Ejemplo completo en JavaScript (Frontend)

```javascript
async function obtenerNovedadesPendientes(desde, hasta) {
  const params = new URLSearchParams({ result_number: '50', start: '1' });
  if (desde) params.set('from_date_last_incidence', desde);
  if (hasta) params.set('until_date_last_incidence', hasta);

  const response = await fetch(
    `https://<PROJECT_ID>.supabase.co/functions/v1/dropi-pending-incidences?${params}`
  );
  const json = await response.json();
  return json.objects || [];
}

// Uso:
const novedades = await obtenerNovedadesPendientes('2026-03-22', '2026-03-24');
console.log(`${novedades.length} órdenes con problemas logísticos activos`);
```
