# Storefront styles (luxury theming)

A shop's look used to be two colours, five font pairings and square-or-rounded corners. The page colours (paper, ink, lines) were fixed on purpose, so a brand colour could never cost legibility,
and every component looked the same in every shop. That was the ceiling on how premium a storefront could feel.

A **style** removes that ceiling without giving up the safety. It changes the page colours *as a curated set* (checked for contrast), the typography, and how the header, home page, product cards,
product page, filters and footer are built. A shop owner picks one under **Portal > Theme > Style**; they still cannot pick an unreadable colour combination.

| Style | Look |
|---|---|
| `classic` | The original storefront, exactly. The default for every shop, and what any shop looks like until its owner chooses another. Sets no tokens at all. |
| `maison` | Luxury, warm ivory: ivory pages, warm black type, hairlines, a gold accent. |
| `noir` | The same luxury layout on black, ivory type, gold details. |

## How it works

- **Data:** `ShopTheme.stylePreset` (default `classic`, migration `20261122090000_add_theme_style_preset`). Valid keys live in one place, `backend/src/shop/theme-options.ts`, which the API validation, the portal picker and the tests all read.
  A key the web app does not know, or a missing one (a web deploy that reaches an API without the column), means classic.
- **Tokens:** `web/app/lib/style-presets.ts` holds each style's colours. `ThemeInjector` writes them as `:root` custom properties (so the page background and overscroll follow too).
  `globals.css` now uses tokens (`--shop-raised`, `--shop-field`, `--shop-on-ink`, `--shop-header-bg`, ...) where it used to hard-code white; their defaults are the old white, so classic is pixel-identical.
- **Accent:** a luxury style uses the shop's own primary colour for fine details if it chose one, and the style's gold if the shop is still on the platform's default blue.
- **Components:** `web/app/luxe.css`, every rule scoped under `[data-luxe]`, which the storefront layout puts on the page wrapper only for a luxury style. A classic shop never matches a rule in it.
  Components whose *markup* differs (header, product card, product page, home page, collection filters) read `useShopStyle()` and render a luxury variant; everything else is CSS.
- **Fonts:** two luxury pairings were added: `cormorant-jost` and `bodoni-hanken`. Pick one of them with a luxury style (the Theme page says so).

## What the luxury styles change

- **Header:** a navigation bar (Shop all and the first categories), a centred wordmark, full-screen search with type-ahead, a slide-in menu on a phone, a bag icon.
- **Home page:** an editorial opening (full-bleed hero, headline bottom-left), "Shop by category" tiles taken from the shop's own products, "New arrivals", a promise strip (delivery, WhatsApp concierge, secure checkout, from the shop's real settings), then the collection.
  A category or search view is a compact, clean listing instead.
- **Collection:** category tabs and a quiet "Refine" panel instead of the filter box; 24 pieces at a time with "Show more".
- **Product card:** a fixed 4:5 frame on a neutral mat, the second photo on hover, a "Quick add" bar on the photo (a round "+" on a phone), brand / name / price underneath, WhatsApp reduced to a quiet text link.
- **Product page:** breadcrumbs, a thumbnail rail with arrows, counter, click-to-zoom and swipe, a photo that stays in view while the details scroll, hairline size buttons (the repeated "EUR" is dropped), "Add to bag", WhatsApp as a secondary button,
  Details / Specifications / Delivery & help accordions, and on a phone a sticky bar with the price and "Add to bag".
- **Footer:** dark, with a large wordmark. The merchant-portal and admin links are hidden from it (the pages are still at `/portal` and `/admin`).
- Cart, forms and the floating WhatsApp button follow the style.

## Turning it on for a shop

Owner: Portal > Theme > Style. Or in the database (Nairobi Gents, for example):

```sql
UPDATE "ShopTheme" SET "stylePreset" = 'maison', "fontPairing" = 'cormorant-jost', "layoutPreset" = 'sharp'
WHERE "shopId" = (SELECT id FROM "Shop" WHERE "customDomain" = 'nairobigents.com');
```

To go back: `stylePreset = 'classic'` (and the previous font pairing). Nothing else was changed.

## Photography is the limit now

A style can frame photos consistently; it cannot make a photo clean. Nairobi Gents' product photos are mostly shot in the stockroom with a hand holding the shoe against shelves, and the hero is a promotional banner
with text baked into the image, so a headline over it competes with the banner's own text. For an international luxury feel the next gains are in the pictures: a plain neutral backdrop, one angle set per product, and a hero that is a clean photograph.
Background removal onto a studio tone is possible as a separate, batch step.

## Files

- `backend/src/shop/theme-options.ts`, `storefront-content.dto.ts`, `shop.service.ts`; test `backend/test/unit/theme-options.spec.ts`.
- `web/app/lib/style-presets.ts`, `style-context.tsx`, `font-pairings.ts`; `web/app/theme-injector.tsx`; `web/app/luxe.css`; `web/app/globals.css` (tokens).
- `web/app/(storefront)/layout.tsx`, `page.tsx`, `storefront-header.tsx`, `storefront-search.tsx`, `storefront-footer.tsx`, `cart/cart-client.tsx`, `shop/[slug]/product-client.tsx`; `web/app/product-card.tsx`.
- `web/app/portal/theme/page.tsx` (the picker).
