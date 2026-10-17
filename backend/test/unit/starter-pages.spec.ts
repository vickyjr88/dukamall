import { buildStarterPages, hasPlaceholders, StarterFacts } from '../../src/shop-page/starter-pages';

const facts: StarterFacts = {
  name: 'Nairobi Gents',
  website: 'https://nairobigents.com',
  address: 'Shop F53, Dubai Merchants Mall, Nairobi CBD',
  openingHours: 'Mon-Sat 8am-8pm',
  contactPhone: '+254727206415',
  whatsappNumber: '+254784126008',
  contactEmail: 'hello@example.com',
};
const NOW = new Date('2026-10-17T00:00:00Z');
const bare: StarterFacts = { name: 'Quiet Shop', website: 'https://quiet.example' };

const page = (slug: string, f = facts) => buildStarterPages(f, NOW).find((p) => p.slug === slug)!;

describe('starter pages', () => {
  it('creates the six standard pages in footer order', () => {
    expect(buildStarterPages(facts, NOW).map((p) => p.slug)).toEqual([
      'about-us', 'delivery-and-returns', 'faq', 'contact', 'terms-of-service', 'privacy-policy',
    ]);
  });

  it("fills in the shop's own details, with a working WhatsApp link", () => {
    const contact = page('contact').body;
    expect(contact).toContain('+254727206415');
    expect(contact).toContain('[+254784126008](https://wa.me/254784126008)');
    expect(contact).toContain('hello@example.com');
    expect(contact).toContain('Shop F53, Dubai Merchants Mall, Nairobi CBD');
    expect(contact).toContain('Mon-Sat 8am-8pm');
    expect(page('delivery-and-returns').body).toContain('collect your order from Shop F53');
    expect(page('terms-of-service').body).toContain('Last updated: October 2026');
  });

  it('leaves out what the shop has not set instead of printing "null" or a broken link', () => {
    for (const p of buildStarterPages(bare, NOW)) {
      expect(p.body).not.toMatch(/null|undefined|wa\.me\/\)|\bnan\b/i);
    }
    expect(page('delivery-and-returns', bare).body).not.toContain('Collecting from us');
    expect(page('contact', bare).body).toContain('[add your phone, WhatsApp or email]');
  });

  it('never makes a claim the shop has not made', () => {
    const all = buildStarterPages(facts, NOW).map((p) => p.body).join('\n');
    expect(all).not.toMatch(/genuine|authentic|same-day|same day|quality-checked|free delivery|try before|KES \d/i);
  });

  it('marks every owner decision, so the pages read as unfinished until edited', () => {
    for (const slug of ['about-us', 'delivery-and-returns', 'faq', 'terms-of-service', 'privacy-policy']) {
      expect(hasPlaceholders(page(slug).body)).toBe(true);
    }
    expect(hasPlaceholders('A finished page with [a link](https://x.test).')).toBe(false);
    expect(hasPlaceholders('Pay with [add payment methods].')).toBe(true);
  });

  it('writes the FAQ as bold questions with answers, which the storefront turns into FAQ markup', () => {
    const questions = page('faq').body.split('\n').filter((l) => /^\*\*.+\?\*\*$/.test(l));
    expect(questions.length).toBeGreaterThanOrEqual(5);
    expect(page('faq', bare).body.split('\n').filter((l) => /^\*\*.+\?\*\*$/.test(l)).length).toBeGreaterThanOrEqual(4);
  });

  it('uses only formatting the storefront renders (no italics, tables or raw HTML)', () => {
    for (const p of buildStarterPages(facts, NOW)) {
      expect(p.body).not.toMatch(/<[a-z][^>]*>/i);
      expect(p.body).not.toMatch(/^\s*\|/m);
      expect(p.body).not.toMatch(/(^|[^*])\*[^*\s][^*\n]*\*([^*]|$)/m);
    }
  });
});
