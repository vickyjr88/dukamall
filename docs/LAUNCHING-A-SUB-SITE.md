# Launching a new storefront on its own domain (seeded from an existing shop)

Every storefront on this platform is a *shop*. A new domain (e.g. `nairobigents.com`)
is a new shop with its own domain attached, optionally seeded with another shop's
catalogue. After seeding, the two shops are independent: separate products, stock,
orders, customers, theme and settings.

## 1. Create the shop
`/portal/signup` on any existing platform address. Pick a slug (the shop's internal
address, e.g. `nairobigents`) and an owner login. Re-using an existing owner's email
requires that account's password.

## 2. Copy the products (platform admin)
Admin console -> Shops -> *the new shop* -> **Copy products from another shop**.
Choose the source shop, press **Preview**, check the numbers, then **Copy**.

- Copies products, sizes/variants and prices, photos (as links to the same files),
  descriptions, brands, search text and categories.
- Stock starts at 0 unless you tick *Also copy stock counts*. Decide this before the
  first copy: a later run skips products that already exist.
- Safe to run again: existing products (same address) are skipped, nothing is
  overwritten or deleted. A re-run picks up products added to the source since.
- Command-line equivalent, from a checkout with dependencies installed:
  `cd backend && npx ts-node scripts/copy-shop-products.ts --from msa --to nairobigents [--apply] [--stock]`
  (without `--apply` it only previews).

## 3. Connect the domain
1. DNS at the registrar: `A` record for `nairobigents.com` (and `www`) -> the platform
   server's IP.
2. New shop's portal -> **Domain** -> request `nairobigents.com`; add the TXT record it
   shows at the registrar; press **Verify** once it propagates.
3. aaPanel: add the site `nairobigents.com` (+ `www.nairobigents.com`), reverse proxy
   to the platform web upstream (same upstream pool and `shops-next-upstream.conf`
   extension as the msa site; see DEPLOYMENT.md), issue a Let's Encrypt certificate
   covering both names, and redirect `www` -> apex. Only the exact verified host
   resolves to the shop.

## 4. Set the shop up
WhatsApp number, currency, delivery fee and free-delivery amount, logo and theme,
Store info, Pages (delivery & returns, about, contact), Paystack keys if taking online
payments, order-alert email, and a trial/plan in the admin console.

## Things to know
- Photos are shared links. They keep working as long as the original files do.
- SKUs are identical in both shops. That is fine (each shop has its own feed and
  stock); keep it in mind if a catalogue manager ingests both feeds.
- Identical descriptions on two domains read as duplicate content to search engines.
  Rewrite titles and descriptions on the new shop over time (Products -> Search & sharing).
