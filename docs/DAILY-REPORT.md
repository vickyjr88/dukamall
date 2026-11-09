# Daily report

An email (and optionally a WhatsApp message) at **07:00 Nairobi time** describing the day that just ended, sent to the
people listed in the shop's portal settings. Sent every day, including days with no orders: silence means something is wrong.
Built for Nairobi Gents; any shop can be added to `DAILY_REPORT_SHOPS`.

## What it contains

| Section | Source |
|---|---|
| Revenue (orders **paid** that day, even if placed earlier), paid orders, items, average order, unpaid and cancelled orders placed that day, discounts given; change against the day before and the same weekday last week | `Order` (`paidAt`, else `createdAt` for older online orders) |
| Needs your attention: paid orders not shipped yet, orders unpaid for over 24 hours (last 14 days) | `Order.fulfilmentStatus`, `status` |
| Orders placed that day (first 15), best sellers, revenue by order source and by payment method | `Order`, `OrderLine` |
| Restock: sizes that **sold** that day and are now sold out or have 3 or fewer left | `ProductVariant.stockOnHand` |
| Carts left behind, WhatsApp order requests, new customer accounts | `CartLead`, `Customer` |
| Messaging and posting (email only, only for a shop that uses it): WhatsApp sent, delivered and failed, new people, Page comments answered, posts made, Status pictures, and what needs a person | `WhatsappOutreach`, `FacebookCommentReply`, `SocialPost`, `ShopIntegration`; see `MESSAGING-OVERVIEW.md` |
| Catalogue: live products, products with no photo (they cannot appear in the Meta/TikTok feeds), sizes in the feeds, **products copied from Drip Emporium that still have no stock** (customers cannot buy them) | `Product`, `syncSourceId` |

Not included: website visits, ad spend and Search Console figures (they live in Google, Meta and TikTok).

## Who receives it

Owner-only portal API: `GET/PUT /portal/daily-report/settings`.

```json
{ "enabled": true, "emailRecipients": ["owner@example.com"], "whatsappRecipients": ["0722000111"] }
```

Until settings are saved, the report goes to the shop's notification email, else to its owners. Changes apply to the next send; no deploy needed.
**A shop is on the morning schedule once its settings have been saved with `enabled: true`** (`settings.scheduled`); there is no list of shops on the server any more.
Saving creates the row, so when the first WhatsApp number is added the shop's current email recipients are saved with it (a row with an empty email list would stop the email).

## Changing it in the portal

Portal > **Daily report** (owner only). It shows who gets the report on WhatsApp and by email, with add and remove, an on/off
switch, **Preview yesterday's report** (nothing is sent), **Send now** (asks first, shows the result for each recipient, and offers
"Send again anyway" if someone already had it), and the list of what was sent. It says when the shop is not on the server's
morning schedule or WhatsApp is not connected, and whose number the report goes from. Until a list is saved the shop notification email (else the
owners) is used and the screen says so; saving replaces it, and a saved empty list means nobody on that channel. No WhatsApp number
is set by default: add one here.

## Operating it

| | |
|---|---|
| Preview without sending | `GET /portal/daily-report/preview?date=2026-11-04` (default yesterday) |
| Send now | `POST /portal/daily-report/send?date=2026-11-04`. A day already sent is not sent again; add `&force=true` to send again |
| What was sent | `GET /portal/daily-report/runs` |
| Send hour | `DAILY_REPORT_HOUR` (default 7, Nairobi time) |
| Scheduler off | `DAILY_REPORT_ENABLED=false` (the manual send still works) |

**No duplicates.** Both backend slots run the scheduler; every message is claimed in `DailyReportRun` (unique per shop, day, channel, recipient)
before it is sent, so only one slot sends it. **Missed run.** The scheduler checks every five minutes, so a restart or deploy at 07:00 just means the
report goes out a few minutes later. **Failures.** A failed send is retried on later checks, up to 5 attempts per recipient and day; after that it
is left `FAILED` with the reason in `runs`. Email goes through the platform SMTP settings and is recorded in `EmailLog` (kind `daily_report`).

## WhatsApp

WhatsApp only allows a business to start a conversation with an **approved message template**, so this needs one-time setup (the same number and template
can serve Drip Emporium's report):

1. In Meta Business Suite > WhatsApp Manager, connect the sending number to a WhatsApp Business account.
2. Create a template named `daily_report`, category **Utility**, language English:

   > Daily report for {{1}} ({{2}}): {{3}} paid orders, {{4}} revenue, {{5}} vs the day before. To act on: {{6}}. Full report is in your email.

   Example values for the approval form: `Nairobi Gents`, `Wed 4 Nov 2026`, `12`, `KES 54,000`, `+8%`, `3 items`.
3. Create a System User token with `whatsapp_business_messaging` and enter the phone number ID and token under **Portal > Connections > WhatsApp**
   (the owner does this for their own shop), or under **Admin > Settings > WhatsApp sender for owner notices** (the operator, for shops that
   have no number of their own). Nothing is set in the server environment. See `docs/INTEGRATIONS.md`.
4. Add numbers under `whatsappRecipients`. No deploy is needed.

The report goes from the shop's own connected number when it has one switched on, otherwise from the operator's sender, otherwise it is not
sent: WhatsApp recipients are recorded as `SKIPPED` with the reason and the email still goes out.

## Did it arrive?

For a WhatsApp recipient, **Sent** only means WhatsApp accepted the message. Meta reports what happened afterwards to the shop's own webhook (see `docs/WHATSAPP.md`), and the
**What was sent** list shows it beside the result: Reached WhatsApp, Delivered, Read, or **Not delivered** with Meta's reason (for example `131042` is a payment problem on the
WhatsApp Business Account, `131026` a number that is not on WhatsApp). Without the webhook connected, only "Sent" is known. Sending a report again forgets the old report's delivery state.

## Tests

`cd backend && npx jest test/unit/daily-report.spec.ts` covers day boundaries, revenue rules, comparisons, best sellers, splits, stock warnings,
escaping and WhatsApp number handling. `test/integration/integrations.int-spec.ts` covers which sender a report uses and how shops are scheduled.
