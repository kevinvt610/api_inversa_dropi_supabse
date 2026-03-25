# Etapa 8 — Consultar Producto (`dropi-product`)

## ¿Qué hace este endpoint?

Devuelve la ficha técnica completa de un producto específico de Dropi dado su ID. Incluye nombre, descripción, precios, dimensiones, stock, imágenes y datos del proveedor.

**Propósito clave:** Obtener las dimensiones reales del producto (peso, largo, ancho, alto) para calcular fletes con precisión. También permite mostrar la ficha del producto en el frontend antes de que el usuario cree la orden.

> ⚠️ **Limitación conocida:** Este endpoint requiere que el usuario autenticado tenga permisos sobre el producto. Productos con `privated_product: true` que no pertenecen al usuario logueado devuelven `400 No tiene permisos`. En ese caso, usa dimensiones por defecto o pide al usuario que ingrese los datos manualmente.

---

## Detalles Técnicos

| Campo | Valor |
|-------|-------|
| **Edge Function** | `dropi-product` |
| **URL Supabase** | `GET {SUPABASE_URL}/functions/v1/dropi-product?id={IDPRODUCTO}` |
| **URL Dropi** | `GET https://api.dropi.co/api/products/{IDPRODUCTO}` |
| **Método** | `GET` |
| **Auth** | Token inyectado automáticamente desde `dropi_tokens` |

---

## Request — Qué debes enviar

```
GET /functions/v1/dropi-product?id=1297563
```

### Parámetros de Query String

| Parámetro | Tipo     | Requerido | Descripción |
|-----------|----------|-----------|-------------|
| `id`      | `number` | ✅ Sí     | ID numérico del producto en Dropi. Se pasa como query param en la URL. |

---

## Response — Qué devuelve (cuando es exitoso)

```json
{
  "isSuccess": true,
  "status": 200,
  "objects": {
    "id": 14,
    "name": "Gancho para Pantalones",
    "description": "<p>Gancho para pantalones de 15 cm</p>",
    "type": "SIMPLE",
    "sku": "gancho-ropa-23",
    "active": true,
    "privated_product": false,
    "stock": "300.00",
    "sale_price": "10000.00",
    "suggested_price": "60000.00",
    "weight": "1.00",
    "length": "0.00",
    "width": "1.00",
    "height": "0.00",
    "gallery": [
      { "urlS3": "colombia/products/14/imagen.jpg" }
    ],
    "categories": [
      { "id": 5, "name": "Accesorios" }
    ],
    "warehouse_product": [
      {
        "stock": 300,
        "warehouse": {
          "id": 19069,
          "name": "casa",
          "city": { "cod_dane": "25754000", "name": "SOACHA" }
        }
      }
    ]
  }
}
```

### Campos clave de la respuesta

| Campo en `objects`       | Descripción |
|--------------------------|-------------|
| `id`                     | ID del producto. |
| `name`                   | Nombre del producto para mostrar. |
| `description`            | Descripción en HTML. |
| `type`                   | `"SIMPLE"` o `"VARIABLE"`. |
| `sku`                    | Código de referencia del proveedor. |
| `active`                 | `true` si está disponible para venta. |
| `privated_product`       | `true` si es producto privado (acceso restringido). |
| `stock`                  | Stock disponible (string numérico). |
| `sale_price`             | **Precio de costo** para el dropshipper. |
| `suggested_price`        | **Precio sugerido de venta** al público. |
| `weight` 🔑              | Peso en kg. Usar en cotización de fletes. |
| `length` 🔑              | Largo en cm. Usar en cotización de fletes. |
| `width` 🔑               | Ancho en cm. Usar en cotización de fletes. |
| `height` 🔑              | Alto en cm. Usar en cotización de fletes. |
| `gallery[0].urlS3`       | Ruta S3 de la imagen. Concatenar con CDN para mostrar. |
| `warehouse_product`      | Inventario por bodega con ciudad y stock. |

---

## Cómo usar la respuesta (en código)

```javascript
const response = await fetch(
  '{SUPABASE_URL}/functions/v1/dropi-product?id=1297563'
);
const json = await response.json();

if (!json.isSuccess) {
  // Manejar error: producto privado, no encontrado, etc.
  console.error(json.message);
  return;
}

const producto = json.objects;

// Dimensiones para el cotizador
const dims = {
  peso: parseFloat(producto.weight) || 1,
  largo: parseFloat(producto.length) || 1,
  ancho: parseFloat(producto.width) || 1,
  alto: parseFloat(producto.height) || 1,
};

// Precio para el cotizador
const precioVenta = parseFloat(producto.suggested_price) || 0;
```

---

## Errores comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `400 No tiene permisos para ver este producto` | El producto es privado o no pertenece al proveedor del token | Usar dimensiones por defecto (1×1×1×1) o permitir ingreso manual |
| `404 Not Found` | El ID no existe en Dropi | Verificar que el ID sea correcto |
| `401 No Token` | No hay token guardado en `dropi_tokens` | Ejecutar login primero (`dropi-login`) |

---

## Ejemplo completo en JavaScript (Frontend)

```javascript
async function obtenerProducto(productId) {
  const response = await fetch(
    `https://<PROJECT_ID>.supabase.co/functions/v1/dropi-product?id=${productId}`
  );
  const json = await response.json();

  if (!json.isSuccess) {
    // Fallback: producto privado → usar dims por defecto
    console.warn('Producto privado o no accesible, usando dimensiones por defecto');
    return {
      id: productId,
      weight: 1, length: 10, width: 10, height: 10,
      suggested_price: null, sale_price: null
    };
  }

  return json.objects;
}
```

---

## Integración con el Cotizador

El resultado de este endpoint alimenta directamente al cotizador de fletes:

```javascript
const producto = await obtenerProducto(id);

// Paso 1: obtener ciudad origen
const originData = await obtenerCiudadOrigen(producto.id, destinoTexto);

// Paso 2: cotizar con dimensiones reales del producto
const tarifas = await cotizarFlete({
  peso: parseFloat(producto.weight),
  largo: parseFloat(producto.length),
  ancho: parseFloat(producto.width),
  alto: parseFloat(producto.height),
  amount: parseFloat(producto.suggested_price), // 🔑 precio real de venta
  ValorDeclarado: parseFloat(producto.suggested_price),
  // ... resto del payload
});
```
