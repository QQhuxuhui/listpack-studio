# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────
#  apps/web — Next.js 15 (App Router) production image.
#
#  Build stages:
#    1. deps   — install pnpm + the full monorepo deps (cached layer).
#    2. build  — copy source, run `pnpm --filter web build`. Next
#                produces .next/standalone with everything bundled.
#    3. runtime — minimal node:22-alpine, copies the standalone bundle
#                + static assets + public folder. Runs as non-root.
#
#  Build from the repo root:
#      docker build -f apps/web/Dockerfile -t listpack/web .
#
#  Run:
#      docker run --rm -p 3000:3000 \
#        -e POSTGRES_URL=... -e AUTH_SECRET=... -e STRIPE_SECRET_KEY=... \
#        -e AGENT_SERVICE_URL=http://agent:8000 -e BASE_URL=https://your.host \
#        listpack/web
# ─────────────────────────────────────────────────────────────────────

# ── 1. deps ─────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
RUN corepack enable
WORKDIR /app

# Workspace manifests (cache-busting only when these change)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages ./packages
COPY tests-e2e/package.json ./tests-e2e/

RUN pnpm install --frozen-lockfile

# ── 2. build ────────────────────────────────────────────────────────
FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat
RUN corepack enable
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter web build

# ── 3. runtime ──────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Standalone server + static assets + public.
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

# next standalone entrypoint lives at apps/web/server.js after copy.
CMD ["node", "apps/web/server.js"]
