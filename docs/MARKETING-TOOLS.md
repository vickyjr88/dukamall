# Marketing tools, and how they compare with Drip Emporium

**Portal > Marketing** is the front door: what is switched on and connected, what went out in the last 7 days, what needs a person, and links to every tool. It only reads (`GET /portal/marketing/hub`, built from the same facts as the owner's morning email and the operator's page, so the three always agree).

## What a shop has, against Drip Emporium

| Tool | Drip Emporium | Shops platform |
|---|---|---|
| Daily WhatsApp Status pictures (9:16, shop colours, caption) | Staff and affiliates | **Portal > WhatsApp Status**, every shop (docs/STATUS-KIT.md) |
| Search a product and share it on WhatsApp, Facebook, X, Telegram, the phone's share sheet | Account > Share (customers, affiliates) | **Portal > Share & QR** (new) |
| Several products in one WhatsApp message | no | **Share**: tick products, one catalogue message (new) |
| Tagged link for an ad, bio or flyer, and a QR poster | Campaigns (links) | **Share > Link & QR code** (new): link, QR download, printable poster |
| Share counts and visits they brought | Share counts, Insights | **Share** and **Marketing**: shares this week by channel, most shared, visits from links made here (new) |
| WhatsApp welcome, reminders, STOP, delivery truth | Outreach | Portal > WhatsApp |
| Page comment replies | Facebook comments | Portal > Facebook |
| Auto-posting to Facebook and Threads | Social | Portal > Social posting |
| Discount codes | Offers | Portal > Discounts |
| Featured products | Featured products | **Products**: tick rows, Feature / Unfeature (new). Featured products come first in the Share list |
| Product catalogue feeds for Meta and TikTok | feeds | Listed with copy buttons on **Marketing** (the feeds already existed) |
| Ad pixels (Meta, TikTok, X) | yes | Portal > Connections; status shown on Marketing |
| Where visits came from, with ad spend | Insights | Portal > Analytics > Visits & ads |
| Reviews | Reviews | not built |
| Affiliate/reseller programme | yes | not built: a shop sells for itself |

Nothing in Share posts for anyone. WhatsApp and the social networks give a website no way to do that, so it opens their own share screens with everything ready, and a person presses send.

## Share

- Lists products that are **shown and in stock** (a post about something sold out only disappoints), featured first, newest next; search matches name, brand and SKU.
- Every link carries `utm_source=<channel>&utm_medium=social&utm_campaign=shop-share` (`catalogue` for a catalogue message), made on the server in `portal-share/share-links.ts` and tested. Analytics > Visits & ads counts the visits by channel.
- **Link & QR code** makes the same kind of link for the shop, one product or any page of the shop (`/pages/about`). A page address must start with one slash and stay on the shop: `//host`, a scheme, a backslash, `..` or spaces are refused. The campaign name and the place (Instagram, Facebook, TikTok, WhatsApp, poster, business card) become the tags. The QR is drawn in the browser (`qrcode`); **Download picture** saves a 1024 px PNG and **Print poster** prints the shop name, the code and "Scan to shop" alone on the page.
- **A tap is counted** (`ShareEvent`, migration `20261123090000_add_share_events`) when a share screen was opened, a link was copied or the phone's share sheet was handed the product, and **not** when someone closed the sheet. Two taps on one button within two seconds are one; a person is limited to 300 an hour. It counts the intention; what a share brought in is the visits in Analytics.

Files: `backend/src/portal-share/`, `backend/src/marketing/portal-marketing.controller.ts`, `web/app/portal/share/`, `web/app/portal/marketing/page.tsx`. Tests: `test/unit/share-links.spec.ts`, `test/integration/portal-lists.int-spec.ts`.

## Navigation

The side menu is grouped (Sell, Catalogue, Marketing, Insights, Your shop) instead of 23 flat links. Staff still see only what they may open.
