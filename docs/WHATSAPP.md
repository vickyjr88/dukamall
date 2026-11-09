# WhatsApp: customers, welcome series and delivery reports

Everything here uses the **shop's own** WhatsApp number, its own approved templates and its own contacts (Portal > Connections holds the connection; see `docs/INTEGRATIONS.md`). Nothing is
sent unless the shop has connected WhatsApp and switched it on. The operator's shared sender is never used for a customer.

## What it does

1. **Incoming messages and delivery reports.** Meta sends every message people write to the shop's number, and a report for each message the shop sends (sent, delivered, read, failed with a
   reason), to the shop's own webhook address. Set up under Portal > Connections > WhatsApp > **Connect incoming messages** (needs the WhatsApp Business Account ID, and the app's
   "messages" webhook field subscribed in the Meta app dashboard).
2. **Welcome series** (off until the owner ticks "Welcome people who message you" under Connections). Someone who messages the number, usually from a click-to-WhatsApp ad, is recorded
   (with the ad's headline), told once *"Thanks for messaging <shop>! You'll now receive updates ... Reply STOP at any time to opt out."* (a normal text, allowed inside the 24 hours their
   message opened), then sent **the group link** a day later and **the Google rating request** two days after that. Steps the shop has no link or template for are skipped.
3. **STOP and START.** The whole message must be the keyword (`STOP`, `stop.`, `unsubscribe`, `opt out`, `end`). A sentence that merely contains "stop" is not an opt-out, and "cancel" is
   excluded because people use it for orders. STOP is confirmed by a text and from then on **nothing** reaches that number: not the series, not a batch from the portal. START brings them back.
   STOP and START are honoured even when the welcome series is off, and even if the shop has since switched WhatsApp off (nothing is sent in reply then).
4. **Sending to customers** (Portal > **WhatsApp**, owner only). Choose a message, pick customers (everyone in the customer list, guests included, matched by phone) or "everyone who hasn't
   received it", confirm, and it goes in batches of 25 with progress. Four messages: **Join the WhatsApp group**, **Rate us on Google** (each a template with `{{1}}` the first name and `{{2}}` the
   link; the links are the shop's WhatsApp group link and Google reviews link under Store info), and the optional fixed-text **Where to find us** and **What we sell** (templates with no variables).
5. **Who got it, and did it arrive.** Recent messages shows Accepted/Failed and, once Meta reports back, Reached WhatsApp / Delivered / Read / Not delivered with the reason. The Daily Report
   list shows the same for the report.

## Templates to create in WhatsApp Manager (category Marketing, language English)

| Setting (Connections) | Default name | Body |
|---|---|---|
| Template: join the group | `join_group` | `Hi {{1}}, join the <Shop> WhatsApp group for new arrivals and offers before anyone else: {{2}} See you there!` |
| Template: rate us on Google | `rate_us` | `Hi {{1}}, enjoying your <Shop> purchase? A quick rating on Google helps other shoppers find us: {{2}} Thank you!` |
| Template: where to find us | (none) | your address and opening hours, no variables |
| Template: what we sell | (none) | your range, no variables |

A variable cannot be the first or last thing in the body, hence the closing sentences. Use any names; type them under Connections. Sample values for the approval form: `Wanjiru` and a real link.

## Rules (each has a test in `test/integration/whatsapp.int-spec.ts`)

- **Accepted is not delivered.** "Received" means accepted **and not reported failed**. A message Meta accepted and later reported failed (a number not on WhatsApp, a payment problem) stays on the
  list for the next send, and a person it failed for is put back at that welcome step: a day later, or **six hours later without counting against them** for account problems (payment,
  locked account, spam limit: `131042`, `131031`, `131048`). A number that keeps failing is given up on after five.
- **The notice is sent once**, claimed in the database, so Meta delivering the same event twice (it does) or two backend slots cannot send it twice. A notice that failed is retried when they write again.
- **Nobody is welcomed until told.** The series only reaches people whose notice went out.
- **Limits, per shop:** messages go out 08:00 to 20:00 Nairobi time only; never more than the shop's **most template messages a day** (default 200, under the 250 Meta allows an unverified business);
  a person already sent a message is skipped unless the owner ticks "send again".
- **Shops are separate.** Contacts, messages, delivery reports, caps and STOP are per shop: the same person can be subscribed to one shop and stopped on another.
- **The webhook** answers 200 once an event is authentic (Meta retries anything else for days), handles each event separately so one bad event cannot block the rest, and answers 404 for a wrong address.
- Two backend slots both run the series; a message is claimed (`nextStepAt` lease) before it is sent, so it goes out once.

## Files

`backend/src/whatsapp/`: `whatsapp-subscription.ts` (pure rules: STOP, webhook parsing, signature, delivery state, windows), `whatsapp-kinds.ts` (the messages, templates, links, settings),
`whatsapp-contacts.service.ts` (messages in, delivery reports, STOP/START), `whatsapp-outreach.service.ts` (sending to customers), `whatsapp-sequence.service.ts` (the welcome series),
`whatsapp-webhook.controller.ts`, `whatsapp.controller.ts` (`/portal/whatsapp`, owner only). Screens: `web/app/portal/whatsapp/page.tsx`, the incoming-messages panel in `web/app/portal/integrations/page.tsx`.
Tables: `WhatsappContact`, `WhatsappOutreach`, `WhatsappMessageStatus`, and `DailyReportRun.messageId/delivery/deliveryError` (migration `20261118090000_add_whatsapp_messaging`).

## Not built here (yet)

The WhatsApp tab in Analytics (chats by ad, opt-outs, chats that became orders) and a Mautic sync (not wanted for this platform). The ad each contact came from is already stored, so the report is a query away.
