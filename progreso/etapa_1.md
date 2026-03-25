# Etapa 1: Ingeniería Inversa y Migración a Serverless (Edge Functions)

En esta primera etapa nos enfocamos en **desacoplar y migrar** la lógica de un script monolítico en Node.js, transformándolo en una arquitectura escalable lista para la nube mediante **Supabase Edge Functions** y **Deno**. Logramos replicar el comportamiento de la plataforma original como si las peticiones salieran directamente del navegador.

## Objetivos Alcanzados

1. **Ingeniería Inversa de la API de Dropi**
   - Extraemos los encabezados HTTP exactos (`User-Agent`, `Referer`, `Sec-Ch-Ua`, etc.) provenientes de la marca blanca `app.seventyblock.com`.
   - Implementamos estos _headers_ dentro del servidor proxy para evitar cualquier tipo de bloqueo o detección por parte de la API original (`api.dropi.co`).

2. **Arquitectura Serverless y Modularidad**
   - Entendiendo que es una mala práctica mantener toda la lógica en un solo punto, crearemos el directorio `_shared` para mantener el principio DRY (Don't Repeat Yourself).
   - En **`_shared/cors.ts`**: Definimos la cabecera `Access-Control-Allow-Origin: *` de forma global para permitir que nuestras Edge Functions sean llamadas desde cualquier interfaz gráfica frontend (solucionando el típico bloqueo por CORS).
   - En **`_shared/dropi.ts`**: Centralizamos los _browser headers_ para que todas las funciones que se comuniquen con Dropi simulen ser un navegador legítimo unificadamente.

3. **Separación de Responsabilidades (Endpoints Independientes)**
   Reemplazamos un único modelo proxy generalista por micro-funciones autónomas:
   - **`dropi-login`**: 
     - Recibe un método `POST`.
     - Actúa como puente enviando credenciales (`email` y `password`) hacia la pasarela `/api/login` de Dropi.
     - Captura el JWT devuelto (`token`) y se lo manda de regreso al FrontEnd en formato JSON.
   - **`dropi-orders`**: 
     - Recibe un método `GET`.
     - Toma el token desde las cabeceras `Authorization` enviadas por nuestra propia aplicación y arma la petición junto con los parámetros de paginación (`start`, `result_number`).
     - Realiza la consulta a la subruta `/api/orders/myorders` reenviando el flujo de datos exacto de Dropi al usuario.

4. **Validación y Automatización del Despliegue**
   - Transicionamos exitosamente el consumo de datos de la librería `axios` al API nativo web (`fetch`).
   - El código fue validado localmente a través de entornos de ejecución como `deno run` simulando interacciones exitosas.
   - Finalmente, enlazamos el proyecto CLI a la base de datos oficial (`jhwgtihnpceyvuaqlkgb`) y desplegamos el código, finalizando de manera oficial la creación de nuestra propia API privada construida desde cero a partir de ingeniería inversa.

---
**Estado de la Etapa:** COMPLETADO ✅
