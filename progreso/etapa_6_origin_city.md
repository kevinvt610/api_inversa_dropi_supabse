# Etapa 6 — Bodega de Origen (`dropi-origin-city`)

## ¿Qué hace este endpoint?

Dado un ID de producto y una ciudad de destino en texto libre, Dropi calcula automáticamente **desde qué bodega del proveedor debe salir el envío**. Devuelve el nombre de esa bodega y el código DANE de su ciudad, que es indispensable para la cotización de fletes.

**Propósito clave:** Sin este paso no puedes cotizar fletes, ya que la tarifa depende de la ciudad de origen (bodega) y la ciudad de destino del cliente.

---

## Detalles Técnicos

| Campo         | Valor                                                                                 |
|---------------|---------------------------------------------------------------------------------------|
| **Edge Function** | `dropi-origin-city`                                                               |
| **URL Supabase** | `POST {SUPABASE_URL}/functions/v1/dropi-origin-city`                              |
| **URL Dropi** | `POST https://api.dropi.co/api/orders/getOriginCityForCalculateShipping`              |
| **Método**    | `POST`                                                                                |
| **Auth**      | El token se inyecta automáticamente desde `dropi_tokens` (no necesitas enviarlo)      |

---

## Request — Qué debes enviar

```json
{
  "id": 1297563,
  "destination": "bogota, cundinamarca",
  "type": "SIMPLE"
}
```

### Descripción de los campos

| Campo         | Tipo    | Requerido | Descripción |
|---------------|---------|-----------|-------------|
| `id`          | `number`| ✅ Sí     | ID numérico del producto en Dropi (ej: 1297563). **Debe ser entero, no string.** |
| `destination` | `string`| ✅ Sí     | Ciudad y departamento de destino en texto libre, separados por coma. Ej: `"medellin, antioquia"`, `"cali, valle del cauca"`. Dropi interpreta el texto para encontrar la ciudad. |
| `type`        | `string`| ✅ Sí     | Siempre enviar `"SIMPLE"` para productos sencillos sin variaciones. |

---

## Response — Qué devuelve

```json
{
  "isSuccess": true,
  "status": 200,
  "data": {
    "warehouse": {
      "id": 19069,
      "name": "casa",
      "city": {
        "id": 444,
        "name": "SOACHA",
        "cod_dane": "25754000",
        "department": {
          "name": "CUNDINAMARCA"
        }
      }
    },
    "city_dropi": {
      "id": 444,
      "name": "SOACHA",
      "cod_dane": "25754000"
    }
  }
}
```

### Campos importantes de la respuesta

| Campo                                | Descripción |
|--------------------------------------|-------------|
| `data.warehouse.name`                | Nombre de la bodega del proveedor (ej: `"casa"`, `"CEDI Bogotá"`). |
| `data.warehouse.city.cod_dane`       | **🔑 Código DANE de la ciudad origen.** Este es el valor que necesitas para cotizar. |
| `data.warehouse.city.name`           | Nombre legible de la ciudad origen (ej: `"SOACHA"`). |
| `data.city_dropi.cod_dane`           | Alternativa si `warehouse` es null — también contiene el cod_dane origen. |

---

## Cómo usar la respuesta (en código)

```javascript
const originData = response.data.data;

// Obtener el cod_dane de origen (con fallback)
const codDaneOrigen = 
  originData?.warehouse?.city?.cod_dane || 
  originData?.city_dropi?.cod_dane;

// Ciudad remitente completa para el payload del cotizador
const ciudadRemitente = originData.warehouse?.city || originData.city_dropi;

// Bodega completa para el payload del cotizador
const warehouse = originData.warehouse;
```

---

## Errores comunes

| Situación | Error | Solución |
|-----------|-------|----------|
| `id` enviado como string | `500` o comportamiento inesperado | Usar `parseInt(id)` antes de enviar |
| Destino mal escrito | `data` vacío o warehouse null | Verificar ortografía: `"bogota, cundinamarca"` no `"bogotá"` (sin tilde en Dropi) |
| Token expirado | `401 No Token` | El sistema lo renueva automáticamente con login; si falla, ejecutar login manual |

---

## Ejemplo completo en JavaScript (Frontend)

```javascript
const response = await fetch('https://<PROJECT_ID>.supabase.co/functions/v1/dropi-origin-city', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: 1297563,               // ID del producto (número entero)
    destination: "bogota, cundinamarca",
    type: "SIMPLE"
  })
});

const json = await response.json();
const originData = json.data;
const codDaneOrigen = originData?.warehouse?.city?.cod_dane;
console.log('Ciudad origen:', codDaneOrigen); // "25754000"
```

---

## Flujo completo

Este endpoint es el **Paso 1** del flujo del cotizador:

```
[Frontend] ID Producto + Destino texto
     ↓
dropi-origin-city  → cod_dane_origen + warehouse
     ↓
dropi-quote-shipping → tabla de precios por transportadora
```
