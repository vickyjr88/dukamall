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
   handful of shops -- automate this with Caddy instead of nginx (or
   nginx + a companion ACME automation tool), since Caddy issues and
   renews a certificate automatically the first time it sees a new
   `server_name` in its config, with zero manual certbot steps per shop.
   **Recommendation: don't hand-roll per-shop nginx+certbot blocks past the
   first 2-3 shops** -- migrate the reverse-proxy layer to Caddy before it
   becomes 50 manual blocks to maintain.

   The self-service side of this (Phase 3, done) is app-level, not
   infra-level: a shop owner requests a domain in `/portal/domain`, the
   backend (`backend/src/shop/domain-verification.service.ts`) issues a
   random token and asks them to add it as a TXT record at
   `_shops-platform-verify.<domain>`, and only promotes the domain to
   `Shop.customDomain` -- the field `resolveByHost()` actually trusts for
   routing -- once that TXT record is confirmed by a real DNS lookup. This
   proves the shop owner controls the domain before the platform ever
   routes traffic for it or an operator adds an nginx/Caddy block for it.
   **The infra step (adding the `server_name` block + issuing a cert) is
   still manual** even after app-level verification succeeds -- an
   operator (or, eventually, an automated hook reacting to
   `domainVerifiedAt` being set) still has to add the domain to the
   reverse-proxy config. Wiring that trigger up is worth doing once the
   volume of custom-domain connections makes the manual step a bottleneck,
   not before.

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

## Running alongside drip-crm on the same server (msa.dripemporium.store)

This is the actual first deployment: this platform runs on the same VPS
that already hosts `dripemporium.store` (the drip-crm repo, aaPanel-managed,
Docker bridge at `172.17.0.1` -- see that repo's own `docs/DEPLOYMENT.md`
for the base server setup). The two stacks don't share a docker-compose
project or a database -- they're two independent Compose stacks, isolated
by the port blocks in the table above, coexisting on one host.

**`msa.dripemporium.store` is a *custom domain* for the `msa` shop, not this
platform's own `PLATFORM_DOMAIN`.** `dripemporium.store`'s apex belongs to
drip-crm; this platform only ever owns one subdomain of it
(`msa.dripemporium.store`), not the whole domain. That means the domain
connects through the same self-service flow any shop owner would use
(`/portal/domain`) -- there is no special-cased "platform apex" shortcut for
this shop, which is deliberate: it exercises the real onboarding path
instead of a one-off hand-wired route that every other shop's domain
wouldn't get.

1. **Clone and configure**, same as any deploy:
   ```bash
   cd /opt && git clone <this-repo> shops-platform && cd shops-platform
   cp .env.sample .env
   # JWT_SECRET, POSTGRES_*, MINIO_* -- fill in real values.
   # PLATFORM_DOMAIN can stay a placeholder (e.g. dukamall.app) for now --
   # this deployment's only real shop reaches it via a custom domain, not a
   # platform subdomain.
   ```
2. **Bring the stack up**: `./scripts/deploy.sh` (needs the ports in the table
   above to be free -- they're deliberately outside drip-crm's own 3003/
   3004/3101/3102 block, so both `docker compose up` invocations coexist on
   the same Docker daemon without touching each other's containers).
3. **Create the `msa` shop**: visit `http://<vps-ip>:3203/portal/signup` (or
   tunnel over SSH if the ports aren't open yet) with slug `msa`.
4. **Connect the domain**: log into `/portal/domain` for that shop, request
   `msa.dripemporium.store`, and add the TXT record it gives you at your DNS
   provider for `dripemporium.store` (this is a DNS-only change -- it does
   not touch drip-crm's own A/CNAME records for the apex or `www`/`api`).
   Click Verify once the TXT record propagates.
5. **Point the subdomain at this stack, not drip-crm's**: add an `A` (or
   `CNAME`) record for `msa.dripemporium.store` -> this same VPS's IP (drip-
   crm's own A record for the apex is untouched).
6. **aaPanel site + reverse proxy**, using the same conventions as drip-crm's
   own sites (see that repo's `docs/DEPLOYMENT.md` "Proxy configuration"
   section for the full walkthrough this mirrors):
   - Website -> Add site -> domain `msa.dripemporium.store`, no PHP project
     (reverse proxy only, same as drip-crm's own sites after their OpenCart
     PHP handler was removed -- check for and remove any leftover
     `location ~ \.php$` block here too, since aaPanel can carry one over
     from a site template).
   - Reverse Proxy -> target `http://172.17.0.1:3203` (this platform's web
     slot, NOT drip-crm's 3003 -- easy to fat-finger since both are
     Next.js storefronts on the same box).
   - In that site's **Config File** panel, add the same upstream-pool
     pattern drip-crm's own doc describes, pointed at *this* platform's
     ports instead:
     ```nginx
     upstream msa_web_pool {
         server 172.17.0.1:3203 max_fails=2 fail_timeout=5s;
         server 172.17.0.1:3204 max_fails=2 fail_timeout=5s backup;
     }
     ```
     then change `proxy_pass` to `http://msa_web_pool`. This shop's traffic
     now survives a `shops-platform` rolling deploy exactly the way
     drip-crm's own traffic survives one of its deploys -- the two rolling-
     deploy setups are independent and neither affects the other's uptime.
   - Request a Let's Encrypt cert for `msa.dripemporium.store` through
     aaPanel's SSL panel, same as any other site there.
7. Verify: `https://msa.dripemporium.store/` should load the shop's
   storefront (empty until synced -- see the next section), and
   `https://msa.dripemporium.store/portal/login` should reach this
   platform's portal -- both through the one aaPanel site, since the app
   itself (not nginx) is what tells a portal request from a storefront one.

**What this does NOT require touching**: drip-crm's own docker-compose
stack, its nginx sites, its database, or its `.env`. The two apps share
nothing except the same physical VPS and (once connected) DNS records under
the same parent domain -- a `shops-platform` deploy can never take
dripemporium.store's own storefront down, and vice versa.

## Syncing the `msa` shop's catalog from dripemporium.store

`backend/scripts/sync-drip-emporium-feed.ts` pulls Drip Emporium's own
public product feed (`https://dripemporium.store/product-feed.csv` --
already built and running for its Meta/TikTok catalog ads, see that repo's
`web/app/lib/product-feed.ts`) into a shop's catalog on this platform. It
never touches a product a shop owner added by hand through the portal --
see the script's own header comment for exactly how that boundary is
enforced (a `syncSourceId` column that manually-created products never
get).

**One-off run** (e.g. right after creating the `msa` shop):
```bash
cd /opt/shops-platform/backend
npm run sync:drip-emporium -- msa
```

**Scheduled** (so `msa`'s catalog tracks price/stock/new-product changes on
dripemporium.store automatically) -- a cron entry on the VPS, run inside the
backend container so it shares its `DATABASE_URL`/network access rather than
needing its own:
```cron
# Every hour, matching the feed's own revalidate window (see
# web/app/product-feed.csv/route.ts in drip-crm) -- no point syncing more
# often than the source itself refreshes.
0 * * * * cd /opt/shops-platform && docker compose exec -T backend npm run sync:drip-emporium -- msa >> /var/log/shops-platform-sync.log 2>&1
```

The script logs a created/updated/deactivated/variants-written summary on
every run and exits non-zero on failure (a bad feed fetch, a malformed
row), so cron's own mail-on-error behavior (or a `||` alert hook, if wired
up later) surfaces a broken sync without needing to tail the log
proactively.

## Subsequent deploys

Push to `main` and `.github/workflows/deploy.yml` handles the rest: a
`verify` job builds and typechecks both apps (catching a broken build
*before* it ever reaches the server), then a `deploy` job SSHes in and runs
`scripts/deploy.sh` on the box -- no manual nginx changes needed for a
normal deploy, see that script's own header comment for the full
rolling-swap mechanics. A manual `workflow_dispatch` run (with an optional
`ref` input) redeploys a specific branch or tag on demand, e.g. to replay a
failed run or roll back to a previous commit.

Mirrors drip-crm's own `deploy.yml` structure exactly, one difference: this
platform's `scripts/deploy.sh` has no `RUN_SEED` concept (there is no demo
seed data to insert -- shop creation is entirely self-service via
`/portal/signup`), so the workflow doesn't carry that input.

One platform-specific note: **a deploy-caused outage takes every shop down
at once**, not just one merchant's site. The two-slot rolling-deploy setup
exists specifically to make that risk near-zero from day one -- never
"simplify" this back to a single-instance stop-and-restart, even for a
quick fix, given how much more is riding on uptime here than for a
single-tenant app.

## GitHub Actions secrets

Set these under the repo's **Settings -> Environments -> production**
(the workflow targets the `production` environment specifically, so an
environment-level secret, not a repo-level one, is what the deploy job
actually reads) -- `Settings -> Secrets and variables -> Actions` also
works if you'd rather not gate deploys behind an environment's own
protection rules, but an environment is the better default here since it
lets you require a manual approval before deploy.sh ever runs, and keeps
this platform's secrets from being visible to a workflow run against a
different repo that happens to share the same GitHub org.

| Secret | What it is |
|---|---|
| `DUKAMALL_SSH_KEY` | Private half of a dedicated deploy keypair (`ssh-keygen -t ed25519 -C "dukamall-deploy"` -- don't reuse a personal key). The matching public key goes in the server user's `~/.ssh/authorized_keys`. |
| `DUKAMALL_SSH_KNOWN_HOSTS` | Output of `ssh-keyscan -p <port> <host>` run once from a trusted machine, pinning the host key so the connection can't be silently redirected. Paste the full output (may be more than one line). |
| `DUKAMALL_HOST` | The VPS's IP or hostname -- the same server drip-crm already runs on, per the "Running alongside drip-crm" section above. |
| `DUKAMALL_USER` | The SSH user the deploy key is authorized for. Needs permission to run `docker compose` in `DUKAMALL_DEPLOY_PATH` -- doesn't need to be root if that user is already in the `docker` group. |
| `DUKAMALL_PORT` | SSH port, if not the default 22. Optional -- the workflow falls back to `22` when unset. |
| `DUKAMALL_DEPLOY_PATH` | Absolute path to the cloned repo on the server, e.g. `/opt/shops-platform` (see the "Clone and configure" step earlier in this doc). |

**Not a GitHub secret, and never should be**: `JWT_SECRET`,
`POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`, or anything else from `.env`.
Those live only in the server's own `.env` file (never committed, never
touched by CI) -- the deploy workflow's job is getting code onto the
server and running the deploy script there, not shipping secrets through
Actions. This is the same boundary drip-crm's own deploy pipeline holds.
