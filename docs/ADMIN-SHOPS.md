# Operator console: the Shops page

**Admin > Shops** is where the platform operator sees every shop and what each one has set up. Everything here is read from the same facts the shop's own portal uses; nothing reads or returns a secret (connection rows are read without their `secrets` column, payment keys only as "present").

## The list

Search, five filters (plan, payments, trial, activity, feature), one sort menu and clickable headings, quick views with counts (All, Active, Trial, Suspended, **Has a problem**, **Missing a basic**), and a pager. The state is in the address (`?q=&sort=&status=&needs=&feature=&featureState=`), so a view can be bookmarked or sent to a colleague. The counts on the quick views follow every other filter, so each says what it would show.

Each shop shows **Set up** (`2/3 basics`, `4/9 extras`, problems) and a row of **feature dots** (hover for the reason): green working, light green ready, amber needs setup, red problem, grey off. Row actions: **View as shop** (a one-hour support session in the shop's portal) and **Storefront**. **Export CSV** carries the same filters and adds `basicsDone`, `extrasOn`, `problems`, `featuresOn` and `featuresWithProblems`.

## What "set up" means (`backend/src/admin/shop-features.ts`, tested)

A feature is **working** (on, and used in the last 30 days), **ready** (on, not used yet), **off** (not used, and that is fine), **needs setup**, or **problem** (switched on but cannot work, or keeps failing).

| Feature | Needs setup / problem when |
|---|---|
| **Payments** (basic) | Paystack keys missing |
| **Products** (basic) | none shown (setup); shown but none in stock (problem) |
| **Store info** (basic) | no WhatsApp number or contact details |
| WhatsApp connection, Facebook Page, Threads | problem: switched on with a saved error. Not connected is simply off |
| Auto-posting | problem: on without a working connection, off on the whole server (`SOCIAL_POSTING=false`), or most of at least 3 recent posts failed |
| WhatsApp Status, Share tools | never a problem: they need no connection; working once pictures were posted or something was shared |
| Daily report | setup: scheduled with nobody to send to. A shop is scheduled only once its report settings were saved with the report on |
| Ad and analytics tracking, Own domain | domain: setup while a domain waits for its DNS check |

**Basics** are what a shop needs to take an order; the rest are growth tools, so a shop with no Facebook Page is not "behind". Sorting by *Least set up first* puts shops missing basics at the top; *Most problems first* is the support queue.

## Create a shop

**New shop** makes a shop and its owner for a merchant who asked to be set up: name, address (3 to 40 lowercase letters, numbers and hyphens; reserved words refused; it can't change later), owner, what it sells (starter categories), and a plan (a trial with its own length, or Basic/Pro active at once). The owner is **never given a password**: a new account gets a random one nobody knows and is emailed a link to choose their own (1 hour; if the email fails the page says so and the link can be resent from the shop's staff list). An email that already has an account is just given the new shop. Recorded in Activity as *Shop created*.

## A shop's page

Adds a **Features** grid with the reason for each state, shows the shop's real address (its own domain, else its platform subdomain; it used to assume one platform domain), and "View as shop" uses that address.

Files: `backend/src/admin/shop-features.ts` (the rules), `shop-facts.service.ts` (the grouped reads), `admin.service.ts` (`listShops`, `getShop`, `createShop`), `onboarding.service.ts` (`createShopForOperator`); `web/app/admin/shops/` (`page.tsx`, `new-shop.tsx`, `features.tsx`). Tests: `test/unit/shop-features.spec.ts`, `test/integration/admin-shops.int-spec.ts`.
