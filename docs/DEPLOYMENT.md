# Deployment

How to take ListPack Studio from `pnpm dev` to a real domain serving
real users.

This document covers three deployment paths, ranked by setup effort:

1. **docker-compose on a single VPS** — cheapest, fastest path to live.
   You own a 4 vCPU / 8 GB box (Hetzner, DigitalOcean, Vultr).
2. **Fly.io** — managed deploy, separate machines per service. Easiest
   horizontal scaling.
3. **Vercel (web) + Railway/Fly (agent + Postgres)** — most polished
   front-end serving, separate hosts for the Python agent.

Pick one. All three reuse the same Dockerfiles + env templates.

---

## 0. Prerequisites

| Thing | Why | Where |
|---|---|---|
| Domain | landing + dashboard | Namecheap / Cloudflare |
| Postgres 15+ | DB | docker-compose / managed (Supabase / Neon / RDS) |
| Stripe account (test or live) | payments | https://dashboard.stripe.com |
| Resend account (optional) | transactional email | https://resend.com |
| Shopify Partners (optional) | Shopify OAuth | https://partners.shopify.com |
| Sentry (optional) | error monitoring | https://sentry.io |

Everything tagged "optional" can be left unset — the app degrades
gracefully (email no-ops, OAuth flow returns 503, Sentry calls hit the
local logger only).

---

## 1. docker-compose on a single VPS (simplest)

### 1.1 First-time setup

```bash
ssh root@your.vps
apt update && apt install -y docker.io docker-compose-plugin git
git clone https://github.com/QQhuxuhui/listpack-studio.git
cd listpack-studio
cp apps/web/.env.example apps/web/.env
cp apps/agent/.env.example apps/agent/.env
$EDITOR apps/web/.env apps/agent/.env   # fill secrets
docker compose up -d --build
```

### 1.2 One-time migrations + seed

```bash
docker compose exec web pnpm --filter web db:migrate
docker compose exec agent uv run python -m compliance.rules.seed
```

### 1.3 Reverse proxy (Caddy is one line)

```caddy
listpack.studio {
  reverse_proxy localhost:3000
}
```

Caddy auto-provisions Let's Encrypt. Done.

### 1.4 Upgrades

```bash
git pull
docker compose up -d --build
docker compose exec web pnpm --filter web db:migrate  # if schema changed
```

---

## 2. Fly.io (managed, two apps)

### 2.1 Web app

```bash
flyctl launch --no-deploy --dockerfile apps/web/Dockerfile --name listpack-web
flyctl secrets set \
  POSTGRES_URL='postgres://...' \
  AUTH_SECRET="$(openssl rand -hex 32)" \
  AGENT_SERVICE_URL='https://listpack-agent.fly.dev' \
  AGENT_SERVICE_TOKEN='shared-with-agent' \
  STRIPE_SECRET_KEY='sk_live_...' \
  STRIPE_WEBHOOK_SECRET='whsec_...' \
  BASE_URL='https://app.listpack.studio' \
  --app listpack-web
flyctl deploy --app listpack-web
```

### 2.2 Agent app

```bash
flyctl launch --no-deploy --dockerfile apps/agent/Dockerfile --name listpack-agent
flyctl volumes create agent_storage --size 10 --app listpack-agent
flyctl secrets set \
  POSTGRES_URL='postgres://...' \
  AGENT_SERVICE_TOKEN='shared-with-web' \
  SPARKCODE_BASE_URL='https://...' \
  SPARKCODE_API_KEY='sk-...' \
  STORAGE_ROOT=/storage \
  --app listpack-agent
flyctl deploy --app listpack-agent
```

Add to `fly.toml` for the agent:

```toml
[mounts]
  source = "agent_storage"
  destination = "/storage"
```

### 2.3 Postgres

Easiest: `flyctl postgres create` and attach to both apps. For Brand /
Agency volume use Supabase or Neon — they auto-backup.

---

## 3. Vercel (web) + Fly (agent) — split host

Vercel runs the Next.js frontend with edge SSR + CDN. The Python agent
sits on Fly with the heavy ML wheels.

1. Push to GitHub.
2. Vercel: import the repo, set root = `apps/web`, framework = Next.js.
   Add env vars (Settings → Environment Variables) matching
   `apps/web/.env.example`. Point `AGENT_SERVICE_URL` at the Fly URL.
3. Agent: same as **Section 2.2** above.
4. Web hits agent over HTTPS; the shared `AGENT_SERVICE_TOKEN` gates
   service-to-service auth.

**Caveat — output downloads**: `LocalFsStorage` won't span Vercel + Fly
(different filesystems). For this split host, either:
- Implement S3Storage (`lib/storage/s3.ts` is stubbed), or
- Keep both web + agent on the same Fly volume.

---

## 4. Configuring Stripe (live or test mode)

In the Stripe dashboard create **four products**, with these exact
names — `lib/payments/plans.ts::mapStripeProductToPlan` matches by name:

| Product | Price | SKU quota |
|---|---|---|
| Free | $0 / mo | 5 |
| Starter | $19 / mo | 30 |
| Pro | $49 / mo | 100 |
| Brand | $149 / mo | 500 |

Add a webhook endpoint pointing at `https://app.listpack.studio/api/stripe/webhook`
listening for:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

### Test locally

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
# copy the signing secret it prints into your .env
```

---

## 5. Resend email setup

1. Sign up at https://resend.com → API Keys → create.
2. Verify your sending domain (SPF + DKIM TXT records).
3. Set `RESEND_API_KEY=re_...` and `EMAIL_FROM="ListPack <hi@your-domain.com>"`.

Without these, `lib/email/client.ts` logs every send to stdout instead of
calling the API — the rest of the app still works.

---

## 6. Shopify App submission (only needed for /dashboard/connections)

1. Create a Public App in Partners dashboard.
2. App URL: `https://app.listpack.studio/api/shopify/oauth/authorize`
3. Redirect URL: `https://app.listpack.studio/api/shopify/oauth/callback`
4. Scopes: `read_products,write_products,write_files`
5. Copy API key + API secret into `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET`.
6. Submit for review — Shopify takes 5–10 working days.

---

## 7. Observability

### Logs

The agent emits JSON-line logs when `LOG_FORMAT=json`. Pipe to anything
that reads JSONL (Vector / Promtail / Datadog Agent / Fly's built-in
log drain).

### Sentry (when ready)

```bash
pnpm --filter web add @sentry/nextjs
```

Replace the stub bodies in `apps/web/lib/observability/sentry.ts` and
`apps/agent/observability/sentry.py` with the real SDK calls. Set
`SENTRY_DSN` in both apps.

---

## 8. Smoke test checklist after deploy

- [ ] `GET https://app.listpack.studio/` → landing page renders
- [ ] `POST /api/locale {"locale":"zh-CN"}` then refresh → header in 中文
- [ ] Sign up a new account → arrive at `/onboarding`
- [ ] Walk the onboarding wizard with a real product photo → SSE
      streams → `View outputs` lands on `/dashboard/runs/{id}` with
      thumbnails
- [ ] `/pricing` shows 4 cards with prices pulled from Stripe
- [ ] Subscribe → Stripe webhook fires → plan upgrades on `/dashboard`
- [ ] `ADMIN_USER_EMAILS` containing your email → `/admin` lists workspaces
- [ ] Cancel run via `/dashboard/runs/new` Pause button → SSE shows
      `run.interrupted` frame

If any step fails, check structured logs first — every error path emits
a `captureException` line with the relevant `run_id` / `workspace_id`.
