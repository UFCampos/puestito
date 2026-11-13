# Checklist de lanzamiento

Marcá cada punto antes de abrir al público. El panel `/admin` → **Resumen** muestra en vivo lo que falta configurar.

## Cuentas y credenciales
- [ ] Dominio en Cloudflare: `tupuestito.com.ar` y `api.tupuestito.com.ar` apuntando al VPS (SSL *Full (strict)*).
- [ ] Cloudflare R2: buckets `tupuestito-public` (con dominio `cdn.`), `tupuestito-private` (con CORS, ver README) y `tupuestito-backups` (privado).
- [ ] Resend: dominio del remitente verificado (SPF y DKIM). Probar que llega un email de verificación a Gmail y a Outlook sin caer en spam.
- [ ] Mercado Pago: app tipo *Marketplace* **aprobada**, redirect URI de OAuth, webhook del evento *Pagos* y `MP_WEBHOOK_SECRET`.
- [ ] OAuth de Google y Discord con los callbacks de producción.
- [ ] `.env.production` completo y guardado **fuera** del servidor, junto con `ENCRYPTION_KEY`.

## Legales y fiscales (Argentina)
- [ ] Cargar `NEXT_PUBLIC_LEGAL_NAME`, `NEXT_PUBLIC_LEGAL_CUIT` y `NEXT_PUBLIC_LEGAL_ADDRESS` (aparecen en el pie y en los textos legales).
- [ ] Alta del formulario 960/D **Data Fiscal** en ARCA y su link en `NEXT_PUBLIC_DATA_FISCAL_URL`.
- [ ] Revisión de `/terms` y `/privacy` por un abogado (ver los puntos sugeridos abajo).
- [ ] Inscripción de la base de datos ante la AAIP (Registro Nacional de Bases de Datos).
- [ ] Facturación de la comisión del 5% (monotributo o sociedad) y cómo se emiten las facturas a los artistas.
- [ ] `SUPPORT_EMAIL` existe y alguien la lee todos los días.
- [ ] Definido quién responde el **botón de arrepentimiento** dentro de las 24 hs.

Puntos para revisar con un abogado: alcance de la excepción del art. 1116 CCyC para obras a medida, la aprobación automática de entregas y el cierre por falta de pago frente a la Ley 24.240, la licencia de uso por defecto del comprador, y la responsabilidad de la plataforma como intermediaria.

## Operación
- [ ] Backups funcionando y **una restauración real probada** (`deploy/restore.sh`).
- [ ] Monitor externo (UptimeRobot o similar) sobre `https://api.tupuestito.com.ar/health` y la home.
- [ ] `DISCORD_WEBHOOK_URL` configurado: ahí llegan errores, reclamos, denuncias, contracargos y fallas de backup.
- [ ] `ADMIN_EMAILS` con el equipo de moderación (con el email verificado).
- [ ] Secrets de GitHub para el deploy automático (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`).

## Pruebas
- [ ] Recorrido completo en sandbox de Mercado Pago ([plan](./mercadopago-sandbox.md)).
- [ ] Beta cerrada con 5 a 10 artistas reales antes de abrir el registro al público.
