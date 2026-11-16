# Conversion: from a visit to an add to cart, a WhatsApp tap, a call or an order

The same changes that were made to Drip Emporium after its visit funnel showed 91% of visits opening a product but under 5% doing anything, applied to every storefront on this
platform. Nairobi Gents' last 30 days had the same shape: 3,396 visits, 3,415 product views, 60 adds to cart, 90 WhatsApp taps, 5 checkouts begun, 5 orders. The product page is
the landing page, and most sales start in a chat.

## What changed

**Product page**
- **Phones: a buy bar** while the page's own buttons are out of view: price and chosen size, **Add to cart / bag**, a **WhatsApp** button and a **Call** button, plus
  "N items in your cart, Checkout" once something is in the cart (which goes straight at abandoned carts). It steps aside, and the floating WhatsApp button comes back, when the real
  buttons are on screen, so there are never two sets. In the luxury styles it is in the page colours, with ink buttons.
- **Trust beside the price**, in a line of three: delivery, how payment works, and WhatsApp (or "visit us"). **Each line comes from the shop's own settings** (see below), never
  written once for every shop.
- A **shorter photo on phones**, a smaller title, and the **description moved under the buttons** (it used to sit between the price and the sizes), so the sizes reach the first screen.
- A **Call** button beside WhatsApp (when the shop has a phone number), "In stock" under the sizes, "Order on WhatsApp" instead of "Order this on WhatsApp".

**Cart**
- The button says what it does. With online payment (the shop has a Paystack key) it is **Pay KES X**; without it, **Place order KES X**, with "Nothing to pay now. We will contact you to
  confirm your order and arrange payment and delivery." Before this, every shop's button said "Pay", including shops that take no payment there.
- **Email is optional** ("for your receipt"). A blank box was sent as an empty string, which the API rejected as a bad address, so email was effectively required. Now blank means none, and an
  order needs a **phone number or an email**, with plain-words messages for what is missing. The phone field opens the phone keypad.
- A **Call** link under the button, and "Order on WhatsApp instead".

**Measurement** (Portal > Analytics > Visits to orders)
- New visit events `CALL_CLICK` (every `tel:` link on the site, one listener, with where it sat) and `VIEW_CART`. The funnel shows **Opened the cart** and **Tapped call**, calls by source and
  device, and a note on whether carts are never opened or opened and left. No migration: `StorefrontEvent.type` is a string.
- Opening the cart now sends **InitiateCheckout** to Meta and TikTok (it used to fire only when Pay was pressed, by which point almost nobody was left), and a call tap sends **Contact**, like a
  WhatsApp tap. Pressing the button is still recorded as `BEGIN_CHECKOUT` in the visit record, but no longer a second InitiateCheckout, so the platforms do not count one shopper twice.
  Set a campaign's conversion event to **Contact** to optimise on WhatsApp and call taps.

## What is true of each shop (lib/trust.ts)

| Line | Shown when |
|---|---|
| "Free delivery over KES X" | the shop has a free-delivery threshold; otherwise "We deliver" |
| "Secure online payment" | the shop has a Paystack key (`onlinePayments` in the public shop info) |
| "We confirm every order with you" | it has not: the order goes to the shop, which follows it up |
| "Order on WhatsApp" / "Visit us in store" | the shop has a WhatsApp number / an address |

The home page's promise strip (luxury styles) uses the same rule. Nairobi Gents has no Paystack key, which is why its cart says "Place order" and its pages do not say "pay securely online".
When it adds one, the wording changes by itself.

## How to tell whether it worked

After two weeks, in Portal > Analytics compare with the figures above: **added to cart** and **tapped WhatsApp** as a share of "Opened a product"; **Tapped call** (no earlier figure);
**Opened the cart** against **Added to cart** (below half means people add and never go on); **Began checkout** against **Opened the cart**; and phones against desktop in Devices.
Nothing here guarantees a figure: traffic quality matters as much as the page.

## Not done

- **Phone-only customers are not created as customer records.** An order stores the phone or email it was given; a shopper account still needs an email (this platform's customers are keyed by it).
- **No reviews or stock-left counts**, because the shops have no review data and the catalogue only says in stock or not.
- Nairobi Gents has no online payment. Adding a Paystack key (Portal > Settings) is probably the largest remaining step for people who want to pay then and there.

## Files

- Backend: `storefront-events.service.ts` (event types), `portal-analytics/funnel.service.ts`, `shop.service.ts` (`onlinePayments`), `checkout/checkout.dto.ts` and `checkout.service.ts` (optional email, reachability).
- Web: `lib/contact-taps.ts`, `lib/trust.ts`, `lib/storefront-tracker.tsx`, `phone-icon.tsx`, `(storefront)/shop/[slug]/product-client.tsx`, `(storefront)/cart/cart-client.tsx`, `portal/analytics/funnel-section.tsx`, `globals.css` and `luxe.css` (buy bar).
- Tests: `test/unit/conversion.spec.ts`, and the funnel case in `test/integration/funnel.int-spec.ts`.
