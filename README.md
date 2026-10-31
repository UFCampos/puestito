# 🎪 TuPuestito (MVP)

**TuPuestito** es la plataforma e-commerce centralizada para artistas independientes argentinos, combinando lo mejor de **VGen** (gestión de comisiones digitales, pagos en etapas y protección anti-estafas) con el espíritu de stand virtual de **BOOTH.pm**, adaptado a la economía y medios de pago locales (Mercado Pago con pagos divididos).

---

## 🌟 Funcionalidades Implementadas en el MVP (Sprints 1 al 6)

1. **Catálogo & Descubrimiento:**
   - Explorador visual de artistas con búsqueda en tiempo real por nombre, bio o fandom (ej. Vocaloid, Genshin).
   - Insignia oficial de **"100% Humano Verificado"** (política de tolerancia cero a arte generado con IA).
   - Filtros de contenido `SFW`, `SUGGESTIVE` y `NSFW`.

2. **Perfil-Tienda del Artista (`/u/[username]`):**
   - Banner y avatar personalizables, bio y enlaces directos a redes (X, Instagram, Pixiv, VGen).
   - Pestaña de **Comisiones** con precios en pesos ARS, tiempo de entrega, cupos y revisiones.
   - Pestaña de **Portfolio** de obras de arte.
   - Pestaña de **Reseñas** de clientes con calificación de 1 a 5 estrellas.

3. **Formulario de Solicitud de Comisión:**
   - Explicación de la idea y detalles del personaje.
   - Hasta **10 imágenes de referencia visual**.
   - Enlace a tablero interactivo externo (sugiriendo **Excalidraw**, Miro o Google Drive).
   - Checkbox contractual obligatorio aceptando los Términos de Servicio y la modalidad de pago del artista.

4. **Sala del Pedido en Tiempo Real (`/orders/[orderId]`):**
   - Hilo de mensajes y notificaciones de eventos del sistema.
   - Línea de tiempo de estados (`REQUESTED`, `ACCEPTED_WAITING_DEPOSIT`, `IN_PROGRESS_SKETCH`, `SKETCH_REVIEW`, `WORKING_FINAL`, `COMPLETED_HD_UNLOCKED`).
   - El artista puede subir bocetos y la entrega final directamente en la sala.

5. **Protección con Marca de Agua Automática (`sharp`):**
   - Procesamiento de imágenes optimizado a `WebP`.
   - Marca de agua manual o automática (`AUTO_TEXT` o `AUTO_AVATAR`) repetida en diagonal para proteger las muestras de bocetos y previsualizaciones antes del pago.
   - El archivo original en HD queda bloqueado y solo se destraba tras la aprobación del pago final.

6. **Mercado Pago Split 1:1 (Sin custodia de fondos):**
   - Descuento automático del 5% (`marketplace_fee`) para TuPuestito y 95% neto acreditado directo en la cuenta del artista.
   - Modalidad configurable: **50% Seña inicial + 50% al aprobar boceto**, **50% Seña + 50% al aprobar vista previa final con marca de agua**, o **100% por adelantado**.
   - Sandbox interactivo incorporado para desarrollo y pruebas.

---

## 🛠️ Stack Tecnológico

- **Frontend:** Next.js 15 (App Router), React 19, Tailwind CSS, Lucide Icons.
- **Backend:** Fastify 5, Drizzle ORM, Better-SQLite3 (cero configuración y ultra liviano para VPS económicos), Sharp, Fastify JWT, Fastify Cookie, Fastify Multipart.
- **Monorepo:** PNPM Workspaces (`apps/web`, `apps/api`, `packages/shared`).

---

## 🚀 Cómo Ejecutar en Local

### 1. Clonar e instalar dependencias
```bash
git clone <tu-repo>
cd puestito
pnpm install
```

### 2. Poblar datos de prueba (Seed)
```bash
cd apps/api
pnpm tsx src/seed.ts
```
Esto creará:
- **Artista Demo:** `maomao@tupuestito.com` (Contraseña: `123456`) — Perfil: `http://localhost:3000/u/maomao`
- **Comprador Demo:** `comprador@tupuestito.com` (Contraseña: `123456`)

### 3. Iniciar Backend y Frontend
En dos terminales separadas (o con `pnpm dev`):

**Terminal 1 (Backend Fastify - Puerto 4000):**
```bash
cd apps/api
pnpm dev
```

**Terminal 2 (Frontend Next.js - Puerto 3000):**
```bash
cd apps/web
pnpm dev
```

Abrí [http://localhost:3000](http://localhost:3000) en tu navegador.

---

## 📚 Documentación de Negocio y Planificación
Todos los planes estratégicos y financieros se encuentran en [`docs/business-planning/`](./docs/business-planning):
- [Modelo de Negocio y Rentabilidad](./docs/business-planning/modelo_de_negocio.md)
- [Plan Técnico del MVP](./docs/business-planning/plan_tecnico_mvp.md)
- [Encuesta para Compradores y Artistas](./docs/business-planning/encuesta_compradores.md)
- [Estrategia de Pagos Mercado Pago y AstroPay](./docs/business-planning/pagos_mercadopago_astropay.md)
- [Guía de Despliegue en VPS](./docs/VPS_DEPLOYMENT_GUIDE.md)

