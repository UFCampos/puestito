# Backups de PostgreSQL (pg_dump) con copia opcional a un bucket de Cloudflare R2
FROM postgres:16-alpine
RUN apk add --no-cache aws-cli curl
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh
ENTRYPOINT ["/usr/local/bin/backup.sh"]
