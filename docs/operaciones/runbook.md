# Runbook de operación

## Deploy
- Automático: cada push a `main` corre CI y, si están los secrets `DEPLOY_HOST`, `DEPLOY_USER` y `DEPLOY_SSH_KEY` (y la variable `DEPLOY_PATH`, por defecto `/opt/tupuestito`), entra por SSH al VPS y ejecuta `./deploy/deploy.sh`.
- Manual, en el VPS: `cd /opt/tupuestito && git pull && ./deploy/deploy.sh`.
- El script hace un backup previo, levanta las imágenes nuevas, espera a que `/health` responda con la versión desplegada (hash de git) y si no, muestra los logs y sale con error.
- **Volver atrás:** `git checkout <sha anterior> && ./deploy/deploy.sh`. Las migraciones de base solo agregan columnas y tablas, así que una versión anterior sigue funcionando.

## Backups
- El servicio `backup` hace un `pg_dump` cada `BACKUP_INTERVAL_HOURS` (24 por defecto), guarda `BACKUP_RETENTION_DAYS` días en el volumen `backups` y, con `BACKUP_S3_BUCKET`, sube una copia a R2. Si algo falla, avisa en Discord.
- Un backup que solo vive en el VPS se pierde con el VPS: configurá el bucket.
- Backup manual: `docker compose -f docker-compose.prod.yml --env-file .env.production run --rm backup once`.
- Restaurar: `./deploy/restore.sh tupuestito-AAAAMMDD-HHMMSS.dump --yes` (reemplaza toda la base; detiene la API mientras tanto). Probalo al menos una vez antes de lanzar.

## Monitoreo y alertas (Discord)
| Alerta | Qué hacer |
|---|---|
| 🚨 Error 500 en … | Bug o servicio externo caído. Mirar `docker compose logs api`. Se agrupan: una por error cada 10 minutos. |
| 🚨 Error en la web | Excepción en el navegador de un usuario. Reproducir en la ruta indicada. |
| 🚨 CONTRACARGO | El pedido quedó en reclamo. Revisarlo en `/admin` → Reclamos. |
| ⚠️ Reclamo / 🚩 Denuncia / 🚨 URGENTE | Atender según [moderación](./moderacion.md). URGENTE = contenido ilegal o menores. |
| ↩️ Botón de arrepentimiento | Responder dentro de las 24 hs. |
| 🐢 Atraso | Pedido con más de `OVERDUE_ESCALATION_DAYS` días de atraso. Contactar al artista. |
| ⚠️ Reembolso parcial / pago fuera de flujo | Revisar el pedido a mano. |
| 🚨 Backup de la base | El backup no se hizo o no se subió. Prioridad alta. |

Además, un monitor externo (UptimeRobot) sobre `/health` y la home avisa si el sitio entero se cae.

## Tareas programadas
La API corre cada `JOBS_INTERVAL_MINUTES` los plazos automáticos (vencimientos, recordatorios, aprobaciones automáticas, atrasos) y una vez por día la limpieza de archivos. Se pueden correr a mano desde `/admin` → Resumen → "Correr plazos y limpieza ahora". Son idempotentes: correrlas dos veces no repite avisos.

## Secretos
- `BETTER_AUTH_SECRET`: rotarlo cierra todas las sesiones.
- `ENCRYPTION_KEY`: cifra los tokens de Mercado Pago. **Si se pierde o se cambia**, los tokens no se pueden leer: los artistas tienen que volver a vincular Mercado Pago desde su panel (hasta entonces no pueden cobrar). Guardala fuera del servidor.
- `MP_WEBHOOK_SECRET`, `RESEND_API_KEY`, credenciales de R2: rotar en el proveedor, actualizar `.env.production` y redeployar.
