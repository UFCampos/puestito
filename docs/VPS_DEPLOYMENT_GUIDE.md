# 🚀 Guía de Despliegue en VPS de TuPuestito (Sprint 6)

Esta guía te permite desplegar **TuPuestito** en cualquier VPS económico (Hetzner, OVH, DigitalOcean o Vultr de ~US$5/mes) usando Docker Compose o Node.js directo con Caddy (HTTPS automático gratuito).

---

## 1. Requisitos en el VPS
- **OS:** Ubuntu 22.04 LTS o 24.04 LTS
- **RAM:** 1 GB o 2 GB (suficiente gracias a Fastify + SQLite/PostgreSQL)
- **Puertos:** 80 y 443 abiertos para Caddy

---

## 2. Configuración de Caddy (Reverse Proxy con HTTPS automático)

Instalar Caddy en Ubuntu:
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLF 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLF 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

Crear `/etc/caddy/Caddyfile`:
```caddy
tupuestito.com.ar {
    # Redirigir llamadas de API al backend Fastify
    handle /api/* {
        reverse_proxy localhost:4000
    }

    # Servir imágenes subidas
    handle /uploads/* {
        reverse_proxy localhost:4000
    }

    # Todo lo demás va al frontend Next.js
    handle {
        reverse_proxy localhost:3000
    }
}
```

Reiniciar Caddy:
```bash
sudo systemctl restart caddy
```

---

## 3. Despliegue de la App con PM2 o Systemd

1. Clonar el repositorio en `/var/www/tupuestito`:
```bash
git clone <tu-repo> /var/www/tupuestito
cd /var/www/tupuestito
pnpm install
```

2. Variables de entorno en producción:
Crear `/var/www/tupuestito/apps/api/.env`:
```env
PORT=4000
JWT_SECRET=tu_clave_super_secreta_jwt_produccion
ENCRYPTION_KEY=tu_clave_32_bytes_para_cifrar_tokens_mp
MP_CLIENT_ID=tu_client_id_mercado_pago
MP_CLIENT_SECRET=tu_client_secret_mercado_pago
```

3. Compilar y correr con PM2:
```bash
npm install -g pm2
pnpm build

# Iniciar Backend Fastify
cd apps/api
pm2 start dist/index.js --name "tupuestito-api"

# Iniciar Frontend Next.js
cd ../web
pm2 start npm --name "tupuestito-web" -- start

pm2 save
pm2 startup
```

---

## 4. Backups automáticos de Base de Datos
Para respaldar `tupuestito.db` diariamente a un bucket gratuito de Cloudflare R2:
```bash
crontab -e
# Agregar backup todos los días a las 04:00 AM:
0 4 * * * cp /var/www/tupuestito/apps/api/data/tupuestito.db /var/backups/tupuestito-$(date +\%F).db
```

