# Deployment

Mirrors drip-crm's own rolling-deploy setup (`docker-compose.yml` two-slot
pattern + `scripts/deploy.sh`) almost exactly -- read that project's
`docs/DEPLOYMENT.md` for the full nginx/aaPanel walkthrough if you haven't
set up a rolling deploy before. This doc only covers what's genuinely
different for a multi-tenant platform: multiple domains per deployment
instead of one.

## Port block

Deliberately distinct from drip-crm's own ports so both stacks can run on
the same host without colliding:

| Service | Port |
|---|---|
| web (slot a) | 3203 |
| web (slot b, standby) | 3204 |
| backend (slot a) | 3211 |
| backend (slot b, standby) | 3212 |
| Postgres | 15533 |
| Redis | 16580 |
| MinIO S3 | 19102 |
| MinIO console | 19103 |

## The multi-domain problem

drip-crm's nginx config proxies exactly one domain to one upstream pool.
This platform needs nginx to route **many** domains -- one per shop, plus
the platform's own wildcard subdomain -- to the same upstream pool, since
every shop is served by the same web/backend containers (tenant resolution
happens inside the app, not at the nginx layer -- see
`backend/src/shop/shop.service.ts#resolveByHost` and `web/middleware.ts`).

Two domain shapes to handle:

1. **Platform subdomains** (`<slug>.dukamall.app`) -- one wildcard nginx
   `server_name *.dukamall.app;` block covers every shop that hasn't
   connected a custom domain. One wildcard SSL certificate covers all of
   them (`certbot certonly --manual --preferred-challenges dns -d
   dukamall.app -d *.dukamall.app`, since wildcard certs require DNS-01
   challenge, not HTTP-01).
2. **Custom domains** (`nairobigents.co.ke`) -- each one needs its own
   `server_name` block and its own certificate. This does NOT scale to
   manually adding an nginx block per shop as the platform grows past a
   handful of shops -- once self-service custom-domain connection is built
   (design doc Phase 3), automate this with Caddy instead of nginx (or
   nginx + a companion ACME automation tool), since Caddy issues and
   renews a certificate automatically the first time it sees a new
   `server_name` in its config, with zero manual certbot steps per shop.
   **Recommendation: don't hand-roll per-shop nginx+certbot blocks past the
   first 2-3 shops** -- migrate the reverse-proxy layer to Caddy before it
   becomes 50 manual blocks to maintain.

Both shapes proxy to the exact same upstream pool (both web ports, both
backend ports, exactly like drip-crm's own nginx config) -- there is
nothing shop-specific in the proxy layer itself, only in which
`server_name` values are listed.

## First deploy checklist

1. Provision the VPS, install Docker, clone this repo to `/opt/shops-platform`.
2. Copy `.env.sample` to `.env`, fill in `JWT_SECRET` (generate with `openssl
   rand -hex 32`), `PLATFORM_DOMAIN` (the real apex domain, e.g.
   `dukamall.app`), Postgres/MinIO credentials.
3. Point DNS: an `A` record for the apex domain and a wildcard `A` record
   (`*.dukamall.app`) both at the VPS IP.
4. Set up nginx (or Caddy) per the multi-domain section above, proxying to
   `127.0.0.1:3203`/`3204` (web) and `127.0.0.1:3211`/`3212` (backend) --
   backend only needs to be reachable for the storefront's own
   server-to-server calls and any direct API consumers, not usually exposed
   to the public internet on its own subdomain.
5. Run `./scripts/deploy.sh` -- it builds both images, runs migrations,
   brings up slot "a", and writes `.deploy-active-slot`.
6. Visit `https://<your-test-shop>.dukamall.app/portal/signup` and create
   the first real shop.

## Subsequent deploys

Same as drip-crm: `./scripts/deploy.sh` on the VPS (or via the CI workflow,
once one exists), no manual nginx changes needed for a normal deploy -- see
that script's own header comment for the full rolling-swap mechanics.

One platform-specific note: **a deploy-caused outage takes every shop down
at once**, not just one merchant's site. The two-slot rolling-deploy setup
exists specifically to make that risk near-zero from day one -- never
"simplify" this back to a single-instance stop-and-restart, even for a
quick fix, given how much more is riding on uptime here than for a
single-tenant app.
