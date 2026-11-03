# New products from Drip Emporium (instant sync)

Nairobi Gents follows dripemporium.store for **new** products: when one is created on Drip Emporium, it appears on
nairobigents.com within seconds. This is deliberately not a mirror. The shop's own descriptions, prices, stock and
categories are never changed.

## What it does, and never does

- **Creates** a Drip product the shop does not have. Matching is by variant SKU, not name or address, so a product
  the shop has renamed or re-described is recognised and left alone.
- **Adds sizes** that Drip adds later, but only to products this sync created itself (they carry a `syncSourceId`,
  the Drip product id). A hand-curated product never gets sizes added.
- **Never** edits, re-prices, re-describes, deactivates or deletes anything. Retiring a product on Drip does not retire
  it here; do that in the portal.
- New sizes start with **stock 0**, the same default as "Copy products from another shop": two storefronts showing
  Drip's counts for the same pairs would oversell. Set what this shop holds in the portal.
- Descriptions arrive as Drip wrote them. Rewrite them in the portal if you want this shop's text to differ (search
  engines treat identical text on two sites as duplicates).
- A Drip product with no photo or no sizes yet is skipped and picked up on a later run once it is complete. One whose
  address is already used by a different product here is not created; it is logged (`not created, a different product
  here already uses this address`) for a person to resolve.

Rules live in `backend/src/drip-sync/drip-sync.plan.ts` (pure, unit-tested in `test/unit/drip-sync.spec.ts`).

## How it works

1. drip-crm's `CatalogueSyncService` sends a signed `POST` to
   `/integrations/drip-emporium/catalogue-changed` a few seconds after the last product or size change (a burst of
   edits becomes one call). The call carries no product data.
2. The route checks the signature (HMAC-SHA256 of `<timestamp>.<body>` with the shared secret; requests more than 5
   minutes old are refused), answers `202` at once, and runs the sync in the background. Changes that arrive while
   one is running queue exactly one more run.
3. The sync reads Drip's live public catalogue (`GET /shop/products`, uncached) and applies the rules above to each
   shop in `DRIP_SYNC_TARGET_SHOPS`.

A notification that is lost (a deploy at the wrong moment) is made up for by the next change, or by the command below.

## One-time setup

The route does not exist (404) until `DRIP_SYNC_SECRET` is set. The same value goes on both servers. On the VPS:

```bash
SECRET=$(openssl rand -hex 32)
echo "DRIP_SYNC_SECRET=$SECRET" >> /root/shops-platform/.env
printf 'CATALOGUE_SYNC_URL=https://shops-api.dripemporium.store/integrations/drip-emporium/catalogue-changed\nCATALOGUE_SYNC_SECRET=%s\n' "$SECRET" >> /root/drip-emp-ops/.env
```

Then redeploy (push) shops-platform and drip-crm, or recreate their backends, so the containers pick the values up.
`DRIP_SYNC_TARGET_SHOPS` (default `nairobigents`) lists the shops that follow Drip; add `msa` to include it.
`DRIP_API_URL` (default `https://api.dripemporium.store`) is where the catalogue is read.

## Catch-up and safety net

```bash
docker compose exec -T backend npx ts-node scripts/sync-drip-new-products.ts            # preview
docker compose exec -T backend npx ts-node scripts/sync-drip-new-products.ts --apply    # write
```

(`--shop <slug>` for one shop.) It uses the same code as the live route, so what it previews is what the route will do.

## Checking it works

Create a product on Drip, then watch `docker logs shops-platform-backend<N>-1 | grep -i drip`: a line like
`nairobigents: created <slug>; ...` appears within about ten seconds. A wrong secret shows as
`Catalogue sync notice refused: HTTP 401` in the drip-crm backend log.

## History

The earlier route was Drip feed -> msa (`scripts/sync-drip-emporium-feed.ts`, which rewrites content and so must not
be run on curated shops) -> Nairobi Gents (a one-time "Copy products"). Neither passed new Drip products on after
2026-10, which is the gap this closes (16 products, caught up on 2026-11-03).
