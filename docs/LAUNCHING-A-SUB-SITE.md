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

A shop has **one primary domain**. Its `www`/apex twin needs no second connection: with
`nairobigents.com` connected, `www.nairobigents.com` reaches the same shop and is
redirected (308) to `nairobigents.com`, keeping the path and query. (If the primary is the
`www` form, the apex redirects to it.) Another shop cannot claim the twin of a domain
that is taken.

1. **DNS** (at the DNS provider; Cloudflare if the domain uses it): `A` records for
   `nairobigents.com` **and** `www` -> the platform server's IP.
2. **Platform:** the new shop's portal -> **Domain** -> request `nairobigents.com`; add the
   TXT record it shows; press **Verify**. Until the domain shows as *live* here, the
   storefront has no shop to serve for it (see "502" below). Platform admins can
   force-verify from the shop's admin page if ownership is confirmed another way.
3. **aaPanel site** `nairobigents.com` with `www.nairobigents.com` as a second domain name
   (so nginx's `server_name` lists both). Reverse proxy to `http://shops_web`, and make
   sure the proxy passes the original host:
   ```nginx
   proxy_pass http://shops_web;
   proxy_set_header Host $host;                 # essential: the app picks the shop from this
   proxy_set_header X-Real-IP $remote_addr;
   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   proxy_set_header X-Forwarded-Proto $scheme;
   ```
   In aaPanel's Reverse Proxy dialog, **Send domain must be `$host`** (not the target).
4. **Per-site extension file** (same as the msa site). Create
   `/www/server/panel/vhost/nginx/extension/nairobigents.com/shops-next-upstream.conf`
   containing
   ```nginx
   proxy_next_upstream error timeout http_502 http_503 http_504;
   ```
   then reload nginx. Without it, nginx's global setting also retries on a 404 and ends
   up showing a **502** whenever the app answers 404.
5. **SSL:** one Let's Encrypt certificate covering **both** names (tick both in aaPanel's
   SSL panel). If Cloudflare proxies the domain, set SSL/TLS mode to **Full (strict)**.

### Troubleshooting a 502 on a new domain

A 502 here almost always means "the app answered 404 and nginx turned it into 502".
On the server, ask the web container directly, bypassing nginx:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: nairobigents.com" http://127.0.0.1:3203/
```

| Result | Meaning | Fix |
|---|---|---|
| `404` | The platform doesn't know that domain: it isn't connected/verified for any shop | Portal -> Domain -> verify (or admin force-verify). Check the shop page shows it as live |
| `200` | The app is fine; nginx isn't passing things correctly | Check `proxy_set_header Host $host`, "Send domain = `$host`", that the upstream `shops_web` exists, and the error log `/www/wwwlogs/<site>.error.log` |
| connection refused | The web container isn't listening on that port | `docker compose ps`; check the web slot ports |

After adding the extension file (step 4), a still-unknown domain shows the app's own
"No shop found for this domain" 404 instead of a 502, which makes the cause obvious.

## 4. Set the shop up
WhatsApp number, currency, delivery fee and free-delivery amount, logo and theme,
Store info, Pages (delivery & returns, about, contact), Paystack keys if taking online
payments, order-alert email, and a trial/plan in the admin console.

## 5. Google Analytics and Search Console (per shop)
Portal -> **Store info** -> **Analytics & Google**, on each shop separately.
- **GA4:** create one GA4 property per site with a Web data stream for its domain, paste
  that stream's `G-XXXXXXXXXX` Measurement ID. Page views are recorded automatically on the
  shop's pages (not the merchant portal). Check Realtime in Google Analytics.
- **Search Console:** add the shop as a *URL prefix* property using its primary address
  (e.g. `https://nairobigents.com/`), choose the *HTML tag* method, paste the code (or the
  whole tag) into the field, save, then press Verify in Google. Use the primary address, not
  `www`, since `www` redirects to it.
- Not included: purchase/cart events and a cookie-consent banner. Add a consent notice if
  your visitors are covered by data-protection rules that require one.

## Things to know
- Photos are shared links. They keep working as long as the original files do.
- SKUs are identical in both shops. That is fine (each shop has its own feed and
  stock); keep it in mind if a catalogue manager ingests both feeds.
- Identical descriptions on two domains read as duplicate content to search engines.
  Rewrite titles and descriptions on the new shop over time (Products -> Search & sharing).
