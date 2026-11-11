# 🎨 TuPuestito — Marketplace de Comisiones para Artistas Argentinos

Plataforma de vidrieras y comisiones digitales con arquitectura **no-custodial**: cada pago va directo a la cuenta de Mercado Pago del artista y TuPuestito cobra su comisión con `marketplace_fee`.

La especificación de referencia es [`docs/business-planning/plan_tecnico_mvp.md`](./docs/business-planning/plan_tecnico_mvp.md).

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

Cuentas demo (contraseña `tupuestito123`): `maomao` y `kaito_ink` (artistas), `uriel_fan` (comprador).

### Tests end-to-end de la API

```bash
pnpm test:e2e
```

Levanta un PostgreSQL embebido (PGlite), corre las migraciones y el seed, y recorre el flujo completo: auth, explorar, referencias firmadas, pedido 50/50, marca de agua, bloqueo del HD, pagos, reseñas y controles de permisos.

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
   pnpm prod:up                                 # docker compose -f docker-compose.prod.yml ... up -d --build
   ```

> ⚠️ Guardá `ENCRYPTION_KEY` en un lugar seguro: sin ella no se pueden descifrar los tokens de Mercado Pago y los artistas tienen que volver a vincular su cuenta.

### Administración

- La insignia **"100% Humano Verificado"** la otorga un usuario `ADMIN` (`POST /api/artists/:artistId/verify-human`). Para crear el primer admin: `UPDATE users SET role='ADMIN' WHERE username='...'`.
- Drizzle Studio: `pnpm db:studio`.

---

## 📂 Documentación de negocio (`/docs`)

- [`modelo_financiero.xlsx`](./docs/modelo_financiero.xlsx) · [`modelo_de_negocio.md`](./docs/business-planning/modelo_de_negocio.md) · [`pagos_mercadopago_astropay.md`](./docs/business-planning/pagos_mercadopago_astropay.md) · [`encuesta_compradores.md`](./docs/business-planning/encuesta_compradores.md) · [`plan_tecnico_mvp.md`](./docs/business-planning/plan_tecnico_mvp.md)

AstroPay (USD) figura en el plan como *sandbox / futuro*: en el panel aparece como "Próximamente".
