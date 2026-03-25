# API Dropi Proxy — Índice de Endpoints

Todos los endpoints están desplegados como Edge Functions en Supabase.  
**Base URL:** `https://jhwgtihnpceyvuaqlkgb.supabase.co/functions/v1`

---

## Mapa de Endpoints

| Etapa | Archivo | Edge Function | Método | Descripción |
|-------|---------|---------------|--------|-------------|
| [1](./etapa_1.md) | `dropi-login` | `/dropi-login` | `POST` | Login y persistencia de token |
| [2](./estapa_2_cities_departament.md) | `dropi-departments` | `/dropi-departments` | `GET` | Filtros geográficos (departamentos y ciudades) |
| [3](./etapa_3_crear_orden.md) | `dropi-create-order` | `/dropi-create-order` | `POST` | Crear una orden de venta |
| [4](./etapa_4_descargar_pdf.md) | `dropi-download-pdf` | `/dropi-download-pdf` | `GET` | Descargar guía PDF de envío |
| [5](./etapa_5_transportadoras.md) | `dropi-distribution-companies` | `/dropi-distribution-companies` | `GET` | Listar transportadoras disponibles |
| [6](./etapa_6_origin_city.md) | `dropi-origin-city` | `/dropi-origin-city` | `POST` | Obtener bodega de origen del producto |
| [7](./etapa_7_cotizador_fletes.md) | `dropi-quote-shipping` | `/dropi-quote-shipping` | `POST` | Cotizar fletes multitransportadora |
| [8](./etapa_8_producto.md) | `dropi-product` | `/dropi-product` | `GET` | Consultar ficha técnica de un producto |

---

## Flujo Principal: Checkout con Cotización

```
Usuario llena formulario de orden
         │
         ▼
[Etapa 6] dropi-origin-city
  → Entrada: { id: PRODUCTO_ID, destination: "ciudad, dpto", type: "SIMPLE" }
  → Salida: warehouse + cod_dane origen
         │
         ▼
[Etapa 7] dropi-quote-shipping
  → Entrada: dims + precio + ciudades + warehouse
  → Salida: tabla de precios por transportadora (ordenada menor→mayor)
         │
    Usuario elige transportadora
         │
         ▼
[Etapa 3] dropi-create-order
  → Entrada: datos cliente + producto + distributionCompany.id
  → Salida: orden creada con sticker (nombre del PDF)
         │
         ▼
[Etapa 4] dropi-download-pdf
  → Entrada: ?transportadora={nombre}&sticker={archivo.pdf}
  → Salida: archivo PDF binario (guía rotulo)
```

---

## Autenticación

Todos los endpoints leen el token automáticamente desde la tabla `dropi_tokens` en Supabase.  
**No necesitas enviar Authorization header desde el frontend.**

El token se renueva ejecutando:
```
POST /dropi-login
{ "email": "...", "password": "..." }
```

---

## Variables de Entorno Requeridas

```env
DROPI_EMAIL=tu@email.com
DROPI_PASSWORD=tupassword
SUPABASE_URL=https://jhwgtihnpceyvuaqlkgb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```
