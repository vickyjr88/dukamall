# Dubai Merchants Shops Platform

A shared, multi-tenant storefront system for the 50+ independent shops
trading at Dubai Merchants Mall -- each shop gets its own branded site, its
own catalog and orders, and its own visual theme, while running on one
shared backend, one shared web app, and one shared database.

Design and technical proposal: see the published artifact from the planning
session (Design Document, Technical Document, and Shortest Path to
Success). This repo is the "Shortest Path" plan being executed.

## What's here

- `backend/` -- NestJS + Prisma API. Every tenant-owned table carries a
  `shopId`; `ShopScopeGuard` (`backend/src/common/shop-scope.guard.ts`) is
  the single choke point that resolves and enforces it on every request.
- `web/` -- Next.js storefront + portal admin. `middleware.ts` resolves the
  incoming domain to a shop and forwards `x-shop-id` to the API on every
  request; `app/(storefront)/` is the customer-facing site, `app/portal/`
  is shop-owner admin.
- `docker-compose.yml` / `scripts/deploy.sh` -- rolling, two-slot deploy
  (mirrors the pattern already proven in the `drip-crm` repo), so a deploy
  never takes every shop on the platform offline at once.

## What's deliberately NOT here

No payroll, no double-entry accounting, no HR, no fixed-asset registers.
Every shop gets a plain stock count per product variant and a sales tally
read straight off orders -- see `backend/src/reports/` and
`ProductVariant.stockOnHand` in the Prisma schema. This is intentional, not
a phase-one gap: see the design doc's "What's deliberately out" section.

## Local development

```bash
cp .env.sample .env
# fill in JWT_SECRET (openssl rand -hex 32) and the Postgres/MinIO values

docker compose up -d db redis minio
cd backend && npm install && npx prisma migrate dev
npm run dev   # backend on :3200 (or PORT env)

cd ../web && npm install
npm run dev   # web on :3202
```

Create your first shop via `POST /onboarding/shops` (or visit
`/portal/signup` once the web app is running), then log in at
`/portal/login` with the shop's slug, your email, and password.

To view a shop's storefront locally, either add an `/etc/hosts` entry
mapping `<slug>.localhost` to `127.0.0.1` and browse to
`http://<slug>.localhost:3202`, or send a `Host` header directly:

```bash
curl -H "Host: <slug>.localhost:3202" http://localhost:3202/
```

## Deploying

See `docs/DEPLOYMENT.md` -- covers the multi-domain nginx/SSL setup that's
genuinely different from a single-tenant deploy; everything else follows
the same rolling two-slot pattern as `drip-crm`.
