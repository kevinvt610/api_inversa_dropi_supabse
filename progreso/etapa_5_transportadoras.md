# Etapa 5: Catálogo de Transportadoras (Distribution Companies)

## Contexto
Para poder registrar una orden en Dropi, es obligatorio indicar qué empresa de envíos realizará la entrega, usando su identificador interno (`distributionCompany`). Además, algunas empresas pueden estar temporalmente suspendidas o inactivas en la plataforma, por lo que es vital no mostrarlas al cliente final.

Para resolver esto en tiempo real desde el frontend sin exponer credenciales, creamos la Edge Function `dropi-distribution-companies`.

## La Edge Function: `dropi-distribution-companies`

Este endpoint proxy se conecta a la API de Dropi ocultando tu token. Además, le hemos añadido un parámetro clave para optimizar la transferencia de datos hacia nuestra aplicación.

### Flujo de Uso (Frontend)

**Ruta a consumir en Supabase:**
`GET /functions/v1/dropi-distribution-companies`

**Parámetro Recomendado:**
Puedes (y debes) pasarle el string query `?visible_only=true`.
Ejemplo: `GET /functions/v1/dropi-distribution-companies?visible_only=true`

¿Por qué? Porque si le pasas este parámetro, **nuestra Edge Function filtrará en sus propios servidores** todas las transportadoras que Dropi tenga marcadas con `"is_visible": false` (como ENVIA en algunos casos) y solo le enviará a tu web Frontend las empresas que realmente están habilitadas para envíos. ¡Esto es un gran ahorro de kilobytes extraños y evita errores de interfaz!

### Respuesta del Servidor (Status 200 OK)

El servidor te devolverá un JSON similar a este:
```json
{
  "isSuccess": true,
  "status": 200,
  "objects": [
    {
      "id": 1,                     // El ID clave que usarás en "payment_method_id" u otros campos
      "name": "SERVIENTREGA",      // El nombre amigable a mostrar al cliente
      "created_at": "2022-05-14 15:03:05",
      "incidence_solution_method": "MEC2",
      "is_visible": true           // Nos asegura que está funcional
    },
    {
      "id": 3,
      "name": "INTERRAPIDISIMO",
      "is_visible": true
    }
  ],
  "count": 2
}
```

### Reglas de Negocio en la Creación de Órdenes
Los valores de la propiedad `"id"` (`1`, `2`, `3`, etc.) son los que usarás posteriormente para armar los JSON's de creación de órdenes y guías, pero en particular, el `"name"` es el que tendrás que "normalizar" (pasarlo a `servientrega`, `interrapidisimo`, etc.) cuando construyas la ruta de **descarga de los PDFs** visto en la etapa 4.
