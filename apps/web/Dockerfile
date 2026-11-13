# Build desde la raíz del monorepo:  docker build -f apps/web/Dockerfile .
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @tupuestito/web...
COPY apps/web apps/web
COPY packages/shared packages/shared
# Las NEXT_PUBLIC_* se incrustan en el bundle en tiempo de build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SOCIAL_PROVIDERS
ARG NEXT_PUBLIC_SUPPORT_EMAIL
ARG NEXT_PUBLIC_LEGAL_NAME
ARG NEXT_PUBLIC_LEGAL_CUIT
ARG NEXT_PUBLIC_LEGAL_ADDRESS
ARG NEXT_PUBLIC_DATA_FISCAL_URL
ARG NEXT_PUBLIC_PLAUSIBLE_DOMAIN
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_SOCIAL_PROVIDERS=$NEXT_PUBLIC_SOCIAL_PROVIDERS \
    NEXT_PUBLIC_SUPPORT_EMAIL=$NEXT_PUBLIC_SUPPORT_EMAIL \
    NEXT_PUBLIC_LEGAL_NAME=$NEXT_PUBLIC_LEGAL_NAME \
    NEXT_PUBLIC_LEGAL_CUIT=$NEXT_PUBLIC_LEGAL_CUIT \
    NEXT_PUBLIC_LEGAL_ADDRESS=$NEXT_PUBLIC_LEGAL_ADDRESS \
    NEXT_PUBLIC_DATA_FISCAL_URL=$NEXT_PUBLIC_DATA_FISCAL_URL \
    NEXT_PUBLIC_PLAUSIBLE_DOMAIN=$NEXT_PUBLIC_PLAUSIBLE_DOMAIN \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @tupuestito/web build

FROM node:22-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/robots.txt').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
