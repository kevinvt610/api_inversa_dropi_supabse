# Etapa 3: Creación de Órdenes en Dropi

## Contexto
Hemos implementado el flujo logístico principal: la creación de un nuevo pedido dentro de la plataforma utilizando el endpoint `POST https://api.dropi.co/api/orders/myorders`. 

Para ello, construimos una Edge Function en Supabase llamada `dropi-create-order` que actúa como puente optimizado entre nuestro frontend y Dropi.

## La Edge Function: `dropi-create-order`

Este endpoint fue diseñado para conectarse autónomamente, leyendo el token `Authorization` plenamente vigente directo desde nuestra tabla `dropi_tokens` en Supabase. De este modo, **nuestro frontend no necesita preocuparse por rotaciones de sesión ni credenciales**.

### Flujo de Uso (Desde el Frontend de la Tienda)

**Ruta a consumir en nuestro proyecto Supabase:** `POST /functions/v1/dropi-create-order`
**Cabeceras Requeridas:** `Content-Type: application/json`

**Cuerpo de la Petición (Body JSON):**
Para que Dropi liquide automáticamente los costos de flete y comisiones, el parámetro `"calculate_costs_and_shiping": true` es el factor clave.

```json
{
  "calculate_costs_and_shiping": true,
  "state": "CUNDINAMARCA",
  "city": "BOGOTA",
  "client_email": "correo_test@gmail.com",
  "name": "kevin",
  "surname": "tovar",
  "dir": "direccion_test 123",
  "notes": "esta orden es de prueba",
  "payment_method_id": 1,         // ID 1 es el estándar para pedidos manuales
  "phone": "313523645",
  "rate_type": "CON RECAUDO",     // O "SIN RECAUDO" para guías pre-pagadas
  "type": "FINAL_ORDER",          // Clasificación requerida por el backend de dropi
  "total_order": 280000,          // Total de la guía a pagar (sin signos ni puntuación)
  "products": [
    {
      "id": 1297563,              // ID real del ítem a vender en Dropi
      "price": 280000,            // Precio UNITARIO por cada pieza
      "variation_id": null,
      "quantity": 1               // Número de unidades del mismo ítem en esta caja
    }
  ]
}
```

### Comportamiento y Respuestas

Nuestra proxy retorna la respuesta íntegra de Dropi, para facilitarnos su captura desde la interfaz.

#### ✅ Orden de Despacho Creada (Status 200 OK)
Confirmará la inyección en base de datos. Sus propiedades más valiosas para guardar en nuestra propia base de datos son:
1. `objects.id`: El Identificador de seguimiento para la guía (ej. `69984915`). ¡Guarda esto!
2. `objects.shipping_amount`: El dinero que absorberá el costo de envío (ej. `$31.460`).
3. `objects.dropshipper_amount_to_win`: Representa la ganancia real y neta post retenciones de la transportadora.
4. `wallets`: Tu cuenta recargada.

#### ❌ Error en el Formulario (Status 400 Bad Request)
La validación nativa interna de Dropi abortará el proceso si omites parámetros obligatorios (Por ejemplo, si el cliente no rellenó el campo "Apellido").
Nuestra Edge Function está envuelta en un bloque `try-catch` que pasará intacto el informe de la plataforma, que de hecho revela sus propios errores de PHP:
```json
{
  "isSuccess": false,
  "message": "Exception: Undefined property: stdClass::$surname",
  "status": 400,
  "error": "Undefined property: stdClass::$surname"
}
```
*Interpretación:* Tu frontend podrá leer `"status": 400` y desplegar una alerta visual como "Ey, los apellidos son requeridos" basándose en el error provisto por la proxy.
