# Messaging and posting overview: the owner's daily digest and the operator's page

Two views of the same facts, so they can never disagree: **each owner's morning email** gets a short "Messaging and posting" section, and the **platform operator** gets one page across every shop (**Admin > Messaging**).
Both only read; nothing here sends, posts or changes anything, and no token or secret is ever read, returned or shown.

## What is counted

For a period (the shop's own calendar day in the email; the last 24 hours or 7 days on the operator's page):

- **WhatsApp**: messages sent, delivered (read counts), and failed. **A message Meta accepted and later reported as failed counts as failed**, not as sent. New people who messaged the shop, and people who opted out with STOP (not resellers).
- **Page comments** answered, failed and skipped. **Posts** to the Facebook Page and to Threads, made and failed. **Status pictures** prepared and posted by hand (the shop's own day only).
- **What is on**: welcoming people who message, answering Page comments, posting to the Page, posting to Threads, read from the shop's own settings.

## What needs a person (`marketing/marketing-health.ts`, one place for both views)

Problems (red) come before warnings.

| Item | Severity |
|---|---|
| A switched-on connection has a saved error (a failed Test connection, a failed Threads renewal) | problem |
| A feature is on but its connection is missing or off (welcoming, comment replies, posting to the Page, posting to Threads) | problem |
| The Threads login has ended | problem |
| 20% or more of at least 5 WhatsApp messages did not reach people (with the commonest reason) | problem |
| 3 or more Page comments could not be answered, and at least half of those tried | problem |
| Every post to a channel failed in the period | problem |
| The Threads login ends within 14 days (it renews itself while posting is on) | warning |
| A connection is switched on but has never been tested | warning |
| Some posts to a channel failed, others went | warning |
| Posting is on for the shop but switched off on the whole server (`SOCIAL_POSTING=false`) | warning |

Too few messages say nothing about a rate, so a handful of failures is not reported. A connection that is switched off is not reported at all.

## The owner's email

A **"Messaging and posting"** section in the daily report email, after "Needs your attention": what needs attention first (problems in red), then only the lines that apply to that shop, then "Nothing here needs you." when nothing does.
A shop that uses none of it (nothing connected, nothing on, nothing done) gets no section. The WhatsApp version of the report is a fixed approved template and is **unchanged**; the section is in the email only.

## The operator's page (Admin > Messaging)

Every shop that has connected something, **worst first**, as a card each (so it reads on a phone without sideways scrolling): the shop (links to its page), a chip per connection (working, never tested, problem, switched off, not connected),
what is on, the numbers for the period, and the reasons it needs attention. Totals lead the page; "Only shops that need attention" filters it; 24 hours or 7 days. A banner says when posting is switched off on the server.
The Platform **Health** page has a matching check ("Shops' WhatsApp and posting"): a **warning, never a failure**, when any shop has a problem, with a link here.

The operator can read but not edit a shop's connection here: the detail and the fix are the shop's own (Portal > Connections), reachable by opening the shop as its owner (the existing impersonation, which is audited).

## Rules (tests in `test/unit/marketing-health.spec.ts` and `test/integration/marketing.int-spec.ts`)

- **Per shop**: asking about many shops at once never mixes their rows; the operator page uses one grouped query per table, not a query per shop.
- **No secrets**: the queries never select `secrets` or `webhookKey`; a test fails if the overview contains a token.
- **Accepted is not delivered**, as everywhere else.
- Everything from outside (Meta's error text) is HTML-escaped in the email and cut to a short length.
- Known limits: the period's rows are read and counted in memory (a shop is capped at a few hundred sends a day, so this is small); the operator is not emailed anything, the page and the Health warning are the signal.

## Files

`backend/src/marketing/`: `marketing-health.ts` (the rules, pure), `marketing-summary.service.ts` (`forShops`, `forShop`, `overview`), `marketing.module.ts`. Wired into `daily-report/` (`messaging` on the report, `messagingSection` in the email),
`admin/` (`GET /admin/messaging?days=1|7`, the Health check). Screen: `web/app/admin/messaging/page.tsx`. No migration.
