/**
 * Starting points for the pages shoppers look for: About, Delivery & returns, FAQs, Contact,
 * Terms and Privacy. Written once here and filled in from the shop's own Store info, so a
 * new shop starts with real addresses and numbers instead of blanks.
 *
 * Two rules keep them safe to hand to any shop:
 *  - They state only what the shop's settings say. Anything that is the merchant's own
 *    decision or claim (delivery times, returns window, what they sell, which payments they
 *    take) is an "[add ...]" marker to fill in -- never a guess such as "genuine products" or
 *    "same-day delivery".
 *  - They are created as drafts, and portal/pages shows "needs your input" until no marker is
 *    left. A returns, terms or privacy policy is a commitment the owner has to make.
 *
 * Wording uses the markdown subset in web/app/lib/rich-text.tsx.
 */

export type StarterFacts = {
  name: string;
  /** The shop's public address, e.g. https://nairobigents.com */
  website: string;
  address?: string | null;
  openingHours?: string | null;
  contactPhone?: string | null;
  whatsappNumber?: string | null;
  contactEmail?: string | null;
};

export type StarterPage = { slug: string; title: string; body: string };

const PLACEHOLDER = /\[add [^\]]*\]/i;

/** True while a page still has an "[add ...]" marker the owner has to replace. */
export function hasPlaceholders(body: string): boolean {
  return PLACEHOLDER.test(body);
}

const ask = (what: string) => `[add ${what}]`;
const present = (value?: string | null): value is string => Boolean(value && value.trim());
const digits = (value: string) => value.replace(/[^\d]/g, '');

function monthYear(now: Date): string {
  return now.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Bullet lines for however a shopper can reach the shop, using only the details that exist. */
function contactLines(f: StarterFacts, { hours = true }: { hours?: boolean } = {}): string[] {
  const lines: string[] = [];
  if (present(f.contactPhone)) lines.push(`- **Call:** ${f.contactPhone.trim()}`);
  if (present(f.whatsappNumber)) lines.push(`- **WhatsApp:** [${f.whatsappNumber.trim()}](https://wa.me/${digits(f.whatsappNumber)})`);
  if (present(f.contactEmail)) lines.push(`- **Email:** ${f.contactEmail.trim()}`);
  if (present(f.address)) lines.push(`- **Visit us:** ${f.address.trim()}`);
  if (hours && present(f.openingHours)) lines.push(`- **Opening hours:** ${f.openingHours.trim()}`);
  if (lines.length === 0) lines.push(`- ${ask('your phone, WhatsApp or email')}`);
  return lines;
}

/** "Call 0700 000 000, WhatsApp ..., or email ..." for running text. */
function contactSentence(f: StarterFacts): string {
  const parts: string[] = [];
  if (present(f.contactPhone)) parts.push(`call ${f.contactPhone.trim()}`);
  if (present(f.whatsappNumber)) parts.push(`WhatsApp ${f.whatsappNumber.trim()}`);
  if (present(f.contactEmail)) parts.push(`email ${f.contactEmail.trim()}`);
  if (parts.length === 0) return `contact us (${ask('your phone, WhatsApp or email')})`;
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`;
}

export function buildStarterPages(f: StarterFacts, now: Date = new Date()): StarterPage[] {
  const hasAddress = present(f.address);
  const collect = hasAddress
    ? `You can collect your order from ${f.address!.trim()}${present(f.openingHours) ? `, ${f.openingHours.trim()}` : ''}.`
    : null;

  const about = `## Who we are

${f.name} is ${ask('what you sell and where you are based, in a sentence or two')}.

## Why shop with us

${ask('what makes you different: your range, your prices, how you look after customers')}

## Find us

${hasAddress || present(f.contactPhone) || present(f.whatsappNumber) || present(f.contactEmail)
    ? contactLines(f).join('\n')
    : ask('your shop address and opening hours, or say that you sell online only')}`;

  const delivery = `## Delivery

We deliver ${ask('where you deliver, e.g. countrywide')}. The cost and the time depend on ${ask('what they depend on, e.g. the distance and the courier')}, and we confirm both with you before we dispatch.

- ${ask('your delivery time in your home town')}
- ${ask('your delivery time elsewhere')}

## Ordering and paying

Place your order on the website${present(f.whatsappNumber) ? ' or message us on WhatsApp' : ''}. We contact you to confirm it, agree how you will pay, then dispatch it${collect ? ' or have it ready for collection' : ''}.

Payment: ${ask('the ways you accept payment, e.g. M-Pesa, card, cash on collection')}. Please never send a PIN or password to anyone claiming to be us.
${collect ? `\n## Collecting from us\n\n${collect}\n` : ''}
## Checking your order

Please check your parcel when it arrives and make sure it matches your order. If something is wrong, ${contactSentence(f)} as soon as you can, with photos if you have them.

## Returns & exchanges

${ask('your policy: how many days a customer has, the condition items must be in, and who pays for the return')}`;

  const faqs = `## Delivery

**Do you deliver, and what does it cost?**
We deliver ${ask('where you deliver')}. The cost depends on ${ask('what it depends on, e.g. the distance and the courier')}, and we tell you before we dispatch.
${hasAddress ? `\n**Can I collect my order instead?**\nYes. Choose collection when you order and pick up from ${f.address!.trim()}.\n` : ''}
## Payment

**How do I pay?**
${ask('the ways you accept payment')}.

## Sizes and stock

**What if the size I want isn't listed?**
Message us with the product and the size and we will tell you whether we can get it.

## Returns

**Can I return or exchange something?**
${ask('your returns policy in a sentence, and point to the Delivery & returns page')}

## Anything else

**How do I reach you?**
${contactSentence(f).replace(/^./, (c) => c.toUpperCase())}. Our full contact details are on the Contact page.`;

  const contact = `## Get in touch

Questions about a product, a size, an order or delivery? ${contactSentence(f).replace(/^./, (c) => c.toUpperCase())}.

${contactLines(f).join('\n')}`;

  const company = hasAddress ? `\n- **Address:** ${f.address!.trim()}` : '';
  const terms = `Last updated: ${monthYear(now)}

Welcome to ${f.name}. By browsing our website or placing an order you agree to the terms below. Please read them before you buy.

## 1. About us

${f.name} is ${ask('a short description of the business')}.

- **Website:** ${f.website}${company}
${contactLines(f, { hours: false }).join('\n')}

## 2. Products and prices

We take care to describe our products accurately, but colours can look different on your screen and details can change without notice. Prices are shown in the currency on each product unless stated otherwise and the price that applies is the one shown when you order. We may change prices and offers at any time.

## 3. Availability

Products and sizes are subject to availability. If an item becomes unavailable after you order, we will contact you to offer an alternative or a refund.

## 4. Orders

An order is submitted when you complete checkout or message us. We may contact you to confirm your order, delivery details, availability or payment before we process it, and we may cancel an order if there is a stock or pricing error, suspected fraud or another reason we cannot fulfil it.

## 5. Payment

Payment methods are shown at checkout or confirmed with you when we confirm your order. Orders may not be dispatched until payment is received, unless you are paying on collection.

## 6. Delivery

Delivery times and charges vary with your location and the courier. You are responsible for giving accurate delivery details. We are not responsible for delays caused by incorrect information or events outside our reasonable control.

## 7. Checking your delivery

Please inspect your parcel when it arrives. If an item is wrong, damaged or defective, ${contactSentence(f)} as soon as possible with details and, where possible, photos.

## 8. Returns and exchanges

${ask('your returns and exchanges terms: the time limit, the condition items must be in, and any items that cannot be returned')}

## 9. Using the website

Please use the website lawfully. You must not interfere with its operation or security, try to gain unauthorised access, introduce malicious software or use it for fraud.

## 10. Website content

The ${f.name} name, branding, photographs and written content belong to ${f.name} or their respective owners. Please do not copy or use them commercially without permission.

## 11. Your information

We use the information you give us to process orders and provide support, as described in our Privacy Policy.

## 12. Liability

We take reasonable steps to give accurate information and to fulfil confirmed orders. We are not responsible for losses or delays caused by events beyond our reasonable control, including courier disruption, network failures and payment-provider outages. Nothing in these terms limits any right you have under the law that cannot legally be excluded.

## 13. Changes to these terms

We may update these terms from time to time. The latest version is always on our website, and continuing to use the website after a change means you accept it.

## 14. Governing law

These terms are governed by ${ask('the law that applies, e.g. the laws of Kenya')}.

## 15. Contact us

${contactLines(f).join('\n')}`;

  const privacy = `Last updated: ${monthYear(now)}

${f.name} respects your privacy. This policy explains what personal information we collect when you use our website, place an order or contact us, how we use and protect it, and your rights.

## 1. Who we are

${f.name}, ${f.website}.
${contactLines(f, { hours: false }).join('\n')}

## 2. What we collect

- Your name, phone number, email address and delivery address
- Your order details and the products you buy
- Your size and product preferences
- Payment and transaction information
- Messages you send us, including by WhatsApp, phone, email or social media
- Technical information such as your IP address, browser and device type, and the pages you visit

## 3. How we use it

- To process and deliver your orders and confirm payments
- To answer your questions and help you choose products and sizes
- To process returns and exchanges
- To improve our website and understand how well our marketing works
- To prevent fraud and keep the website secure
- To send you offers, where you have agreed to receive them
- To meet legal requirements

## 4. Payment information

Payments may be handled by third-party payment providers or arranged directly with you. We do not intend to store sensitive payment details such as a full card number or a mobile-money PIN. Please never send your PIN, password or other confidential payment details to us.

## 5. Cookies and analytics

The website may use cookies and similar tools to keep it working, remember preferences and understand how visitors use it, for example with an analytics service such as Google Analytics. You can control cookies in your browser settings, although parts of the site may not work properly without them.

## 6. Sharing your information

We share information only where reasonably necessary to run the business: with payment providers, couriers and delivery companies, website hosting and technology providers, analytics and advertising providers, professional advisers, and authorities where the law requires. We do not sell your personal information.

## 7. Keeping it safe

We take reasonable technical and organisational steps to protect your information against loss, misuse and unauthorised access. No online system is completely secure, and you are responsible for keeping your own devices and account details safe.

## 8. How long we keep it

We keep personal information only as long as reasonably necessary, for example to keep records of orders, give support, meet accounting requirements, resolve disputes and comply with the law.

## 9. Your rights

Subject to the law that applies to us, you may ask to see the information we hold about you, ask us to correct it, ask us to delete it, object to certain uses, or withdraw consent where we rely on it. To do so, ${contactSentence(f)}. We may need to verify your identity first.

## 10. Children

Our website is not intended to collect personal information directly from children. If you buy for a child, the person ordering should be an adult.

## 11. Other websites

Our website may link to other websites and services. We are not responsible for their privacy practices and encourage you to read their policies.

## 12. Changes to this policy

We may update this policy from time to time. The latest version, with its date, is always on our website.

## 13. Contact us

${contactLines(f, { hours: false }).join('\n')}

${ask('anything else that applies to you, e.g. the data protection law you follow and your registration details')}`;

  return [
    { slug: 'about-us', title: 'About us', body: about },
    { slug: 'delivery-and-returns', title: 'Delivery & returns', body: delivery },
    { slug: 'faq', title: 'FAQs', body: faqs },
    { slug: 'contact', title: 'Contact us', body: contact },
    { slug: 'terms-of-service', title: 'Terms of service', body: terms },
    { slug: 'privacy-policy', title: 'Privacy policy', body: privacy },
  ];
}
