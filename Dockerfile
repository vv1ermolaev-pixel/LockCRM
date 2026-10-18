# Production image. Built only by CI (.github/workflows/deploy.yml), pushed to GHCR
# and run on the server by deploy/compose.yaml. Locally Docker runs only Postgres.

FROM node:24-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
# pnpm version comes from "packageManager" in package.json
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The db module requires DATABASE_URL on import. This placeholder only exists during the
# build and is never used to connect: pages read data at request time, not at build time.
RUN NEXT_OUTPUT=standalone DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm build
# Migrations and seed run in the same image, which has no node_modules:
# bundle each script with its libraries into a single file
RUN pnpm exec esbuild scripts/migrate.ts scripts/seed.ts \
      --bundle --platform=node --target=node24 --format=esm \
      --out-extension:.js=.mjs --outdir=dist-scripts

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/dist-scripts ./scripts
USER node
EXPOSE 3000
# Git commit SHA of this build, shown by /health
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
CMD ["node", "server.js"]
