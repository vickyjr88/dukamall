# Connections: WhatsApp, Facebook Page, Threads

Every shop connects **its own** WhatsApp number, Facebook Page and Threads account, each through a Meta app the shop creates. All the ids,
tokens and secrets are kept in the database and edited in the admin settings. **Nothing about them is read from environment variables.**

The server environment keeps only what cannot live in the database: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` and `SECRETS_ENCRYPTION_KEY` (the key
that encrypts the secrets below: the key that unlocks the database cannot be stored in it).

## Who edits what

| Where | Who | What |
|---|---|---|
| **Portal > Connections** | the shop's **owner** (staff cannot see or change it) | the shop's WhatsApp number, Facebook Page and Threads account: ids, tokens, app secrets, template names, the on/off switch, **Test connection** |
| **Admin console > Settings > WhatsApp sender for owner notices** | the platform operator | one WhatsApp number that shops without their own may use for the daily report to their owner. **Customers never receive a message from it.** |

A shop's connection is used only when it is complete **and switched on**. Everything starts off.

## Rules (each has a test in `test/integration/integrations.int-spec.ts`)

- **Secrets are never shown.** Reading a connection returns, for each secret, that it is set and its last four characters (`••••1234`). A blank secret on save means "keep what is there";
  removing one is an explicit action.
- **Secrets are encrypted at rest** (AES-256-GCM, `common/secrets.ts`): one encrypted JSON string per connection, so a database dump or backup shows nothing. The screens warn when `SECRETS_ENCRYPTION_KEY` is not set.
- **Every change is audited** (`AdminAuditLog`, actions `integration.updated`, `platform.integration_updated`, `integration.webhook_rotated`) with who did it (and who was impersonating)
  and the **names** of the fields changed, never their values.
- **A shop sees and uses only its own connections.** One WhatsApp number, Facebook Page or Threads account can belong to only one shop; saving one that is taken is refused.
- **The platform sender stands in only for notices to the shop's own owner** (the daily report). A feature that messages or posts to customers uses the shop's own connection or nothing.
- **Test connection** makes read-only calls with the saved token and shows what Meta answers, in words (WhatsApp: the number and its name; Facebook: the Page's name and whether comments are
  reaching the shop; Threads: the account and how many posts are left today, and it fills in the account id from the token).
- **Webhook addresses** (incoming WhatsApp messages and delivery reports, and Facebook Page comments): each shop gets its own address, `/whatsapp/webhook/<secret>` or `/facebook/webhook/<secret>`, with its
  own secret. Only a hash of the secret is stored, so the address is shown once when it is made (Portal > Connections > WhatsApp > **Connect incoming messages**, which also registers it with
  the shop's WhatsApp Business Account); a new one replaces the old one. A wrong secret is a 404. If the shop saved its Meta **app secret**, Meta's signature on every event is checked, and an event
  for a different number or Page than the shop's own is ignored. See `docs/WHATSAPP.md` and `docs/FACEBOOK.md`.
- A test (`test/unit/integrations-no-env.spec.ts`) fails the build if any code outside the one-time import reads a `WHATSAPP_`, `FACEBOOK_`, `THREADS_`, `META_`, `MAUTIC_` or `OUTREACH_` variable.

## What a shop owner needs, per connection

**WhatsApp**: a Meta developer app (type Business) with the WhatsApp product; a WhatsApp Business Account with a number and a **payment method** (without one, messages are accepted and then fail);
the **phone number ID** (an id, not the number); a System User token with `whatsapp_business_messaging` and `whatsapp_business_management`; approved message templates (the daily report needs
`daily_report` with 6 variables).
**Facebook Page**: the Page ID; a System User token with `pages_show_list`, `pages_read_engagement`, `pages_messaging`, `pages_manage_metadata`, `pages_manage_engagement`, `pages_manage_posts`,
turned into the Page's own token (`GET /{page-id}?fields=access_token`). Until the app has Advanced Access, Facebook serves only people with a role on the app.
**Threads**: the "Access the Threads API" use case on the app, the shop's Threads account added as a tester, and a token from its user token generator (Facebook tokens are refused). The token lasts 60 days.
The portal shows these steps under "How to set this up" on each card.

## Moving from the old environment variables

The daily report used to send WhatsApp from `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN`. On the first start after this change, if no platform sender is saved,
those values (and `WHATSAPP_REPORT_TEMPLATE`, `WHATSAPP_TEMPLATE_LANG`) are **copied once** into the platform's WhatsApp sender (`integrations/env-import.ts`, the only code allowed to read them), so the daily report keeps going.
The log says so and the sender appears under Admin > Settings with "imported from the server environment". After checking that, delete the variables from the server `.env` and from `docker-compose.yml`; they are never read again.
Which shops get the morning report is no longer `DAILY_REPORT_SHOPS`: a shop is scheduled once it has saved its Daily Report settings switched on.

## Files

`backend/src/integrations/`: `integration-providers.ts` (what each connection is made of and how it is checked), `integrations.service.ts` (storage, masking, resolution, testing, webhook secrets, the import),
`integrations.controller.ts` (owner routes `/portal/integrations`), `whatsapp-client.ts` (a WhatsApp client for one resolved connection). Operator routes: `/admin/platform-settings/integrations/whatsapp`.
Screens: `web/app/portal/integrations/page.tsx`, the card in `web/app/admin/settings/page.tsx`. Tables: `ShopIntegration`, `PlatformIntegration` (migration `20261117090000_add_integration_credentials`).
