# 🗺️ API Dropi Proxy — Esquema Completo

> Ingeniería inversa de la API privada de Dropi, desplegada como Edge Functions en Supabase.  
> **Proyecto:** `jhwgtihnpceyvuaqlkgb` · **Base URL:** `https://jhwgtihnpceyvuaqlkgb.supabase.co/functions/v1`

---

## Arquitectura General

```
┌──────────────────────────────────────────────────────────────────┐
│                    TU APLICACIÓN (Frontend)                      │
│              React / Next.js / HTML+JS / Mobile                  │
└────────────────────────┬─────────────────────────────────────────┘
                         │  fetch() / axios  (sin tokens, sin CORS)
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│               SUPABASE EDGE FUNCTIONS (Proxy Inteligente)        │
│  ┌────────────────┐  ┌─────────────────────────────────────────┐ │
│  │  dropi_tokens  │  │  _shared/dropi.ts  (browserHeaders)     │ │
│  │  tabla en DB   │◄─┤  _shared/cors.ts   (CORS universal)     │ │
│  │  token JWT     │  └─────────────────────────────────────────┘ │
│  └────────────────┘                                              │
└────────────────────────┬─────────────────────────────────────────┘
                         │  fetch() con x-authorization + browser headers
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                     API PRIVADA DROPI                            │
│                    https://api.dropi.co                          │
└──────────────────────────────────────────────────────────────────┘
```

**Principios de diseño:**
- ✅ El frontend **nunca maneja tokens**. Solo llama a Supabase.
- ✅ Todos los endpoints inyectan `x-authorization` + `browserHeaders` que simulan Chrome en `app.seventyblock.com`.
- ✅ Tokens persistidos en tabla `dropi_tokens` (id=1) y reutilizados automáticamente.
- ✅ Respuestas filtradas y resumidas en el backend (menos KB al cliente).

---

## Módulos Compartidos (`_shared/`)

| Archivo | Propósito |
|---------|-----------|
| `_shared/cors.ts` | Header `Access-Control-Allow-Origin: *` global para todas las funciones |
| `_shared/dropi.ts` | `browserHeaders`: simula Chrome/Chromium 146 en `app.seventyblock.com` |

---

## Tabla de Endpoints

| # | Edge Function | Método | Dropi URL | Descripción |
|---|---------------|--------|-----------|-------------|
| 1 | `dropi-login` | POST | `/api/login` | Autenticación y persistencia de token |
| 2 | `dropi-orders` | GET | `/api/orders/myorders` | Listado paginado de órdenes |
| 3 | `dropi-departments` | GET | `/api/department/all/with-cities` | Catálogo geográfico Colombia (dptos + ciudades) |
| 4 | `dropi-create-order` | POST | `/api/orders/myorders` | Crear nueva orden de venta |
| 5 | `dropi-download-pdf` | GET | `/guias/{transportadora}/{sticker}` | Descarga binaria de guía PDF |
| 6 | `dropi-distribution-companies` | GET | `/api/distribution_companies` | Catálogo de transportadoras |
| 7 | `dropi-origin-city` | POST | `/api/orders/getOriginCityForCalculateShipping` | Bodega de origen para cotizar |
| 8 | `dropi-quote-shipping` | POST | `/api/orders/cotizaEnvioTransportadoraV2` | Cotizador multitransportadora |
| 9 | `dropi-product` | GET | `/api/products/{id}` | Ficha técnica de producto |
| 10 | `dropi-pending-incidences` | GET | `/api/orders/myorders` (filtrado) | Novedades logísticas pendientes |

---

## Flujos de Integración

### Flujo 1: Checkout Completo con Cotización

```
Usuario ingresa datos del pedido
         │
         ▼
[7] dropi-origin-city
    POST { id: PRODUCT_ID, destination: "bogota, cundinamarca", type: "SIMPLE" }
    ← { warehouse: { name, city: { cod_dane } } }
         │
         ▼
[8] dropi-quote-shipping
    POST { peso, largo, ancho, alto, ValorDeclarado, amount ← 🔑, ciudad_remitente, ciudad_destino, warehouse, products }
    ← { objects: [ { transportadora, distributionCompany.id, objects: { precioEnvio } } ] }
         │
    Usuario selecciona transportadora
         │
         ▼
[4] dropi-create-order
    POST { name, phone, state, city, dir, products, rate_type, distribution_company_id }
    ← { objects: { id ← guardar!, sticker, shipping_amount } }
         │
         ▼
[5] dropi-download-pdf
    GET ?transportadora=interrapidisimo&sticker=ORDEN-xxx-GUIA-xxx.pdf
    ← PDF binario (arraybuffer)
```

### Flujo 2: Formulario de Dirección (Selectores Geográficos)

```
[3] dropi-departments (sin params) → lista de departamentos → primer <select>
[3] dropi-departments?department_id=81 → ciudades del dpto → segundo <select>
```

### Flujo 3: Monitoreo de Novedades Logísticas

```
[10] dropi-pending-incidences?from_date_last_incidence=2026-03-22&until_date_last_incidence=2026-03-24
     ← [ { name, phone, novedad_servientrega, city, sticker } ]
          │
          ▼
     Bot WhatsApp / Dashboard de atención urgente
```

---

## Referencia Detallada por Endpoint

---

### 1. `dropi-login`
**`POST /dropi-login`**

Autentica al usuario en Dropi simulando cabeceras de Chrome y persiste el JWT en la tabla `dropi_tokens` (id=1) para que los demás endpoints lo usen automáticamente.

```json
// Request Body
{
  "email": "tu@email.com",
  "password": "tupassword",
  "white_brand_id": 10,
  "brand": "",
  "ipAddress": "190.27.10.13",
  "otp": null,
  "with_cdc": false
}

// Response clave
{ "token": "eyJhbGciOiJIUzI1NiJ9..." }
```

> **Frecuencia:** Ejecutar al iniciar la sesión. El token se guarda en DB y no necesita reenvío en llamadas posteriores.

---

### 2. `dropi-orders`
**`GET /dropi-orders?result_number=10&start=1`**

Lista paginada de órdenes. Lee token automáticamente de `dropi_tokens`.

| Param | Tipo | Descripción |
|-------|------|-------------|
| `result_number` | int | Órdenes por página (ej: `10`) |
| `start` | int | Página/offset (ej: `1`) |

```json
// Response (resumido)
{
  "objects": [
    { "id": 69985260, "name": "Kevin", "phone": "322...", "state": "EN_CAMINO",
      "sticker": "ORDEN-69985260-GUIA-xxx.pdf",
      "distribution_company": { "id": 4, "name": "INTERRAPIDISIMO" } }
  ]
}
```

---

### 3. `dropi-departments` (Optimizador Geográfico)
**`GET /dropi-departments`**

Three modos en una sola función via query params:

| Query Param | Resultado |
|-------------|-----------|
| *(sin params)* | Solo lista de 33 departamentos (liviano) |
| `?department_id=81` | Solo ciudades del departamento 81 |
| `?include_cities=true` | Árbol completo Colombia (para cache/cron) |

> **Importante:** El campo `rate_type` de cada ciudad indica si acepta CON/SIN RECAUDO. Usar para habilitar/deshabilitar el botón de pago contraentrega.

---

### 4. `dropi-create-order`
**`POST /dropi-create-order`**

Crea una orden en Dropi. El campo `calculate_costs_and_shiping: true` activa el cálculo automático de flete por parte de Dropi.

```json
// Request Body (campos clave)
{
  "calculate_costs_and_shiping": true,
  "state": "CUNDINAMARCA",
  "city": "BOGOTA",
  "name": "Kevin",
  "surname": "Villamil",
  "phone": "3224527647",
  "dir": "Cl 100 # 15-20",
  "rate_type": "CON RECAUDO",
  "type": "FINAL_ORDER",
  "total_order": 260000,
  "payment_method_id": 1,
  "products": [{ "id": 1297563, "price": 260000, "quantity": 1, "variation_id": null }]
}

// Response clave (guardar estos valores)
{
  "objects": {
    "id": 69985260,              // ← ID de la orden (para PDF y seguimiento)
    "sticker": "ORDEN-xxx.pdf", // ← nombre del archivo PDF
    "shipping_amount": 23530,   // ← costo de envío liquidado
    "dropshipper_amount_to_win": 9470 // ← ganancia neta
  }
}
```

---

### 5. `dropi-download-pdf`
**`GET /dropi-download-pdf?transportadora={nombre}&sticker={archivo}`**

Proxy binario. Descarga el PDF de la guía y lo retorna con `Content-Type: application/pdf`.

| Param | Ejemplo | Reglas |
|-------|---------|--------|
| `transportadora` | `interrapidisimo` | Siempre minúsculas. `ENVIA`/`SERVIENTREGA` → `servientrega` |
| `sticker` | `ORDEN-69985260-GUIA-xxx.pdf` | Extraer del campo `guia_urls3` de la orden (última parte tras `/`) |

```javascript
// Consumo correcto en frontend
const response = await axios.get('/dropi-download-pdf?transportadora=interrapidisimo&sticker=ORDEN-xxx.pdf',
  { responseType: 'arraybuffer' } // ← CRÍTICO
);
const blob = new Blob([response.data], { type: 'application/pdf' });
```

---

### 6. `dropi-distribution-companies`
**`GET /dropi-distribution-companies?visible_only=true`**

Catálogo de transportadoras. Con `?visible_only=true` filtra en servidor las que tienen `is_visible: false`.

```json
// Response
{ "objects": [
  { "id": 1, "name": "SERVIENTREGA", "is_visible": true },
  { "id": 4, "name": "INTERRAPIDISIMO", "is_visible": true }
]}
```

**IDs de transportadoras de referencia:**

| ID | Nombre | Clave en URL de PDF |
|----|--------|---------------------|
| 1  | SERVIENTREGA | `servientrega` |
| 2  | ENVIA | `servientrega` |
| 3  | COORDINADORA | `coordinadora` |
| 4  | INTERRAPIDISIMO | `interrapidisimo` |
| 5  | DOMINA | `domina` |
| 7  | VELOCES | `veloces` |
| 14 | TCC | `tcc` |

---

### 7. `dropi-origin-city`
**`POST /dropi-origin-city`**

Dado un producto y destino, retorna la bodega del proveedor desde donde saldrá el envío y su código DANE. Paso obligatorio antes de cotizar.

```json
// Request Body
{ "id": 1297563, "destination": "bogota, cundinamarca", "type": "SIMPLE" }

// Response clave
{
  "data": {
    "warehouse": { "name": "casa", "city": { "cod_dane": "25754000", "name": "SOACHA" } },
    "city_dropi": { "cod_dane": "25754000" }
  }
}
```

> Extraer: `data.warehouse?.city?.cod_dane || data.city_dropi?.cod_dane`

---

### 8. `dropi-quote-shipping`
**`POST /dropi-quote-shipping`**

Cotiza fletes en todas las transportadoras activas simultáneamente. La Edge Function ya filtra `is_visible: false` y ordena de menor a mayor por precio.

```json
// Request Body (campos críticos)
{
  "peso": 1, "largo": 10, "ancho": 10, "alto": 10,
  "ValorDeclarado": 260000,
  "amount": 260000,        // 🔑 IGUAL al precio de venta. Afecta comisión de recaudo (~3.5%)
  "EnvioConCobro": true,
  "insurance": false,
  "ciudad_remitente": { ... },  // Del paso anterior (dropi-origin-city)
  "ciudad_destino": { "id": 50, "name": "BOGOTA", "cod_dane": "11001000" },
  "warehouse": { ... },         // Del paso anterior (dropi-origin-city)
  "destination_name": "Cliente",
  "destination_phone": "3224527647",
  "products": [{ "id": 1297563, "quantity": 1, "type": "SIMPLE" }]
}

// Response
{
  "objects": [
    { "transportadora": "VELOCES", "distributionCompany": { "id": 7 },
      "objects": { "precioEnvio": 19350, "trayecto": "NACIONAL" } }
  ]
}
```

> ⚠️ **Error crítico:** Si `amount` ≠ precio real de venta, los precios cotizados diferirán $5,000-8,000 de los precios reales (impacto en comisión de recaudo).

---

### 9. `dropi-product`
**`GET /dropi-product?id=1297563`**

Ficha técnica de un producto por ID.

```json
// Response
{
  "objects": {
    "id": 14, "name": "Gancho para Pantalones",
    "stock": "300.00", "active": true,
    "sale_price": "10000.00", "suggested_price": "60000.00",
    "weight": "1.00", "length": "1.00", "width": "1.00", "height": "1.00"
  }
}
```

> ⚠️ Productos con `privated_product: true` y proveedor diferente retornan `400 No tiene permisos`. En ese caso usar dimensiones por defecto.

---

### 10. `dropi-pending-incidences`
**`GET /dropi-pending-incidences?from_date_last_incidence=yyyy-mm-dd&until_date_last_incidence=yyyy-mm-dd`**

Radar de novedades logísticas urgentes. Filtra automáticamente `haveIncidenceProcesamiento=true` e `issue_solved_by_parent_order=false`. Entrega solo los campos accionables.

| Param | Descripción |
|-------|-------------|
| `result_number` | Cuántas novedades (default: 50) |
| `from_date_last_incidence` | Fecha desde (yyyy-mm-dd). Fecha del reporte de la transportadora |
| `until_date_last_incidence` | Fecha hasta (yyyy-mm-dd) |
| `textToSearch` | Buscar por nombre de cliente o referencia |

```json
// Response (cada novedad)
{
  "id": 25287007, "reference": "REF-xxx", "state": "EN_CAMINO",
  "name": "John Jairo", "phone": "3137009557",
  "city": "PEREIRA", "address": "Cra 15 # 22-10",
  "novedad_servientrega": "DIRECCION ERRADA",
  "distribution_company": "SERVIENTREGA",
  "sticker": "ORDEN-xxx-GUIA-xxx.pdf"
}
```

---

## Autenticación — Diagrama de Token

```
Primera vez:
  POST /dropi-login → token en dropi_tokens (id=1)

Cada llamada posterior:
  Edge Function lee dropi_tokens → Bearer token → x-authorization a Dropi

Frontend: NO maneja tokens. Solo llama a Supabase con Content-Type: application/json
```

---

## Variables de Entorno

```env
# .env local para test.js
DROPI_EMAIL=tu@email.com
DROPI_PASSWORD=tupassword
PROJECT_URL=https://jhwgtihnpceyvuaqlkgb.supabase.co/functions/v1

# Secretos en Supabase (configurados por CLI/Dashboard)
SUPABASE_URL=https://jhwgtihnpceyvuaqlkgb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

## Tabla de la Base de Datos

```sql
-- Única tabla requerida
CREATE TABLE dropi_tokens (
  id        integer PRIMARY KEY DEFAULT 1,
  token     text,
  updated_at timestamptz DEFAULT now()
);
```

---

## Estructura de Archivos del Proyecto

```
api_dropi/
├── .env                          # Variables locales (no commitear)
├── .env.example                  # Plantilla de variables
├── test.js                       # CLI interactivo con menú (opciones 0-7)
├── README.md                     # Introducción + enlace a este esquema
├── progreso/                     # Documentación por etapas
│   ├── INDEX.md                  # Índice de endpoints
│   ├── etapa_1.md               # Ingeniería inversa y setup inicial
│   ├── estapa_2_cities_departament.md
│   ├── etapa_3_crear_orden.md
│   ├── etapa_4_descargar_pdf.md
│   ├── etapa_5_transportadoras.md
│   ├── etapa_6_origin_city.md
│   ├── etapa_7_cotizador_fletes.md
│   ├── etapa_8_producto.md
│   └── etapa_9_novedades_pendientes.md
└── supabase/
    └── functions/
        ├── _shared/
        │   ├── cors.ts           # Cabeceras CORS universales
        │   └── dropi.ts          # Browser headers (Chromium 146)
        ├── dropi-login/
        ├── dropi-orders/
        ├── dropi-departments/
        ├── dropi-create-order/
        ├── dropi-download-pdf/
        ├── dropi-distribution-companies/
        ├── dropi-origin-city/
        ├── dropi-quote-shipping/
        ├── dropi-product/
        └── dropi-pending-incidences/
```
