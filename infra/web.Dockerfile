# syntax=docker/dockerfile:1.7
# Storefront + admin (Next.js), built as a self-contained server.
#
#   docker build -f infra/web.Dockerfile -t marea-web \
#     --build-arg NEXT_PUBLIC_SITE_URL=https://www.example.me \
#     --build-arg NEXT_PUBLIC_MEDIA_HOSTS=media.example.me \
#     --build-arg API_INTERNAL_URL=http://api:4000 .
#
# NEXT_PUBLIC_* values and the API address are compiled into the build, so staging and
# production get their own image (same commit, different build arguments).
FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_MEDIA_HOSTS=""
ARG API_INTERNAL_URL=http://api:4000
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_MEDIA_HOSTS=$NEXT_PUBLIC_MEDIA_HOSTS \
    API_INTERNAL_URL=$API_INTERNAL_URL \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
RUN test -n "$NEXT_PUBLIC_SITE_URL" || (echo "Set --build-arg NEXT_PUBLIC_SITE_URL" && exit 1)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @marea/web...
COPY apps/web apps/web
RUN pnpm --filter @marea/web build

FROM base AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
