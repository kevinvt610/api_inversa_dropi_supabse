# 📚 Documentación — Base de Datos EC Express Plataforma

> **Proyecto Supabase:** `mphngdkxxibdaegehlmj` — EC EXPRESS PLATAFORMA  
> **Última actualización:** Abril 2026

---

## 🏗️ Visión General de la Arquitectura

La plataforma tiene **3 tipos de usuario** y se comunica con **Dropi** a través de Edge Functions. Todo el sistema está construido sobre Supabase.

```mermaid
graph TD
    subgraph AUTH["🔐 Autenticación — Supabase Auth"]
        AU["auth.users\n(email + password)"]
    end

    subgraph USUARIOS["👥 Sistema de Usuarios"]
        PROF["profiles\n🔑 Rol: admin | vendedor | proveedor"]
        VEN["vendedores\n💼 Comisión · WhatsApp · Código"]
        PROV["proveedores\n🏭 Empresa"]
        CODES["access_codes\n🎟️ Códigos de invitación"]
    end

    subgraph CATALOGO["📦 Catálogo"]
        PROD["productos\n🛍️ Precios · Base · Dropi ID"]
    end

    subgraph VENTAS["🛒 Ventas"]
        ORDENES["ordenes_ventas\n📦 Historial · Estados · Comisiones"]
    end

    subgraph INTEGRACION["🔌 Integración Dropi"]
        INTEG["integrations\n🌐 provider='dropi' · token · status"]
    end

    subgraph EDGE["⚡ Edge Functions (10)"]
        EF["dropi-login · dropi-orders · dropi-product\ndropi-departments · dropi-distribution-companies\ndropi-origin-city · dropi-quote-shipping\ndropi-create-order · dropi-pending-incidences\ndropi-download-pdf"]
    end

    DROPI["☁️ Dropi API"]

    AU -->|"trigger automático"| PROF
    PROF -->|"role=vendedor"| VEN
    PROF -->|"role=proveedor"| PROV
    PROF -->|"admin genera"| CODES
    CODES -->|"usuario usa para registrarse"| PROF
    PROF -->|"admin conecta"| INTEG
    PROF -->|"admin (gestiona)"| PROD
    INTEG -->|"token"| EF
    EF <-->|"HTTP"| DROPI
    PROD -.->|"relación via dropi_id"| DROPI
```

---

## 👥 Roles del Sistema

```mermaid
graph LR
    subgraph ADMIN["👑 Admin"]
        A1["Gestiona pedidos Dropi"]
        A2["Conecta integraciones"]
        A3["Genera códigos de acceso"]
        A4["Administra usuarios"]
        A5["Ve todos los reportes"]
        A6["Gestiona productos"]
    end

    subgraph VENDEDOR["🧑 Vendedor"]
        V1["Ve pedidos asignados"]
        V2["Crea nuevos pedidos"]
        V3["Consulta productos"]
        V4["Gestiona su perfil"]
    end

    subgraph PROVEEDOR["🏭 Proveedor"]
        P1["Ve sus productos"]
        P2["Ve órdenes asociadas"]
        P3["Gestiona su perfil"]
    end
```

---

## 📋 Tablas — Detalle Completo

### 1. `profiles` — Perfil Base

Toda cuenta creada en Supabase Auth genera automáticamente un perfil gracias a un **trigger**.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID PK | Mismo UUID que `auth.users` |
| `full_name` | TEXT | Nombre completo |
| `phone` | TEXT | Teléfono |
| `role` | TEXT | `admin` · `vendedor` · `proveedor` |
| `is_active` | BOOL | Permite desactivar sin eliminar |
| `avatar_url` | TEXT | Foto de perfil |
| `created_at` | TIMESTAMPTZ | Fecha de creación |
| `updated_at` | TIMESTAMPTZ | Última actualización |

---

### 2. `access_codes` — Códigos de Invitación

El admin genera códigos únicos para que vendedores y proveedores puedan registrarse.

```mermaid
sequenceDiagram
    actor Admin
    actor Nuevo as Vendedor o Proveedor
    participant DB as access_codes
    participant AUTH as Supabase Auth

    Admin->>DB: INSERT code='VEN-X7K2P9', role='vendedor', expires_at=+7dias
    Admin-->>Nuevo: Comparte el código

    Nuevo->>DB: SELECT WHERE code='VEN-X7K2P9' AND used=false
    DB-->>Nuevo: Válido, role=vendedor

    Nuevo->>AUTH: signUp(email, password, meta={role:'vendedor'})
    AUTH-->>DB: Trigger crea profiles con role=vendedor
    Nuevo->>DB: UPDATE access_codes SET used=true, used_by=uid
    Nuevo->>DB: INSERT vendedores(id, comision, banco...)
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `code` | TEXT UNIQUE | Ej: `VEN-X7K2P9` o `PROV-AB12CD` |
| `role` | TEXT | Solo `vendedor` o `proveedor` |
| `used` | BOOL | `true` cuando ya fue utilizado |
| `expires_at` | TIMESTAMPTZ | Vence a los 7 días por defecto |
| `created_by` | UUID → profiles | Admin que generó el código |
| `used_by` | UUID → auth.users | Quién lo usó |

---

### 3. `vendedores` + `proveedores` — Datos Específicos

Tablas complementarias que extienden el perfil según el rol.

| Campo vendedores | Descripción |
|------------------|-------------|
| `codigo_vendedor` | Código único del vendedor |
| `comision_porcentaje` | % de comisión |
| `numero_whatsapp` | Número de WhatsApp para contacto |

| Campo proveedores | Descripción |
|-------------------|-------------|
| `nombre_empresa` | Nombre de la empresa o proveedor |

---

### 4. `integrations` — Integración con Dropi

Centraliza las credenciales de plataformas externas. Una fila por proveedor.

```mermaid
graph LR
    EF_LOGIN["⚡ dropi-login\nCONECTA la integración\nUPSERT token en integrations"]
    INTEG[("🗄️ integrations\nprovider='dropi'\nstatus='active'\ntoken='eyJ...'")]
    EF_REST["⚡ 9 funciones restantes\nSOLO LEEN el token"]
    DROPI["☁️ Dropi API"]

    EF_LOGIN -->|"UPSERT"| INTEG
    INTEG -->|"SELECT token"| EF_REST
    EF_REST -->|"Authorization: Bearer token"| DROPI
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `provider` | TEXT UNIQUE | `dropi` · `shopify` · `woocommerce` |
| `status` | TEXT | `active` · `inactive` · `error` |
| `token` | TEXT | Token de sesión activo |
| `email_cuenta` | TEXT | Email de la cuenta conectada |
| `nombre_tienda` | TEXT | Nombre de la tienda |
| `metadata` | JSONB | Datos extra flexibles por proveedor |
| `connected_by` | UUID → profiles | Admin que realizó la conexión |
| `last_sync_at` | TIMESTAMPTZ | Última vez que se sincronizó el token |

---

### 5. `productos` — Catálogo Interno

Los administradores gestionan los productos de la plataforma, enlazándolos con los productos reales de Dropi a través del `dropi_id`. Esta tabla también define la lógica de comisiones para los vendedores.

> [!NOTE]
> **Fórmula de la Comisión de Vendedores:**
> - Si `precio_venta < precio_minimo` ➔ **Comisión total = $0**
> - Si `precio_venta >= precio_minimo` ➔ **Comisión = comision_base + (precio_venta - precio_minimo)**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID PK | Identificador interno único |
| `dropi_id` | TEXT | ID del producto correspondiente en Dropi |
| `nombre` | TEXT | Nombre del producto |
| `precio_minimo` | NUMERIC | Precio base mínimo para aceptar y pagar comisión |
| `comision_base` | NUMERIC | Comisión base si el producto se vende al `precio_minimo` o más |
| `is_active` | BOOL | Define si el producto puede ser visto/vendido |
| `created_by` | UUID → profiles | Admin que registró el producto |
| `created_at` | TIMESTAMPTZ | Fecha de creación del registro |
| `updated_at` | TIMESTAMPTZ | Última fecha de actualización |

---

### 6. `ordenes_ventas` — Historial y Sincronización

Registra todas las ventas del sistema, calculando costos, comisiones de vendedores y sincronizando el estado con Dropi.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id_registro` | INT8 PK | ID único interno del registro |
| `id_orden` | INT8 | ID de la orden en Dropi |
| `estado` | TEXT | Estado actual de la orden |
| `fecha` | TIMESTAMPTZ | Fecha de la orden |
| `nota` | TEXT | Notas adicionales |
| `valor_total_orden` | NUMERIC | Valor total de la venta |
| `nombre_completo` | TEXT | Cliente destino |
| `telefono` | TEXT | Teléfono cliente |
| `pais`, `departamento`, `ciudad` | TEXT | Ubicación de envío |
| `direccion_envio` | TEXT | Dirección destino |
| `numero_guia` | TEXT | Guía de la transportadora |
| `transportadora` | TEXT | Nombre transportadora |
| `costo_envio` | NUMERIC | Costo de envío real |
| `nombre_producto` | TEXT | Nombre del producto |
| `cantidad` | INT4 | Unidades vendidas |
| `precio_venta_unidad` | NUMERIC | Precio de venta final por unidad |
| `precio_proveedor_unidad` | NUMERIC | Costo base del proveedor |
| `wallet_monto` | NUMERIC | Montos de wallet |
| `wallet_descripcion`, `wallet_tipo`, `wallet_email` | TEXT | Datos informativos de wallet |
| `wallet_fecha` | TIMESTAMPTZ | Fecha de wallet |
| `wallet_monto_anterior` | NUMERIC | Saldo previo referencial |
| `fecha_creacion_orden` | TIMESTAMPTZ | Creación en el sistema |
| `fecha_actualizacion` | TIMESTAMPTZ | Última revisión de estado |
| `fecha_guardado` | TIMESTAMPTZ | Guardado en DB local |
| `nombre_proveedor` | TEXT | Nombre del proveedor (Dropi) |
| `nombre_vendedor` | TEXT | Nombre del vendedor (Dropi) |
| `id_vendedor` | UUID → vendedores | 🔑 Vínculo real con el vendedor para la comisión |
| `id_producto` | UUID → productos | 🔑 Vínculo real con el catálogo interno |
| `dropi_producto_id` | INT4 | Referencia al ID de Dropi |
| `comision` | NUMERIC | Comisión calculada |
| `id_pago` | INT8 | ID de comprobante/pago |

---

## ⚡ Mapa de Edge Functions

| Función | Rol | Método |
|---------|-----|--------|
| `dropi-login` | 🔌 Conecta integración Dropi | POST |
| `dropi-orders` | 📋 Lista pedidos | GET |
| `dropi-product` | 📦 Info de producto por ID | GET |
| `dropi-departments` | 🗺️ Departamentos y ciudades | GET |
| `dropi-distribution-companies` | 🚚 Transportadoras disponibles | GET |
| `dropi-origin-city` | 📍 Ciudad de origen para envío | POST |
| `dropi-quote-shipping` | 💰 Cotiza envío | POST |
| `dropi-create-order` | ✅ Crea pedido en Dropi | POST |
| `dropi-pending-incidences` | ⚠️ Novedades pendientes | GET |
| `dropi-download-pdf` | 📄 Descarga guía PDF | GET |

---

## 🔒 Seguridad — Row Level Security

Todas las tablas tienen RLS activado. Las Edge Functions usan `service_role` (acceso completo sin restricciones).

| Tabla | Admin | Vendedor | Proveedor | Edge Functions |
|-------|-------|----------|-----------|----------------|
| `profiles` | ✅ Todos | 👁️ El suyo | 👁️ El suyo | ⚡ service_role |
| `access_codes` | ✅ Todos | ❌ | ❌ | ⚡ service_role |
| `vendedores` | ✅ Todos | 👁️ El suyo | ❌ | ⚡ service_role |
| `proveedores` | ✅ Todos | ❌ | 👁️ El suyo | ⚡ service_role |
| `integrations` | ✅ Todos | ❌ | ❌ | ⚡ service_role |
| `productos` | ✅ Todos | 👁️ Lectura | ❌ | ⚡ service_role |

---

## 🔄 Triggers

| Trigger | Cuándo se dispara | Qué hace |
|---------|-------------------|----------|
| `on_auth_user_created` | Al crear usuario en auth | Crea fila en `profiles` automáticamente |
| `profiles_updated_at` | Al actualizar `profiles` | Pone `updated_at = NOW()` |
| `integrations_updated_at` | Al actualizar `integrations` | Pone `updated_at = NOW()` |
| `productos_updated_at` | Al actualizar `productos` | Pone `updated_at = NOW()` |

---

## 📊 Diagrama ER Completo

```mermaid
erDiagram
    AUTH_USERS ||--|| PROFILES : "trigger auto"
    PROFILES ||--o| VENDEDORES : "role=vendedor"
    PROFILES ||--o| PROVEEDORES : "role=proveedor"
    PROFILES ||--o{ ACCESS_CODES : "created_by"
    ACCESS_CODES ||--o| AUTH_USERS : "used_by"
    PROFILES ||--o{ INTEGRATIONS : "connected_by"
    PROFILES ||--o{ PRODUCTOS : "created_by"
    VENDEDORES ||--o{ ORDENES_VENTAS : "registra_venta"
    PRODUCTOS ||--o{ ORDENES_VENTAS : "contiene"

    AUTH_USERS {
        uuid id PK
        text email
        timestamptz created_at
    }
    PROFILES {
        uuid id PK
        text full_name
        text phone
        text role
        bool is_active
        timestamptz created_at
        timestamptz updated_at
    }
    VENDEDORES {
        uuid id PK
        text codigo_vendedor
        numeric comision_porcentaje
        text numero_whatsapp
    }
    PROVEEDORES {
        uuid id PK
        text nombre_empresa
    }
    ACCESS_CODES {
        uuid id PK
        text code
        text role
        bool used
        uuid created_by
        uuid used_by
        timestamptz expires_at
        timestamptz used_at
    }
    INTEGRATIONS {
        uuid id PK
        text provider
        text status
        text token
        text email_cuenta
        jsonb metadata
        uuid connected_by
        timestamptz last_sync_at
        timestamptz updated_at
    }
    PRODUCTOS {
        uuid id PK
        text dropi_id
        text nombre
        numeric precio_minimo
        numeric comision_base
        bool is_active
        uuid created_by
        timestamptz created_at
        timestamptz updated_at
    }
    ORDENES_VENTAS {
        int8 id_registro PK
        int8 id_orden
        text estado
        timestamptz fecha
        text nota
        numeric valor_total_orden
        text nombre_completo
        text telefono
        text pais
        text departamento
        text ciudad
        text direccion_envio
        text numero_guia
        text transportadora
        numeric costo_envio
        text nombre_producto
        int4 cantidad
        numeric precio_venta_unidad
        numeric precio_proveedor_unidad
        numeric wallet_monto
        text wallet_descripcion
        timestamptz wallet_fecha
        text wallet_email
        text wallet_tipo
        numeric wallet_monto_anterior
        timestamptz fecha_creacion_orden
        timestamptz fecha_actualizacion
        timestamptz fecha_guardado
        text nombre_proveedor
        text nombre_vendedor
        uuid id_vendedor
        uuid id_producto
        int4 dropi_producto_id
        numeric comision
        int8 id_pago
    }
```
