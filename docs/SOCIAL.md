# Social posting: products posted to the shop's Facebook Page and Threads

Each shop can have its own products posted, with no one checking them first, to **its own** Facebook Page and Threads account. A post is one product's photo, name, price, what is in stock
(sizes for shoes and clothes, storage and colour for phones, a version for a watch), a link to the product page, the shop's WhatsApp number and its address. **Nothing is posted until the
owner connects the account (Portal > Connections) and presses "Start posting" for that channel (Portal > Social posting).** Each channel is switched on separately.

## What the owner controls (Portal > Social posting, owner only)

- **Start / Pause posting** per channel. Starting asks for confirmation, because every post is public and in the shop's name.
- **Times** (Nairobi time, up to six a day, default 09:00, 13:00, 19:00), the same for both channels.
- **Preview the next posts**: shows the product and the exact text each channel would post now. **Post to Facebook / Threads now** posts what was previewed, after a confirmation.
- **Posts**: every attempt with its channel, product, result and Meta's own reason when it failed. **Take down** deletes a posted item from the Page or Threads.
- The Threads login's end date (it renews itself) and any renewal problem.

## Rules (each has a test in `test/unit/social-post.spec.ts` or `test/integration/social.int-spec.ts`)

- **Only what a shopper can buy now**: an active product in a live category with at least one variant in stock, a photo and a price. The price is the one a shopper pays today (a running sale shows both prices).
  The options listed are only those still in stock.
- **Rotation**: products never posted come first, then whichever was posted longest ago; nothing is posted on the same channel within the cooldown (30 days). A small shop that has posted everything may repeat the one posted longest ago, but only if that was at least a week ago. Two posts of the same brand in a row are avoided when there is another choice. If nothing qualifies the slot is skipped and says why.
- **Once per slot**: a slot is claimed in the database (`shopId + channel + slotKey` is unique), so the two backend slots, a restart or a retry never post it twice.
- **Late slots are dropped**: a slot missed by more than 90 minutes is not posted late. A transient failure (Meta down, rate limit) is retried after 4 minutes, three attempts at most; a refusal (token, permission) is not retried.
- **Per shop**: rotation, settings, rows and credentials never cross between shops. A shop with no connection, or whose channel is off, is never touched.
- **Kill switch**: `SOCIAL_POSTING=false` in the server environment stops every shop's posting, whatever the screens say; the screen says so. (This is an operator switch, not a credential.)
- **Visits are counted**: links carry `utm_source=facebook|threads&utm_medium=social&utm_campaign=autopost`, so Analytics shows the channel.

## Threads

- Threads uses its own login (a token starting `THAA`, different from the Facebook Page token), pasted under Connections > Threads. It lasts 60 days; the engine renews it when it is within 20 days of ending and writes
  the renewed one back to the shop's own connection. A renewal Meta refuses (the token is under a day old) is not fatal.
- A post is made in three steps (create, wait until Meta has fetched the picture, publish). Captions stay within 500 characters (480 is aimed for): when the text is too long the address goes first, then the WhatsApp number, then the stock options, and only then the name is cut; the price and the link are never dropped. Threads allows 250 posts a day; the engine uses at most six.

## Facebook

The photo is posted to the Page with the caption (`pages_manage_posts`). If Meta cannot fetch the picture from its address, the row says so and nothing is half-posted.

## Files

`backend/src/social/`: `social-post.ts` (the pure rules: wording, sizes, rotation, slots), `postable-products.service.ts` (what a shop could post), `social-posting.service.ts` (the engine, claims, retries, Threads renewal, take-down),
`social-posting.controller.ts` (`/portal/social`, owner only), `dto.ts`, `social.module.ts`. Screen: `web/app/portal/social/page.tsx`. Tables `SocialSetting` and `SocialPost`
(migration `20261120090000_add_social_posting`). Ids and tokens come from the shop's own connections (see `INTEGRATIONS.md`); the only environment names used are the kill switch `SOCIAL_POSTING` and the test timing knobs `SOCIAL_PUBLISH_WAIT_MS`, `SOCIAL_POLL_MS`.

The WhatsApp Status kit (pictures to share by hand, since WhatsApp has no way to post a Status automatically) is in `STATUS-KIT.md`; it uses the same products and the same table, under its own channel.
