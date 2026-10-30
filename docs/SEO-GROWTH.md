# Organic search and AI traffic: brand and model pages, IndexNow, guide drafts

What every shop on the platform gets for search engines and AI assistants beyond the basics in the launch playbook.

## Brand and model landing pages

`/brand/<brand>` ("Nike Sneakers in Nairobi, Kenya") and `/collection/<model>` ("Nike Air Force 1 Price in Kenya") target the
searches people actually type. They are built from the shop's live catalogue (`web/app/lib/collections.ts`), so the price range, sizes and
"n of m on the shelf" are always current, and are worded with the shop's own name, address, opening hours and delivery settings (Store info).
Each page has a direct answer first, the product grid, a visible FAQ marked up as `FAQPage` (the markup repeats exactly what is shown),
`CollectionPage` + `BreadcrumbList`, and links to related brands, models and categories. They are in the sitemap and `/llms.txt`, linked from the
home page ("Shop by brand") and from each product's page ("More Nike sneakers").

- A brand page is indexed from 3 products, a model page from 2; smaller ones exist but are `noindex, follow` and not in the sitemap.
- A brand split across categories (no category holds 70%) is called "shoes" rather than named after one category.
- **No page for luxury names or supplier labels** (`NO_BRAND_PAGE`: Rolex, Dior, Versace, Berluti, ..., and `QC`). A shop selling items "styled after" a luxury
  brand must not get a page titled "Dior sneakers" priced at a few thousand shillings.
- **Adding a model page:** add an entry to `SERIES` (a slug, a display name, a regex matched against product names, and one safe factual sentence).
- Fix a brand that should not have a page (a stray value in the Brand field) in the product's Brand field, or add its slug to `NO_BRAND_PAGE`.

## IndexNow (Bing and AI search)

Every shop domain serves the same key at `/indexnow-key.txt` (`web/app/indexnow-key.txt/route.ts`); `scripts/indexnow.sh` posts each shop's
sitemap URLs to IndexNow. Bing's index also feeds ChatGPT search and Copilot. Run it after a deploy that adds pages, or weekly from cron:

```bash
/root/shops-platform/scripts/indexnow.sh                       # nairobigents.com and msa.dripemporium.store
/root/shops-platform/scripts/indexnow.sh https://newshop.example   # one shop
```

Add a new shop's domain to the default list in the script. Google does not use IndexNow: submit each shop's `/sitemap.xml` in Search Console.

## Guide drafts

`docs/page-drafts/build.py` writes three unpublished guide pages per shop (shoe prices in Kenya, buying shoes online safely, shoe size guide) as
`ShopPage` rows with `published=false`. They do not appear on the site until published from the portal's Pages screen. Before publishing:
re-check the price list against the catalogue (it is a snapshot), and read them as the shop's owner.

**Two shops with the same stock and address:** nairobigents.com and msa.dripemporium.store sell the same shoes from the same shop, and
dripemporium.store does too. Three near-identical sites compete with each other for the same searches. Publish the guides on one shop first,
and give the other shops a genuinely different angle before publishing theirs.
