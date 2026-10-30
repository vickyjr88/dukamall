#!/usr/bin/env python3
"""Builds the unpublished guide pages for the two shops and writes SQL that inserts them as drafts.

Usage: python3 docs/page-drafts/build.py > drafts.sql  (then run it against the shops database)
Rows are inserted with published=false and showInFooter=false, and never overwrite an existing page
(ON CONFLICT DO NOTHING). Publish one from the portal's Pages screen once its prices have been re-checked.
"""
import sys

SHOPS = {
    'nairobigents': dict(
        name='Nairobi Gents', where='Shop F53, Dubai Merchants Mall, Nairobi CBD', hours='Mon-Sat 8am-8pm',
        wa='+254784126008', intro='Nairobi Gents sells men\'s sneakers, casuals and official shoes from Dubai Merchants Mall in Nairobi CBD.',
    ),
    'msa': dict(
        name='Drip Emporium Msa', where='Dubai Merchants Mall, Shop F53, Ronald Ngala Street, Nairobi CBD', hours='Every day, 8am to 8pm',
        wa='+254113206481', intro='Drip Emporium Msa sells sneakers, casuals and official shoes, from our shop at Dubai Merchants Mall on Ronald Ngala Street, Nairobi CBD.',
    ),
}

def price_guide(s):
    return f"""{s['intro']} This guide lists what shoes cost with us, in Kenyan shillings, so you know the range before you ask.

## What shoes cost at {s['name']}

Prices below are the lowest and highest in the current catalogue and change as stock changes: the product page always shows today's price.

- **Nike sneakers:** KES 2,000 to 4,200 (Air Force 1, Air Max, Dunk, TN and more)
- **Jordan sneakers:** KES 3,500 to 3,800
- **Adidas:** KES 3,000 to 3,700
- **New Balance:** KES 3,500 to 4,500
- **Puma:** KES 3,500 to 5,000
- **Converse:** KES 2,300
- **Official shoes:** KES 3,500 to 4,500

## Why the same brand has different prices

Within one brand the price depends on the model, the materials and how much was made. Classic low-tops sit at the lower end; chunkier or more complex shapes sit higher. Compare models, not just brands.

## How to get the best value

1. Decide the use first: daily wear, gym, or smart-casual. It narrows the list fast.
2. Check the sizes listed on the product page before falling for a pair. A great price on a size that does not exist for you is no saving.
3. Ask on WhatsApp ({s['wa']}) if you want a model that is not listed or a size that is out of stock; we will tell you honestly whether we can get it.

## Where to buy

Visit us at {s['where']} ({s['hours']}), or order online and we will contact you to arrange delivery and confirm the cost.
"""

def buying_online(s):
    return f"""Buying shoes online in Kenya is easy when you check a few things first. Here is the checklist we would use ourselves.

## Before you pay

1. **Check the seller is a real shop with an address.** {s['name']} is at {s['where']}, open {s['hours']}. You can visit before or after ordering.
2. **Read the product page, not just the photo.** Look at the listed sizes, the price in shillings and the description.
3. **Confirm the size.** Shoe sizes differ between brands. If you are between sizes, message us and we will help you choose.
4. **Ask how delivery works.** Delivery cost depends on where the parcel is going, so we confirm it with you when you order rather than guessing at checkout.
5. **Keep the conversation.** Order details on WhatsApp ({s['wa']}) give both sides a written record.

## Questions to ask any online shoe seller

- Is the size I want in stock, or will it be ordered for me, and how long will that take?
- What is the total cost, including delivery, to my area?
- Where is your shop, and can I collect?

## Ordering from {s['name']}

Add the shoes you want to the cart, or send the product link on WhatsApp. We will confirm sizes, delivery and the total with you before anything is sent.
"""

def size_guide(s):
    return f"""Getting the size right is the biggest factor in whether new shoes are comfortable. This is how we suggest choosing, with the EUR sizes we list (usually 36 to 46).

## How to measure your foot

1. Stand on a sheet of paper in the evening, when feet are at their largest.
2. Mark the tip of your longest toe and the back of your heel.
3. Measure the distance in centimetres and compare it with the size chart on the brand's own site if you have one.
4. Measure both feet and use the larger one.

## If you are between sizes

- Wearing thick socks, such as for sport? Go up.
- Narrow feet and a snug fit preferred? Stay with the smaller size.
- Unsure? Message us on WhatsApp ({s['wa']}) with the shoe you like and your usual size in another brand, and we will advise.

## Sizes on our product pages

Each product page lists only the sizes that pair actually comes in, written the same way throughout (for example EUR 42). If your size is not listed, ask: we will tell you honestly whether we can get it.

## Try them in person

Our shop is at {s['where']} ({s['hours']}). Coming in is the surest way to find your size.
"""

PAGES = [
    ('shoe-prices-in-kenya', 'Shoe prices in Kenya', price_guide),
    ('buying-shoes-online-in-kenya', 'How to buy shoes online in Kenya', buying_online),
    ('shoe-size-guide', 'Shoe size guide', size_guide),
]

def q(text):
    assert '$gd$' not in text
    return f'$gd${text}$gd$'

out = ['BEGIN;']
for slug, shop in SHOPS.items():
    for i, (pslug, title, fn) in enumerate(PAGES):
        out.append(
            f'INSERT INTO "ShopPage" (id, "shopId", slug, title, body, published, "showInFooter", position, "createdAt", "updatedAt") '
            f"SELECT 'c' || md5(random()::text || clock_timestamp()::text), id, '{pslug}', {q(title)}, {q(fn(shop))}, false, false, {50 + i}, now(), now() "
            f"FROM \"Shop\" WHERE slug = '{slug}' ON CONFLICT (\"shopId\", slug) DO NOTHING;"
        )
out.append('COMMIT;')
print('\n'.join(out))
