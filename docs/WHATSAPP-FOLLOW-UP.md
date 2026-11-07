# WhatsApp follow-up on carts and orders

A **Follow up on WhatsApp** button sits on every open lead and every order that has a phone number: Leads (list and details),
Orders (list and detail). It opens the customer's WhatsApp chat with the message already written: what was in the cart or
order, a link to each product on the shop's own storefront, and the total. **Nothing is sent from the portal.** The merchant
reads it, changes it in WhatsApp if they like, and presses send. Details and order pages show the message first under
"See the message". This replaces the one-line "following up on your order" and "an update on order X" links.

Opening a new lead's follow-up marks it **Contacted**.

## The wording

Built on the server (`backend/src/common/follow-up.ts`), so it is the same everywhere. It opens "Hi <first name>, it's
<shop name>." Each shop's links use its own address (custom domain, else `<slug>.<platform domain>`).

| Situation | Opens with | Closes with |
| --- | --- | --- |
| Abandoned cart | "You left these in your cart" | Offer to reserve them and arrange delivery |
| WhatsApp order request | "Following up on the order you asked about" | Ask where to deliver and how they would like to pay |
| Order, unpaid | "Thank you for your order PH-7" | The balance still owed, and how they would like to pay |
| Order, paid, not shipped | "Your order is confirmed and we are getting it ready" | We will message to arrange delivery |
| Order, shipped | "Your order is on its way" | Tell us when it arrives |
| Order, delivered | "We hope you are enjoying your order" | Ask for a photo; offer to show what is new |

A shop's two order fields (payment, and where the goods are) are folded into one message status. No button for a cancelled
order, for a lead already turned into an order or marked lost, or when there is no phone number (the lead details say so).
Items read like "iPhone 13 - 128GB / Black / New (x1): KES 78,000", using the option label, so phones, clothes and shoes all
read naturally. A line typed by hand has no page and gets no link; a product in two options is linked once; a cart over eight
lines is cut short with "...and N more"; "Standard" (a product with no options) is not shown.

## Tracking

Each product link carries `utm_source=whatsapp&utm_medium=followup&utm_campaign=<situation>`, so a customer who comes back
through it shows up in **Analytics** (Visits & ads) as WhatsApp follow-up traffic.

## Notes

- Lead and order responses gain a `followUp` field (`{ phone, message, url }`, or null). Additive.
- The wording is edited in WhatsApp before sending. To change the standing text, edit `wording()` in `follow-up.ts`.
- Orders here have no part payments, so an unpaid order's balance is its whole total.
- Tests: `test/unit/follow-up.spec.ts`, `test/integration/follow-up.int-spec.ts`.
