# Analytics: from an ad to an order

## What is recorded

The storefront reports what a shopper does to `POST /shop/events`, anonymously. A session is a random id held in the
browser tab (`sessionStorage`); it carries no name, phone or email.

| Event | When |
| --- | --- |
| `SESSION_START` | First page of a visit. Carries where it came from (UTM tags, ad click ids, referrer), the device and the landing page. Recorded once per session. |
| `VIEW_PRODUCT` | A product page opens. |
| `ADD_TO_CART` | Anything is added to the cart, from a card or the product page. |
| `BEGIN_CHECKOUT` | The checkout button is pressed. |
| `WHATSAPP_CLICK` | Any WhatsApp button, with where it was (`product-page`, `card`, `cart`, `float`). |
| `SEARCH` | A search is submitted. |

Crawlers and link-preview fetchers are ignored on the server. Orders and WhatsApp leads carry the session id, so a sale
can be traced to its visit. An order a shop makes by hand from a WhatsApp lead takes the visit from that lead.

The same call also tells Meta and TikTok (`ViewContent`, `AddToCart`, `InitiateCheckout`, `Contact`, `Search`, and the
purchase), so those platforms can optimise for buyers. Purchase is reported from `/checkout/complete`, once per order.

## Where it is read

Portal, **Analytics**, section **Visits to orders** (owner only): the funnel, visits by source and device, the products
people look at against what sells, what people search for, and a few plain-language notes on where visits are lost.

Source is worked out once per session: the merchant's own `utm_source` / `utm_medium` / `utm_campaign` first, then the ad
click id (`fbclid`, `ttclid`, `gclid`), then the referring page, otherwise Direct. Tag ad links with
`?utm_source=facebook&utm_medium=paid&utm_campaign=name` to see campaigns by name.

## Notes

- Migration `20261110090000_add_storefront_events` is additive.
- Events are never deleted. Prune old rows (for example older than 13 months) when volume warrants it.
- The date window is compared in UTC whatever the database's time zone.
