# WhatsApp Status kit

**WhatsApp has no way to post a Status automatically.** The Cloud API cannot do it, and services that claim to log in to the shop's number as a hidden linked device, which breaks WhatsApp's terms and can get the number banned.
So this prepares everything and a person shares it in ten seconds: **Portal > WhatsApp Status**, on the phone that has the shop's WhatsApp. It posts nothing and sends nothing, needs no connection to Meta, and works for every shop from the start.
Staff can use it; only the owner chooses how many pictures a day.

## What a shop gets

Each day, a few of the shop's products (default 3, the owner can set 1 to 8) are chosen the way its Page posts are: in stock, with a photo and a price, not shown lately, a separate rotation from Facebook and Threads
(a product may come round again within 14 days at most, since a Status lasts a day). For each, a ready **1080 x 1920 picture** (WhatsApp's full-screen 9:16) and its text.

The picture is in the **shop's own colours**: a dark background tinted with the theme's primary colour and the price in its accent colour, lightened where needed so that all text keeps a contrast of at least 4.5 : 1 whatever the shop picked.
It shows the shop's name as a wordmark, the product photo, the name, the price (an offer in the accent colour with the old price struck through, "From" for a range), **what it comes in**, "Reply to this status to order", the storefront address and the WhatsApp number.

What it comes in depends on what the product is: **shoes and clothes** list sizes (`EUR 36-38, 41`), a **phone** lists storage and colour, a **watch** in one form lists nothing and the photo is bigger. At most two lines; condition is left out.
The text laid out first decides how tall the photo can be (never under 760 px), so a long name with an offer and two lines of options cannot run into the call to action at the foot.

The text that goes with it: name, price, what it comes in, "Reply to this status to order" and a link to the product tagged `utm_source=whatsapp&utm_medium=social&utm_campaign=status`, so Analytics shows visits from Status as WhatsApp.

## The screen (made for a phone)

- **Share to WhatsApp** opens the phone's share sheet with the picture and the text; choose **My status**. A desktop browser cannot do this, so it downloads the picture and says so.
- **Download**, **Copy text**, **Swap product** (the next one in line, never one already in today's kit) and **Mark as posted** (moves that product to the back of the line).
- The day's kit is made once and is the same for everyone who opens it; opening it twice at once makes one kit. A product that sells out or loses its photo is flagged and its picture is no longer made; a price changed since
  the morning shows in the text. Changing "Pictures a day" never takes away today's pictures; it only adds.

## Rules (tests in `test/unit/status-kit.spec.ts` and `test/integration/status-kit.int-spec.ts`)

- **Per shop**: rows, rotation, size setting and colours are the shop's own. Another shop's item is "not found" on every action (read, swap, mark, draw).
- **The photo address is a shop owner's choice, so it is fetched carefully**: https only, never from a private, loopback or link-local address (so a shop cannot make the server reach its own network), every redirect is checked the
  same way (three at most), 20 seconds, 20 MB. One gap remains: the name is looked up, checked, then fetched, so a hostile DNS server could answer differently the second time.
- **Text is drawn from the font's outlines** (opentype.js), not a system font, so it looks the same on any server, and anything the font lacks (emoji) is left out of the picture instead of drawing an empty box. The picture uses **one** bundled serif
  (Libre Caslon Text Bold, SIL Open Font License) for every shop; a choice of fonts per shop was left for later.
- Pictures are made on request and not stored; the phone fetches them with the login token.

## Files

`backend/src/social/`: `status-kit.service.ts` (the kit, rotation, swap, mark), `status-kit.controller.ts` (`/portal/status-kit`: `GET`, `PUT settings` owner only, `GET :id/image`, `POST :id/swap`, `POST :id/posted`), `status-image.ts` (the picture),
`status-palette.ts` (colours from the theme), `photo-fetch.ts` (the careful fetch), `brand-font.ts` (the embedded font), and `statusDetails` / `buildStatusCaption` in `social-post.ts`. Screen: `web/app/portal/status-kit/page.tsx`.
Items are `SocialPost` rows with channel `STATUS` (`<day>#<n>`, status READY then POSTED), kept out of the Social posting list. `SocialSetting.statusKitCount` (migration `20261121090000_add_status_kit_count`).
