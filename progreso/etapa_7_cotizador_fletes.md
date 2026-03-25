# Etapa 7 — Cotizador de Fletes Multitransportadora (`dropi-quote-shipping`)

## ¿Qué hace este endpoint?

Con **una sola llamada**, consulta simultáneamente las tarifas de **todas las transportadoras habilitadas** en Dropi y devuelve los precios ordenados de menor a mayor. Nuestra Edge Function además filtra automáticamente las transportadoras con `is_visible: false` para no mostrar opciones no disponibles.

**Propósito clave:** Es el paso final del flujo de cotización. Le entrega al usuario la tabla de precios con la que puede seleccionar la transportadora al crear su orden.

---

## Detalles Técnicos

| Campo            | Valor |
|------------------|-------|
| **Edge Function**| `dropi-quote-shipping` |
| **URL Supabase** | `POST {SUPABASE_URL}/functions/v1/dropi-quote-shipping` |
| **URL Dropi**    | `POST https://api.dropi.co/api/orders/cotizaEnvioTransportadoraV2` |
| **Método**       | `POST` |
| **Auth**         | Token inyectado automáticamente desde `dropi_tokens` |

---

## Request — Qué debes enviar

```json
{
  "peso": 1,
  "largo": 10,
  "ancho": 10,
  "alto": 10,
  "ValorDeclarado": 260000,
  "EnvioConCobro": true,
  "insurance": false,
  "amount": 260000,
  "ciudad_remitente": {
    "id": 444,
    "name": "SOACHA",
    "cod_dane": "25754000"
  },
  "ciudad_destino": {
    "id": 50,
    "name": "BOGOTA",
    "cod_dane": "11001000"
  },
  "warehouse": {
    "id": 19069,
    "name": "casa",
    "city_id": 444
  },
  "destination_name": "Juan Pérez",
  "destination_phone": "3224527647",
  "products": [
    {
      "id": 1297563,
      "quantity": 1,
      "type": "SIMPLE",
      "peso": 1,
      "largo": 10,
      "ancho": 10,
      "alto": 10
    }
  ]
}
```

### Descripción de los campos

| Campo              | Tipo      | Requerido | Descripción |
|--------------------|-----------|-----------|-------------|
| `peso`             | `number`  | ✅ Sí     | Peso real del paquete en kg (ej: `1` = 1 kg). Viene del producto. |
| `largo`            | `number`  | ✅ Sí     | Largo de la caja en cm. Viene del campo `length` del producto. |
| `ancho`            | `number`  | ✅ Sí     | Ancho de la caja en cm. Viene del campo `width` del producto. |
| `alto`             | `number`  | ✅ Sí     | Alto de la caja en cm. Viene del campo `height` del producto. |
| `ValorDeclarado`   | `number`  | ✅ Sí     | Valor declarado del paquete para efectos de seguro (precio de venta). |
| `EnvioConCobro`    | `boolean` | ✅ Sí     | `true` = COD (pago contra entrega). `false` = sin recaudo (ya fue pagado online). |
| `insurance`        | `boolean` | ✅ Sí     | `false` en casi todos los casos. |
| **`amount`** 🔑    | `number`  | ✅ Sí     | **Valor a recaudar del cliente.** Afecta directamente el precio del flete porque las transportadoras cobran ~3.5% de este valor como comisión de recaudo. **Debe coincidir con el precio de venta real.** |
| `ciudad_remitente` | `object`  | ✅ Sí     | Ciudad origen. Usar el objeto `ciudad` que devolvió `dropi-origin-city`. |
| `ciudad_destino`   | `object`  | ✅ Sí     | Ciudad destino del cliente. Mínimo: `{ id, name, cod_dane }`. |
| `warehouse`        | `object`  | ✅ Sí     | Bodega origen completa. Usar el objeto `warehouse` de `dropi-origin-city`. |
| `destination_name` | `string`  | ✅ Sí     | Nombre del destinatario. |
| `destination_phone`| `string`  | ✅ Sí     | Teléfono del destinatario (solo dígitos). |
| `products`         | `array`   | ✅ Sí     | Lista de productos con `id`, `quantity`, `type` y dimensiones. |

> ⚠️ **Error más común:** Enviar `amount` con un valor bajo (ej: `75000`) cuando el precio real es `260000`. Esto hace que las transportadoras calculen una comisión de recaudo menor y el precio cotizado **quede $5,000–7,000 más barato de lo real**, generando pérdidas al proveedor.

---

## Response — Qué devuelve

```json
{
  "isSuccess": true,
  "objects": [
    {
      "transportadora": "VELOCES",
      "distributionCompany": {
        "id": 7,
        "name": "Veloces",
        "is_visible": true
      },
      "objects": {
        "precioEnvio": 19350,
        "trayecto": "NACIONAL"
      }
    },
    {
      "transportadora": "COORDINADORA",
      "distributionCompany": {
        "id": 3,
        "name": "Coordinadora",
        "is_visible": true
      },
      "objects": {
        "precioEnvio": 22679,
        "trayecto": null
      }
    }
  ]
}
```

> **Nota:** Nuestra Edge Function ya **filtra** las transportadoras con `is_visible: false` y las **ordena** de menor a mayor por `precioEnvio` antes de entregar la respuesta.

### Campos importantes por transportadora

| Campo                             | Descripción |
|-----------------------------------|-------------|
| `transportadora`                  | Nombre en mayúsculas de la transportadora. |
| `distributionCompany.id`          | ID interno en Dropi. Necesario para asignarla al crear la orden. |
| `distributionCompany.name`        | Nombre para mostrar al usuario. |
| `objects.precioEnvio`             | **💰 Costo del flete en pesos.** Este es el valor a mostrar al usuario. |
| `objects.trayecto`                | `"URBANO"`, `"NACIONAL"`, o `null`. Tipo de ruta. |

---

## Cómo usar la respuesta (en código)

```javascript
const transportadoras = response.data.objects || [];

// Mostrar al usuario
transportadoras.forEach(t => {
  console.log(`${t.distributionCompany.name}: $${t.objects.precioEnvio}`);
});

// Obtener la más barata
const masBarata = transportadoras[0]; // Ya vienen ordenadas

// Obtener el ID para crear la orden
const distributionCompanyId = masBarata.distributionCompany.id;
```

---

## Transportadoras habilitadas (referencia)

| ID  | Nombre          | Nombre en URL PDF   |
|-----|-----------------|---------------------|
| 1   | Servientrega    | `servientrega`      |
| 2   | Envia           | `servientrega`      |
| 3   | Coordinadora    | `coordinadora`      |
| 4   | Interrapidísimo | `interrapidisimo`   |
| 5   | Domina          | `domina`            |
| 7   | Veloces         | `veloces`           |
| 14  | TCC             | `tcc`               |

---

## Flujo completo de integración

```
1. dropi-origin-city → obtener warehouse + ciudad remitente
2. dropi-quote-shipping → obtener precios (usar datos del paso 1)
3. Usuario selecciona transportadora
4. dropi-create-order → crear la orden con distributionCompany.id elegido
5. dropi-download-pdf → descargar la guía generada
```

---

## Ejemplo completo en JavaScript (Frontend)

```javascript
// Asumiendo que ya tienes originData del paso anterior

const response = await fetch('{SUPABASE_URL}/functions/v1/dropi-quote-shipping', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    peso: producto.weight,          // del producto Dropi
    largo: producto.length,
    ancho: producto.width,
    alto: producto.height,
    ValorDeclarado: precioVenta,
    EnvioConCobro: true,
    insurance: false,
    amount: precioVenta,            // 🔑 MUST = precio real de venta
    ciudad_remitente: originData.warehouse?.city,
    ciudad_destino: ciudadDestinoSeleccionada, // del formulario
    warehouse: originData.warehouse,
    destination_name: cliente.nombre,
    destination_phone: cliente.telefono,
    products: [{ id: producto.id, quantity: cantidad, type: "SIMPLE",
      peso: producto.weight, largo: producto.length,
      ancho: producto.width, alto: producto.height }]
  })
});

const { objects: transportadoras } = await response.json();
// transportadoras ya viene filtrado y ordenado por precio ascendente
```
