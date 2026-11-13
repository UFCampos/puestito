# 🎨 TuPuestito — Marketplace de Comisiones para Artistas Argentinos

Plataforma de vidrieras y comisiones digitales con arquitectura **no-custodial**: cada pago va directo a la cuenta de Mercado Pago del artista y TuPuestito cobra su comisión con `marketplace_fee`.

La especificación de referencia es [`docs/business-planning/plan_tecnico_mvp.md`](./docs/business-planning/plan_tecnico_mvp.md).

---

## 🎬 Demos del Flujo Completo

### 👤 Lado del Cliente (Comprador)
Explorar artistas, registrarse, solicitar una comisión 50/50 con extras y referencias, pagar la seña, pedir ajustes sobre el boceto, aprobar la entrega, abonar el saldo restante, descargar el original en HD y dejar una reseña.

<video src="https://raw.githubusercontent.com/UFCampos/puestito/main/docs/demo/demo-cliente.mp4" controls width="100%"></video>

> 💡 *Si tu visor de Markdown no reproduce el video en línea, podés [abrir `docs/demo/demo-cliente.mp4` directamente](./docs/demo/demo-cliente.mp4).*

### 🎨 Lado del Artista
Crear una nueva comisión por etapas (milestones) con el asistente tipo Fiverr, editar el precio de un servicio publicado, aceptar un pedido entrante, entregar cada etapa (incluyendo entrega final en `.zip` con vista previa protegida por marca de agua) y recibir la reseña en su vidriera pública.

<video src="https://raw.githubusercontent.com/UFCampos/puestito/main/docs/demo/demo-artista.mp4" controls width="100%"></video>

> 💡 *Si tu visor de Markdown no reproduce el video en línea, podés [abrir `docs/demo/demo-artista.mp4` directamente](./docs/demo/demo-artista.mp4).*

---

## 🧱 Stack (Plan §1)

| Capa | Tecnología |
|---|---|
| Monorepo | `pnpm` workspaces: `apps/web`, `apps/api`, `packages/shared` |
| Backend | **Fastify** + TypeScript + **Drizzle ORM** + **PostgreSQL 16** |
| Auth | **Better Auth**: email/contraseña, usuario, **Google** y **Discord** (sesiones en Postgres, cookie httpOnly) |
| Archivos | **Cloudflare R2**: bucket público (portfolio/avatares) + bucket privado (todo lo del pedido, con URLs firmadas) |
| Imágenes | `sharp`: marca de agua `MANUAL`, `AUTO_TEXT` o `AUTO_AVATAR` |
| Pagos | **Mercado Pago**: OAuth del artista (PKCE, tokens cifrados AES-256-GCM) + Checkout Pro con `marketplace_fee` 5% + webhooks firmados |
| Emails | **Resend** · avisos internos por **webhook de Discord** |
| Deploy | Docker Compose + **Caddy** (HTTPS automático) en un VPS |

## 🔄 Flujo del pedido (Plan §4)

`REQUESTED → (REJECTED) | ACCEPTED_WAITING_DEPOSIT → (EXPIRED a las 72 hs) | IN_PROGRESS_SKETCH ⇄ SKETCH_REVIEW → [WAITING_PAYMENT_AFTER_SKETCH] → WORKING_FINAL → [FINAL_PREVIEW_REVIEW → WAITING_PAYMENT_BEFORE_HD] → COMPLETED_HD_UNLOCKED`

Con un pago acreditado, cualquier estado en curso puede pasar a `DISPUTED` (reclamo abierto: el pedido queda en pausa y vuelve a su estado cuando se resuelve).

### Formas de cobro que elige el artista por comisión

| Plan | Cómo se cobra |
|---|---|
| `FULL_100` | 100% al aceptar el pedido. |
| `SPLIT_ON_SKETCH` / `SPLIT_ON_FINAL_PREVIEW` | 50% de seña + 50% al aprobar el boceto **o** la vista previa final. En el editor es una sola opción con el momento del segundo pago configurable. |
| `MILESTONES` | Pago por etapas: el artista define de 2 a 8 etapas (nombre, descripción, % y plazo; los % suman 100). Cada etapa se paga antes de empezarla y se aprueba al recibirla: `ACCEPTED_WAITING_DEPOSIT → MILESTONE_IN_PROGRESS → MILESTONE_REVIEW → MILESTONE_WAITING_PAYMENT → …`. La última etapa es la entrega final; al aprobarla se desbloquea el original. |

- Los montos, extras y fees se calculan **solo en el servidor**; el pedido guarda un *snapshot* inmutable de ToS, plan de pago, servicio y extras.
- El original HD vive en el bucket privado y **solo se entrega con una URL firmada de 5 minutos cuando el 100% figura `APPROVED`**.
- Los pagos se confirman por webhook (firma `x-signature` verificada) o al volver del checkout, consultando siempre la API de Mercado Pago. El procesamiento es idempotente.
- Los conceptos de cobro son neutros (`Encargo de ilustración digital #PST-1042 — @artista`), según el Plan §2.

### Cuando un pedido se complica

Ningún pedido queda trabado esperando a una de las partes. Los plazos se configuran por variable de entorno:

| Situación | Qué pasa | Variable (por defecto) |
|---|---|---|
| El artista no responde una solicitud | Recordatorio y luego vence, sin cobro | `REQUEST_EXPIRATION_DAYS` (7) |
| No se paga el pago inicial | Recordatorio y luego vence, libera el cupo | `DEPOSIT_EXPIRATION_HOURS` (72) |
| El comprador no revisa una entrega | Recordatorio y luego se aprueba sola | `REVIEW_AUTO_APPROVE_DAYS` (7) |
| No se paga un pago intermedio | Recordatorios; el artista puede cerrar el pedido | `PAYMENT_TIMEOUT_DAYS` (14) |
| El artista se atrasa | Aviso a las dos partes; luego, a moderación | `OVERDUE_ESCALATION_DAYS` (7) |
| Reclamo después de la entrega final | Ventana del comprador | `POST_DELIVERY_DISPUTE_DAYS` (7) |

- **Reclamos:** con un pago acreditado, cualquiera de las partes abre un reclamo desde la sala del pedido. El pedido se pausa y se resuelve por acuerdo, por reembolso o por el equipo.
- **Reembolsos:** los emite el artista desde la sala (con su cuenta de Mercado Pago). Total: inmediato. Parcial o sin reembolso: propuesta que el comprador acepta.
- **Mercado Pago después del pago:** reembolsos, contracargos y reclamos que informa Mercado Pago ahora mueven el pedido y avisan al equipo.

### Moderación, soporte y datos personales

- `/admin` (rol ADMIN, se asigna con `ADMIN_EMAILS`): resumen y checklist de lanzamiento, reclamos, denuncias, pedidos, usuarios (suspensión, insignia "100% Humano"), soporte y auditoría. Guía: [moderación](./docs/operaciones/moderacion.md).
- Botón **Denunciar** en puestitos, obras, comisiones, reseñas y pedidos.
- `/ayuda` (preguntas frecuentes + contacto) y `/arrepentimiento` (Res. 424/2020, sin necesidad de cuenta).
- `/cuenta`: descargar todos los datos y eliminar la cuenta (Ley 25.326). Con historial de pedidos, la cuenta se anonimiza.

---

## 🚀 Desarrollo local

Requisitos: Node 22+, pnpm, Docker (para Postgres).

```bash
pnpm install
pnpm db:up                                  # PostgreSQL 16 en Docker
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm db:seed                                # migraciones + datos demo
pnpm dev                                    # API :4000 + Web :3000
```

- Sin credenciales de R2, `STORAGE_DRIVER=local` guarda los archivos en `apps/api/storage/` con la misma semántica pública/privada.
- `PAYMENTS_MODE=mock` usa un simulador de checkout (requiere sesión del comprador). **La API se niega a arrancar con `mock` en producción.**
- Sin `RESEND_API_KEY`, los emails (verificación, recuperación de contraseña, avisos) se imprimen en la consola de la API.

Cuentas demo (contraseña `tupuestito123`): `maomao` y `kaito_ink` (artistas), `uriel_fan` (comprador), `moderadora` (admin, para `/admin`).

### Tests

```bash
pnpm test:unit   # lógica de montos, plazos, firmas y cifrado (sin base de datos)
pnpm test:e2e    # e2e/flow.mjs + e2e/launch.mjs contra una API real
```

Levanta un PostgreSQL embebido (PGlite), corre las migraciones y el seed, y recorre el flujo completo: auth, explorar, referencias firmadas, pedido 50/50, marca de agua, bloqueo del HD, pagos, reseñas y controles de permisos. `launch.mjs` cubre reclamos, reembolsos, contracargos, plazos automáticos (simulando el paso de los días), moderación, suspensiones, soporte y eliminación de cuentas.

Corre en un entorno aislado (API en `:4100`, Postgres embebido en `:55432`), así que se puede ejecutar con `pnpm dev` abierto sin tocar tu base de desarrollo.

### Límites de subida

| Archivo | Formatos | Máximo | Variable |
|---|---|---|---|
| Referencias del comprador | PNG, JPG, WebP | 5 MB c/u (hasta 10) | fijo (Plan §6) |
| Avatar / banner | PNG, JPG, WebP | 8 MB | `MAX_AVATAR_MB` |
| Obra de portfolio | PNG, JPG, WebP | 25 MB | `MAX_PORTFOLIO_MB` |
| Boceto y vista previa | PNG, JPG, WebP | 30 MB | `MAX_SKETCH_MB` |
| Entrega final | PNG, JPG, WebP, **.zip**, **.rar**, .psd | 200 MB | `MAX_FINAL_DELIVERY_MB` |

El formato de la entrega final se valida por el contenido del archivo, no por la extensión. Si es un paquete (.zip, .rar, .psd), el artista sube además una imagen para la vista previa con marca de agua. El frontend lee estos límites de `GET /api/config` y avisa antes de subir.

### Migraciones

```bash
pnpm --filter @tupuestito/api db:generate   # después de cambiar src/db/schema.ts
```

La API aplica las migraciones pendientes al iniciar.

---

## 🌐 Producción (VPS + Docker Compose + Caddy)

1. **DNS en Cloudflare**: `tupuestito.com.ar` y `api.tupuestito.com.ar` apuntando al VPS (SSL/TLS en *Full (strict)*).
2. **Cloudflare R2**: crear `tupuestito-public` (con dominio público, ej. `cdn.tupuestito.com.ar`) y `tupuestito-private` (sin acceso público). En **el bucket privado** configurar CORS para las subidas directas del navegador:
   ```json
   [{ "AllowedOrigins": ["https://tupuestito.com.ar"], "AllowedMethods": ["PUT", "GET"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
   ```
3. **Mercado Pago** (developers.mercadopago.com → app tipo *Marketplace*):
   - Redirect URI de OAuth: `https://api.tupuestito.com.ar/api/payments/mp/callback`
   - Webhooks → evento *Pagos* → `https://api.tupuestito.com.ar/api/payments/webhook`, y copiar la clave secreta en `MP_WEBHOOK_SECRET`.
4. **Google / Discord OAuth**: callback `https://api.tupuestito.com.ar/api/auth/callback/{google|discord}`.
5. **Resend**: verificar el dominio del remitente.
6. En el VPS:
   ```bash
   cp .env.production.example .env.production   # completar todos los secretos
   ./deploy/deploy.sh                           # backup previo, build, espera a /health
   ```

Antes de abrir al público: [checklist de lanzamiento](./docs/operaciones/lanzamiento.md). Deploy, backups, alertas y secretos: [runbook](./docs/operaciones/runbook.md). Prueba con dinero de prueba: [Mercado Pago sandbox](./docs/operaciones/mercadopago-sandbox.md).

> ⚠️ Guardá `ENCRYPTION_KEY` en un lugar seguro: sin ella no se pueden descifrar los tokens de Mercado Pago y los artistas tienen que volver a vincular su cuenta.

### Administración

- El equipo de moderación se define con `ADMIN_EMAILS` y trabaja desde `/admin` (incluida la insignia **"100% Humano Verificado"**).
- Drizzle Studio: `pnpm db:studio`.

---

## 📂 Documentación de negocio (`/docs`)

- [`modelo_financiero.xlsx`](./docs/modelo_financiero.xlsx) · [`modelo_de_negocio.md`](./docs/business-planning/modelo_de_negocio.md) · [`pagos_mercadopago_astropay.md`](./docs/business-planning/pagos_mercadopago_astropay.md) · [`encuesta_compradores.md`](./docs/business-planning/encuesta_compradores.md) · [`plan_tecnico_mvp.md`](./docs/business-planning/plan_tecnico_mvp.md)

AstroPay (USD) figura en el plan como *sandbox / futuro*: en el panel aparece como "Próximamente".
