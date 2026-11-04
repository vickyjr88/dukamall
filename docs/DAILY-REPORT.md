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
| Catalogue: live products, products with no photo (they cannot appear in the Meta/TikTok feeds), sizes in the feeds, **products copied from Drip Emporium that still have no stock** (customers cannot buy them) | `Product`, `syncSourceId` |

Not included: website visits, ad spend and Search Console figures (they live in Google, Meta and TikTok).

## Who receives it

Owner-only portal API: `GET/PUT /portal/daily-report/settings`.

```json
{ "enabled": true, "emailRecipients": ["owner@example.com"], "whatsappRecipients": ["0722000111"] }
```

Until settings are saved, the report goes to the shop's notification email, else to its owners. Changes apply to the next send; no deploy needed.
Which shops are scheduled is the server setting `DAILY_REPORT_SHOPS` (default `nairobigents`); `settings.scheduled` says whether a shop is on it.

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
3. Create a System User token with `whatsapp_business_messaging` and set `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` in the server `.env`
   (and `WHATSAPP_REPORT_TEMPLATE` / `WHATSAPP_TEMPLATE_LANG` if named differently).
4. Add numbers under `whatsappRecipients` and redeploy.

Until 1-3 are done, WhatsApp recipients are recorded as `SKIPPED` and the email still goes out.

## Tests

`cd backend && npx jest test/unit/daily-report.spec.ts` covers day boundaries, revenue rules, comparisons, best sellers, splits, stock warnings,
escaping and WhatsApp number handling.
