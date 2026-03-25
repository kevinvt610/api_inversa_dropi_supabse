# API Inversa Dropi - Supabase Edge Functions

> 📖 **[Ver Esquema Completo de la API →](./API_SCHEMA.md)** — Referencia de todos los endpoints, flujos de integración y arquitectura.

Este proyecto es una implementación de **ingeniería inversa** de la API privada de **Dropi**. El objetivo principal es proporcionar un proxy optimizado mediante **Supabase Edge Functions** que replique y mejore el comportamiento de la API original, resolviendo problemas de CORS, reduciendo el peso de la información al cliente (frontend) y facilitando el uso automatizado de la plataforma.


## 🚀 Motivación y Ventajas

La plataforma oficial de Dropi está diseñada para ser consumida exclusivamente por navegadores web (usando tokens temporales y cabeceras estrictas) y suele retornar estructuras de datos anidadas sumamente pesadas, lo cual ralentiza las aplicaciones. Al hacer ingeniería inversa del comportamiento de red, logramos aislar y replicar estos flujos.

Al desplegar estas funciones en **Supabase**, obtenemos:
- **Persistencia y Rotación de Tokens:** Capacidad de mantener los tokens de sesión frescos almacenándolos temporalmente en la tabla `dropi_tokens` de tu base de datos Supabase, sin tener que hacer login en cada recarga de página web.
- **Optimización Geográfica (All-in-One):** Implementamos filtros en el backend que previenen la transferencia de mega-JSONs al cliente ahorrando ancho de banda.
- **Bypass de CORS:** Las Edge Functions incorporan las cabeceras estándar para permitir llamadas `fetch` o `axios` desde cualquier dominio web propio.

## 📦 Edge Functions Disponibles

Las funciones residen en la carpeta `/supabase/functions`.

### 1. `dropi-login`
- **Descripción:** Automatiza el inicio de sesión enviando las credenciales (simulando cabeceras exactas del navegador Chrome). Obtiene el JWT (token de autorización) y lo guarda/actualiza automáticamente en la tabla `dropi_tokens` (con id=1).

### 2. `dropi-orders`
- **Descripción:** Extrae el listado de las órdenes (pedidos) generadas en la cuenta de Dropi. 
- **Magia interna:** No requiere que le envíes el token por cabecera HTTP desde tu aplicación frontend. La función lo recupera de la base de datos de manera autónoma, logrando un código cliente mucho más limpio y seguro.

### 3. `dropi-departments` (Optimizador Geográfico)
- **Descripción:** Consigue el catálogo geográfico del país mediante el endpoint oculto `api/department/all/with-cities`. 
- **Modos de Filtro (Query Params):**
  - **`GET /dropi-departments`**: Devuelve **sólo** el listado principal de departamentos (recortando las miles de ciudades de la memoria). Ideal para llenar un primer `<select>`.
  - **`GET /dropi-departments?department_id=XX`**: Busca el ID enviado, purga lo innecesario y devuelve **sólo el arreglo liviano de ciudades** correspondientes a ese departamento.
  - **`GET /dropi-departments?include_cities=true`**: Devuelve íntegramente la estructura anidada de Departamentos > Ciudades en un solo bloque gigantesto. Útil para guardados en masa en bases de datos o Cron Jobs.

---

## 🛠 Instalación y Configuración

1. **Clonar repositorio:**
   ```bash
   git clone git@github.com:kevinvt610/api_inversa_dropi_supabse.git
   ```

2. **Variables de Entorno Locales (.env):**
   Copia el archivo `.env.example` proporcionado renombrándolo a `.env`. Coloca ahí tu correo de Dropi (`DROPI_EMAIL`), tu contraseña secreta (`DROPI_PASSWORD`) y la `PROJECT_URL` de tu instancia de Supabase.

3. **Despliegue a Supabase:**
   Para subir las funciones a tu entorno en la nube, debes usar el CLI de Supabase (y tener tu ID de proyecto configurado):
   ```bash
   supabase functions deploy dropi-login
   supabase functions deploy dropi-orders
   supabase functions deploy dropi-departments
   ```
   **Nota muy importante:** También debes enviar tus Secretos de Base de Datos al entorno cloud de Supabase (las `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` del proyecto).

4. **Pruebas Locales (Node.js):**
   El archivo `test.js` en la raíz de este proyecto contiene un flujo maestro de pruebas ya configurado.
   Si tienes Node y las librearías instaladas (como `dotenv`, ya en el `.gitignore`), puedes correr la prueba de extremo a extremo:
   ```bash
   node test.js
   ```

---
*Aviso: Este proyecto tiene propósitos técnicos educativos y busca optimizar flujos logísticos de un e-commerce aliado.*
