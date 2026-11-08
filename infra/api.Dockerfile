# syntax=docker/dockerfile:1.7
# Build:  docker build -f infra/api.Dockerfile -t marea-api .
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @marea/api... --filter @marea/db
COPY packages/db packages/db
COPY apps/api apps/api
RUN pnpm --filter @marea/db build && pnpm --filter @marea/api build
RUN pnpm deploy --filter @marea/api --prod --legacy /out

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out ./
# Migrations ship with the image so `migrate deploy` can run as a release step.
COPY --from=build /app/packages/db/prisma ./prisma
COPY --from=build /app/packages/db/prisma.config.ts ./prisma.config.ts
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
