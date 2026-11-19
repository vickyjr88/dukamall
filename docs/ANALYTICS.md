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

## Money, ads, stock and buyers

Analytics has four tabs: **Overview**, **Visits & ads**, **Products & stock**, **Customers**.

- **Cost.** Each product has a private `costKes` ("What you pay for one", in the product form). It is copied onto every order
  line when the order is made (`OrderLine.unitCostKes`), so editing a cost later does not rewrite old profit. Older orders
  fall back to the product's cost today. Profit is only claimed on lines whose cost is known, and the share of sales that
  covers is shown beside it. A global interceptor (`common/private-costs.ts`) removes `costKes` and `unitCostKes` from every
  response outside `/portal` and `/admin`, so a shopper can never read them.
- **Ad spend.** The owner enters spend per day and platform (`AdSpend`, `portal/analytics/ad-spend`). It is set against the
  visits tagged as ads (or carrying an ad click id) from the same platform, giving cost per visit, per WhatsApp tap and per
  order, and sales per shilling spent. Spend on a platform that brought no visits is still listed.
- **Money** (`/portal/analytics/money`): sold, paid and still to be paid, average order, cancellations, profit before ads,
  and what is left after ads.
- **Stock** (`/portal/analytics/stock`): stock at price and at cost; dead stock (in stock, no sale for N days, valued at
  cost when known); fast sellers with under two weeks of cover; sold-out products people still view or ask about on WhatsApp;
  profit by product.
- **Buyers** (`/portal/analytics/buyers`): a buyer is recognised by phone number first (any spelling), then email, then
  account, because a WhatsApp shop has few logged-in customers. New against returning, share of money from repeat buyers,
  lifetime value, and a list of buyers who have gone quiet with a WhatsApp link ready to send.

Migration `20261111090000_add_cost_and_ad_spend` is additive.

## Overview and Dashboard (one read, compared with the period before)

`GET /portal/analytics/overview?from=&to=` (owner only) feeds the Analytics **Overview** tab and the owner's **Dashboard**:

- **This period against the one before it** (same length, ending the moment this one starts): sales, paid, orders, items, average order, visits, WhatsApp taps, and how much each moved. A rise from zero is shown as "New", not as a percentage.
- **Sales** here are every order that was not cancelled (what customers committed to); **Paid** is the part already received. The old "revenue" card counted paid only, which disagreed with the Money section.
- **A trend with no gaps**: a bucket for every day (up to 35 days), week (up to about four months) or month, zeros where nothing happened, so a quiet week is visible.
- **Every day is a Nairobi day** (UTC+3, no daylight saving): an order at 23:30 on Tuesday is Tuesday's; a date picked as "to" ends at 23:59 Nairobi time. `portal-analytics/overview.ts` holds the rules; `test/unit/analytics-overview.spec.ts` the tests.
- **When people buy** (by weekday, Monday first, and by hour), **where orders come from** (website, WhatsApp, in person), **payment** split, and **best sellers with photo, units, revenue and page views**.

`GET /portal/dashboard/attention` (staff and owner, no takings in it): unpaid for over 2 days, waiting to ship, new leads, running low (3 or fewer), sold out, shown without a photo; each is one click from the list that fixes it (the Orders, Leads and Products screens read the filter from the address).

## Lists

Every list in the portal shares one toolkit (`web/app/portal/list-kit.tsx`): search with a short pause, a sort menu and clickable column headings, filter chips with counts, a pager that says "Showing 26 to 50 of 151" with a rows-per-page choice. A list's state is in the address (`?q=&sort=&page=&size=`), so a refresh, the back button or a link to a colleague lands on the same page of the same search. Products, Orders, Leads and Customers page on the server; Discounts and Categories, which are short, do it in the browser.

The Products list ranks by price, stock, sales or views over a product's sizes, which the database cannot do over a relation without raw SQL per filter. It loads the shop's light rows once and ranks them in `portal-product/product-list.ts` (tested), then fetches only the page shown in full. Fine for hundreds or a few thousand products per shop.
