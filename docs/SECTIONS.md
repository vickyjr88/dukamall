# Sections: what a shop sells

A shop on this platform can sell different kinds of product. A **section** is a kind of product the shop switches on: it
decides which options a product comes in, which specification labels are suggested, and which starter categories are
created. Sections are code (`backend/src/common/sections.ts`); a shop stores only the keys it has switched on.

| Section | Key | Options a product comes in | Google category |
| --- | --- | --- | --- |
| Shoes | `footwear` | Size (required) | Apparel & Accessories > Shoes |
| Clothes | `clothes` | Size (required), Colour | Apparel & Accessories > Clothing |
| Watches | `watches` | Choice (optional, e.g. a strap colour). **No size.** | Apparel & Accessories > Jewelry > Watches |
| Electronics | `electronics` | Option (optional) | Electronics |
| Devices and accessories | `devices` | Storage, Colour, Condition (all optional) | Mobile Phones, or Electronics Accessories when there is no storage |

A shop that has no sections behaves exactly as before: sizes, nothing else. Nothing changes for an existing shop until
its owner switches a section on.

## How it fits together

- `Shop.sections` (text array): the sections switched on. Set at sign-up (`POST /onboarding/shops`, `sections`) or in the
  portal under **What you sell** (`/portal/sections`, owner only).
- `ProductCategory.section`: the section a category belongs to. Switching a section on creates its starter categories
  (Phones, Tablets, Chargers and cables...) and never touches categories the shop already has.
- A product's section is its category's section. Specs and options follow from it.
- `ProductVariant.attributes` (JSON): the named options of one variant, e.g. `{ "storage": "128GB", "colour": "Black",
  "condition": "New" }`. Each combination is its own variant with its own SKU, price and stock. The old `size` column mirrors
  a `size` option, so the size filter, size labels and feeds keep working.
- `Product.specs` (JSON): rows shown as a table on the product page and as `additionalProperty` in the structured data.

## Where it shows

- **Portal**: product form picks its builder from the category's section: sizes for shoes and legacy shops, an options
  builder for the rest. Specification rows with suggested labels. Catalog check no longer calls a phone or a watch a
  sizing problem.
- **Product page**: one button group per option (storage, colour, condition), preselected on the first combination in
  stock; picking one keeps the others where possible. No "Don't see your size?" box for a product with no sizes. The
  WhatsApp enquiry lists the chosen options. The specification table sits below.
- **Search results**: `itemCondition` from the Condition option (New, Refurbished, Used), specs as `additionalProperty`;
  the offer is the cheapest combination that is in stock.
- **Feeds** (`/product-feed.xml`, `.csv`, TikTok variants): `condition` from the Condition option, `color`, `size`,
  `google_product_category` from the section, title includes the options.

## Launching a phone shop

1. Sign up with "Phones, tablets and accessories" ticked (or switch **Devices and accessories** on under *What you sell*).
2. Add a product in the **Phones** category. Type the storage, colour and condition values; every combination becomes a line
   to price and count. An accessory with no storage is added with "Add the product with no options".
3. Fill the specification rows (screen, battery, camera...).

## Applying

Migration `20261109090000_add_sections` adds `Shop.sections`, `ProductCategory.section`, `Product.specs`. It is additive:
no existing rows change. Run `prisma migrate deploy` as part of the normal deploy.

## Tests

`backend/test/unit/sections.spec.ts`, `product-feed-sections.spec.ts` (unit); `backend/test/integration/sections.int-spec.ts`
(needs `TEST_DATABASE_URL`, see `docs/TESTING.md`).
