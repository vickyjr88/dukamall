# Facebook: replying to people who comment on the shop's Page

Everyone who comments on a post or ad on the shop's Facebook Page gets **one private message in Messenger** from the Page, then a **short public reply** under the comment. The private message
opens a conversation the shop answers from its Page inbox in Meta Business Suite. It is the shop's own Page, token and Meta app (Portal > Connections > Facebook Page); nothing is read from the
server environment, and **nothing happens until the owner switches on "Reply to people who comment on your Page"**.

## What people get

Standard private message (the owner can write their own, with `{name}`, `{shop}`, `{whatsapp}`, `{page}`, `{site}`, `{location}`):

> Hi Wanjiru! 👋 Thanks for your interest in Nairobi Gents. Reply here with what you'd like and we'll confirm the price and delivery.
>
> 💬 WhatsApp: https://wa.me/254113206481
> 👍 Follow our page for new arrivals and offers: https://www.facebook.com/…

and, only after that went, the public reply: *"Thanks Wanjiru! 📩 We've sent you a message with the details. Check your Messenger inbox (or Message requests). 🛒 Shop online: <store address> 📍 Visit us: <shop address>"*.
The wording is filled from the shop's own details: its name, its WhatsApp number (Store info), the Page link, its storefront address and its address. **A line the shop has no value for is left out**,
so a shop with no WhatsApp number gets no "WhatsApp:" line with nothing after it.

## What Facebook allows (and does not)

- A Page may send **one** private message to the author of a comment, within **7 days** of the comment. People who only **like or react** cannot be messaged or invited to like the Page by any API.
- The private message needs `pages_messaging`; the public reply needs `pages_manage_engagement`. If that permission is missing the private message still goes and the failure is shown on the Facebook page.
- Until the shop's Meta app has Advanced Access (App Review), Facebook only delivers and allows replies for people with a role on the app. Test with them. Whether every ad's comments reach the shop (an ad is a
  "dark post") should be checked with one real comment on a live ad.

## Setting it up (the owner does this, with the guide on the Connections card)

1. Create a Meta app for the shop; get the Page ID and a System User token with `pages_show_list`, `pages_read_engagement`, `pages_messaging`, `pages_manage_metadata`, `pages_manage_engagement`
   (and `pages_manage_posts` for later); turn it into the Page's own token. Paste both under Connections > Facebook Page, save, and **Test connection**.
2. Press **Connect comments**. This subscribes the Page to the app's `feed` using the shop's token and makes the shop's own address. The address belongs to the shop's **app**, which only its
   dashboard can set: paste the callback address and verify token (shown once) into the Meta app under **Webhooks > Page**, and subscribe to **feed**.
3. Switch on **Reply to people who comment on your Page** and save. The **Facebook** page then shows "Facebook is sending you comments" and, as people comment, what was done about each.

## Rules (each has a test in `test/integration/facebook.int-spec.ts`)

- **One reply per comment.** The comment id is unique per shop, so Facebook delivering an event twice (it does) does nothing.
- **Not answered:** the Page's own comments (which stops our public reply starting a loop), a comment on a different Page, a reply to another comment (top-level comments only), a comment containing a link
  (nearly always spam), and a person messaged in the last 7 days (**per shop**: the same person commenting on two shops' Pages is messaged by each).
- **Limits per shop:** "Most private messages a day" (default 200).
- **Failures:** if Facebook is down or rate-limiting, the reply is tried again a few minutes later, three times at most, within 6 days. A refusal (a missing permission, an expired token) is not retried and is
  shown with Facebook's own words. If Facebook says the comment was already answered, it is skipped. A reply left half-sent by a stopped backend is picked up after ten minutes. A shop that switches replies off
  drops its waiting replies.
- **Webhook:** `/facebook/webhook/<secret>`, one per shop. A wrong secret is a 404; Facebook's signature is checked with the shop's own app secret when it saved one; always 200 once authentic.

## Files

`backend/src/facebook/`: `facebook-comments.ts` (pure rules and the default wording), `facebook-connection.service.ts` (a shop's Page, settings and details), `facebook-comments.service.ts` (the replies and retries),
`facebook-webhook.controller.ts`, `facebook.controller.ts` (`/portal/facebook`, owner only). Screens: `web/app/portal/facebook/page.tsx`, and the Facebook card on Connections (switches, wording, Connect comments).
Table `FacebookCommentReply` (migration `20261119090000_add_facebook_comment_replies`).
