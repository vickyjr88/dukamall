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

6. **Shared cache key (one-time, whole server).** aaPanel's global `proxy.conf` turns on a response
   cache for every site, and nginx's default cache key uses the *upstream name* (`shops_web`),
   not the visitor's domain. Without a fix, two shops' domains share cache entries: one shop's
   link-preview image was served for another's. In `/www/server/nginx/conf/proxy.conf`, directly
   after `proxy_cache cache_one;`, keep this line (already applied on the production server):
   ```nginx
   proxy_cache_key "$scheme$host$request_uri";
   ```
   Check it is still there after an aaPanel upgrade (`grep proxy_cache_key /www/server/nginx/conf/proxy.conf`).
   The app also marks its preview images `Vary: Host` as a second line of defence.

### Link previews (WhatsApp, Facebook, X, LinkedIn, Telegram, Slack...)
Each shop's landing page previews its own hero photo (else its logo, else its first product
photo) as a 1200x630 JPEG at `/og/home`; product pages use `/og/product/<slug>`. Platforms
**cache** previews, so after fixing or changing an image ask them to re-fetch:
- Facebook / Instagram / WhatsApp (Meta): https://developers.facebook.com/tools/debug/ -> paste
  the URL -> **Scrape Again**.
- LinkedIn: https://www.linkedin.com/post-inspector/ -> Inspect.
- X: refreshes on its own within about a week; share the link with `?v=2` on the end to force it.
- Telegram: send the link to @WebpageBot. Slack/WhatsApp chats: share it with `?v=2`.

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

## 4. Set the shop up (content, in this order)

A copied shop starts with another shop's products, wording and numbers. Work through these
in order; each step uses a screen in the shop's portal.

1. **Store info** (Portal -> Store info, and Settings). Fill in everything a shopper or search
   engine will quote, and make it consistent: name, tagline, a one-sentence *search
   description*, address, opening hours, phone, email, social links, WhatsApp number
   (international format, e.g. `+254712345678` -- the chat link is built from it, and a
   truncated number silently breaks it), the order-alert email, delivery fee and
   free-delivery amount. Use clean profile links for social accounts (no `?xtok=`/`?mibextid=`
   share tracking). Do this **before** the pages: the starter pages read these fields.
2. **Pages** (Portal -> Pages -> *Add starter pages*). Creates drafts for About us, Delivery &
   returns, FAQs, Contact us, Terms of service and Privacy policy, filled in from Store info.
   Anything that is the owner's own decision or claim (delivery times, returns window, which
   payments are accepted, what the shop sells) is an `[add ...]` note. Replace every note,
   then publish; "Needs your input" disappears once none is left, and publishing a page
   that still has one asks for confirmation. Terms and privacy are drafts of standard wording
   -- have the owner (ideally a lawyer) read them. Do not write claims the shop cannot back
   ("genuine", "same-day delivery", "free delivery over ...") unless the owner confirmed them;
   delivery pricing must match what checkout actually does.
3. **Categories** (Portal -> Categories). Create the few shoppers browse by (e.g. Sneakers,
   Casuals, Officials) and assign every product. The storefront lists every *active*
   category, so a category for products you are hiding (Watches, ...) should be set to
   inactive, or it shows as an empty chip. Only categories that have products go in the
   sitemap, and each category page gets its own title and description for search.
4. **Hide, never delete.** To retire a range for now, switch the products off (Products ->
   status). Hidden products disappear from the storefront, sitemap and feeds, keep their
   history, and come back with one click.
5. **Descriptions.** Rewrite them per product (see "Things to know": copied text is duplicate
   content). A good one is 3-4 sentences: what it looks like (colour, material, detail), how
   it wears or fits, how to style or care for it. Describe only what the photo and facts show;
   no authenticity, stock or price claims. Brand, size and colour belong in their own fields,
   not the name.
6. **Catalog check** (Portal -> Catalog check). Run it last and fix what it finds. It flags
   the mistakes that otherwise slip through a copy: a mistyped price (KES 10 among KES 3,700),
   a size typed into the product name, products sharing one photo, a brand that is the shop's
   own name or blank, missing descriptions or photos, products outside every category, a web
   address that is just the shop's name, and products with no stock at all. The last one
   matters: a product with every size at stock 0 is shown to shoppers and in the product feed
   as out of stock. Set real stock, or switch stock off for made-to-order lines.
7. **Plan and alerts** in the admin console (trial/plan, order-alert email), and **Paystack
   keys** if taking online payments. Until Paystack is connected, say on the Delivery page that
   payment is arranged when the order is confirmed.

If the source shop keeps changing a price or typo, fix it **at the source** and (for a synced
shop) wait for the next sync; a one-time copy never updates and must be fixed in the copy.

## 5. Google Analytics and Search Console (per shop)
Portal -> **Store info** -> **Analytics & Google**, on each shop separately.
- **GA4:** create one GA4 property per site with a Web data stream for its domain, paste
  that stream's `G-XXXXXXXXXX` Measurement ID. Page views are recorded automatically on the
  shop's pages (not the merchant portal). Check Realtime in Google Analytics.
- **Search Console:** add the shop as a *URL prefix* property using its primary address
  (e.g. `https://nairobigents.com/`), choose the *HTML tag* method, paste the code (or the
  whole tag) into the field, save, then press Verify in Google. Use the primary address, not
  `www`, since `www` redirects to it.
- **Bing Webmaster Tools:** add the site (you can import it from Search Console) and submit
  `https://<domain>/sitemap.xml`. Bing also feeds several AI assistants.
- **Google Business Profile:** if the shop has a physical address, claim a profile with the
  same name, address, phone and hours as Store info; keep them identical everywhere. This is
  what "shoes near me" results and AI answers draw on. Ask real customers for reviews.
- **Google Merchant Center:** upload the shop's product feed (`/product-feed.xml`, shown in
  Portal -> Dashboard) to appear in free Google Shopping listings.
- **What the platform does for you automatically:** per-shop sitemap and robots.txt, titles
  and descriptions, canonical addresses, Product / breadcrumb / Store / FAQ structured data
  (a page written as bold questions followed by answers becomes FAQ markup), a favicon, and
  `/llms.txt` (a plain-text briefing about the shop for AI assistants). Filtered and search
  views are kept out of the index.
- **Ad pixels (Meta, TikTok, X):** Portal -> **Store info** -> **Ad pixels**. Paste each platform's
  Pixel ID (Meta: the number in Events Manager; TikTok: the letters-and-digits ID in Events -> Web events,
  not the whole code; X: the short code like `o1abc` from the website tag). Each pixel is per shop, is
  loaded only on that shop's storefront pages (never the portal or admin), records a page view on load
  and on every page change, and is skipped when its box is blank. IDs are validated to each platform's
  format before saving. Product-view, add-to-cart and purchase events are not sent yet. Mention
  advertising pixels in the shop's privacy policy (the starter policy does).
- Not included: purchase/cart events and a cookie-consent banner. Add a consent notice if
  your visitors are covered by data-protection rules that require one.

## Things to know
- Photos are shared links. They keep working as long as the original files do.
- SKUs are identical in both shops. That is fine (each shop has its own feed and
  stock); keep it in mind if a catalogue manager ingests both feeds.
- Identical descriptions on two domains read as duplicate content to search engines.
  Rewrite titles and descriptions on the new shop over time (Products -> Search & sharing).
