# WhatsApp Status kit

**WhatsApp has no way to post a Status automatically.** The Cloud API cannot do it, and services that claim to log in to the shop's number as a hidden linked device, which breaks WhatsApp's terms and can get the number banned.
So this prepares everything and a person shares it in ten seconds: **Portal > WhatsApp Status**, on the phone that has the shop's WhatsApp. It posts nothing and sends nothing, needs no connection to Meta, and works for every shop from the start.
Staff can use it; only the owner chooses how many pictures a day.

## What a shop gets

Each day, a few of the shop's products (default 3, the owner can set 1 to 8) are chosen the way its Page posts are: in stock, with a photo and a price, not shown lately, a separate rotation from Facebook and Threads
(a product may come round again within 14 days at most, since a Status lasts a day). For each, a ready **1080 x 1920 picture** (WhatsApp's full-screen 9:16) and its text.

The picture is designed like a boutique card, not a template:

- **A framed plate on a backdrop made from the product itself.** The photo hangs on a rounded plate with a fine keyline and a mat line, over a dark wash of its own colours (the same photo, shrunk and heavily blurred, tinted with the shop's primary colour, with a soft glow and a little grain). A cluttered photo (a hand, floor tiles, a gravel floor) sits quietly on it, and a bright white studio shot is shaded at its edges so it does not glare.
- **A double hairline frame round the whole picture**, and the shop's name as a spaced wordmark between two rules, with **where the shop is** under it (its address, when it has one).
- **The product**: the brand in small spaced capitals, the name in Cormorant Garamond (up to two lines), a hairline with a diamond, then the price in large type with a **gold foil gradient** (the shop's accent colour, lighter at the top). An offer shows the old price struck through above it; a range says "From".
- **What it comes in**: sizes as chips (`36 37 38 41`, with the unit named once: `SIZES · EUR`; more than fit become `+3`; more than 14 fall back to the compact line), or a labelled line for storage and colour. A watch in one form lists nothing and the plate is taller.
- **A badge on the plate, only when it is true**: `SAVE 24%` for a real offer (`ON OFFER` under 5%), else `NEW IN` for a product added in the last 14 days.
- **One button**: "Reply to this status to order", the WhatsApp number in large type, **the promises this shop can keep**, and its web address.

The promises come from the shop's own settings, the same rule as the storefront (`web/app/lib/trust.ts`): free delivery over KES X (else "We deliver"), "Secure online payment" only with both Paystack keys (else "Every order confirmed with you"). "Order on WhatsApp" is left off the picture because the button and the number already say it. Nothing is claimed that the shop has not set up.

Colours: the background is dark whatever the shop picks, tinted with its primary colour; the price, badge and button take its accent colour, lightened where needed so that all text keeps a contrast of at least 4.5 : 1. A pale or garish theme still gives a readable picture.

The plate takes the height the text leaves it (640 to 940 px), so a long name with an offer and two lines of options cannot run into the button, and a plain product gets a taller, calmer picture.

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
- **Text is drawn from the font's outlines** (opentype.js), not a system font, so it looks the same on any server, and anything the font lacks (emoji) is left out of the picture instead of drawing an empty box. The picture uses **two** bundled open-licence faces for every shop (SIL OFL 1.1, subset to Latin, in `status-fonts.ts`): **Cormorant Garamond SemiBold** for the name and price (its lining figures are used, since the default old-style figures make a price hard to read) and **Jost Medium** for the small spaced capitals, chips and foot; a choice of fonts per shop was left for later.
- Pictures are made on request and not stored; the phone fetches them with the login token.

## Files

`backend/src/social/`: `status-kit.service.ts` (the kit, rotation, swap, mark), `status-kit.controller.ts` (`/portal/status-kit`: `GET`, `PUT settings` owner only, `GET :id/image`, `POST :id/swap`, `POST :id/posted`), `status-image.ts` (the picture),
`status-palette.ts` (colours from the theme), `photo-fetch.ts` (the careful fetch), `status-fonts.ts` (the two embedded faces; the first version used Libre Caslon, since removed), and `statusDetails` / `buildStatusCaption` in `social-post.ts`. Screen: `web/app/portal/status-kit/page.tsx`.
Items are `SocialPost` rows with channel `STATUS` (`<day>#<n>`, status READY then POSTED), kept out of the Social posting list. `SocialSetting.statusKitCount` (migration `20261121090000_add_status_kit_count`).
