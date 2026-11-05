import { BadRequestException } from '@nestjs/common';
import { classifyVisit, deviceOf, looksLikeBot } from '../../src/storefront-events/visit';
import { StorefrontEventsService, cleanEvents } from '../../src/storefront-events/storefront-events.service';

describe('where a visit came from', () => {
  it('trusts the merchant\'s own tags and tidies the name', () => {
    expect(classifyVisit({ utmSource: 'fb', utmMedium: 'cpc', utmCampaign: 'puma-roma' })).toEqual({ source: 'Facebook', medium: 'cpc', campaign: 'puma-roma' });
    expect(classifyVisit({ utmSource: 'IG' })).toEqual({ source: 'Instagram', medium: 'social', campaign: null });
    expect(classifyVisit({ utmSource: 'newsletter' }).source).toBe('newsletter');
  });

  it('knows an untagged ad by the click id the platform adds', () => {
    expect(classifyVisit({ clickIds: { fbclid: true } })).toMatchObject({ source: 'Facebook', medium: 'paid' });
    expect(classifyVisit({ clickIds: { ttclid: true }, referrer: 'https://www.tiktok.com/' })).toMatchObject({ source: 'TikTok', medium: 'paid' });
    expect(classifyVisit({ clickIds: { gclid: true } })).toMatchObject({ source: 'Google', medium: 'paid' });
  });

  it('reads the referring page when nothing is tagged', () => {
    expect(classifyVisit({ referrer: 'https://l.facebook.com/l.php?u=x' })).toMatchObject({ source: 'Facebook', medium: 'social' });
    expect(classifyVisit({ referrer: 'https://l.instagram.com/' })).toMatchObject({ source: 'Instagram', medium: 'social' });
    expect(classifyVisit({ referrer: 'https://www.google.com/' })).toMatchObject({ source: 'Google', medium: 'organic' });
    expect(classifyVisit({ referrer: 'https://www.google.co.ke/search?q=x' })).toMatchObject({ source: 'Google', medium: 'organic' });
    expect(classifyVisit({ referrer: 'https://web.whatsapp.com/' })).toMatchObject({ source: 'WhatsApp', medium: 'social' });
    expect(classifyVisit({ referrer: 'https://someblog.co.ke/post' })).toMatchObject({ source: 'someblog.co.ke', medium: 'referral' });
  });

  it('calls a typed address, a hidden referrer or the shop\'s own page direct', () => {
    expect(classifyVisit({})).toEqual({ source: 'Direct', medium: 'none', campaign: null });
    expect(classifyVisit({ referrer: 'https://nairobigents.co.ke/shop/x', ownHost: 'www.nairobigents.co.ke' })).toMatchObject({ source: 'Direct' });
    expect(classifyVisit({ referrer: 'not a url' })).toMatchObject({ source: 'Direct' });
  });

  it('bounds what a stranger can make us store', () => {
    const v = classifyVisit({ utmSource: 'x'.repeat(500), utmCampaign: 'c'.repeat(500) });
    expect(v.source.length).toBeLessThanOrEqual(40);
    expect(v.campaign!.length).toBeLessThanOrEqual(80);
  });
});

describe('devices and crawlers', () => {
  it('tells phone, tablet and desktop apart', () => {
    expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148')).toBe('mobile');
    expect(deviceOf('Mozilla/5.0 (Linux; Android 14; SM-A155F) AppleWebKit Mobile Safari')).toBe('mobile');
    expect(deviceOf('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('tablet');
    expect(deviceOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120')).toBe('desktop');
  });

  it('ignores crawlers and link previews, and requests with no browser at all', () => {
    expect(looksLikeBot('Googlebot/2.1')).toBe(true);
    expect(looksLikeBot('facebookexternalhit/1.1')).toBe(true);
    expect(looksLikeBot('WhatsApp/2.23')).toBe(true);
    expect(looksLikeBot('')).toBe(true);
    expect(looksLikeBot(undefined)).toBe(true);
    expect(looksLikeBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1')).toBe(false);
  });
});

describe('what a browser may send', () => {
  it('keeps known events and drops the rest', () => {
    const events = cleanEvents([{ type: 'VIEW_PRODUCT', productSlug: 'iphone-13' }, { type: 'DROP_TABLE' }, { type: 'SEARCH', detail: '  air max  ' }]);
    expect(events.map((e) => e.type)).toEqual(['VIEW_PRODUCT', 'SEARCH']);
    expect(events[1].detail).toBe('air max');
  });

  it('refuses an empty or oversized batch and a non-list', () => {
    expect(() => cleanEvents([])).toThrow(BadRequestException);
    expect(() => cleanEvents(Array.from({ length: 11 }, () => ({ type: 'SEARCH' })))).toThrow(BadRequestException);
    expect(() => cleanEvents('x')).toThrow(BadRequestException);
  });

  it('refuses a malformed session and stores nothing for a crawler', async () => {
    const created: any[] = [];
    const prisma: any = { storefrontEvent: { findFirst: async () => null, createMany: async ({ data }: any) => { created.push(...data); } } };
    const service = new StorefrontEventsService(prisma);
    await expect(service.record('s1', { sessionId: 'short', events: [{ type: 'SEARCH' }] }, { userAgent: 'Mozilla/5.0 iPhone Mobile' })).rejects.toThrow(BadRequestException);
    expect(await service.record('s1', { sessionId: 'abcdefghij1234', events: [{ type: 'SEARCH', detail: 'x' }] }, { userAgent: 'Googlebot/2.1' })).toEqual({ recorded: 0 });
    expect(created).toEqual([]);
    await service.record('s1', { sessionId: 'abcdefghij1234', events: [{ type: 'SESSION_START', utmSource: 'fb', referrer: '' }, { type: 'VIEW_PRODUCT', productSlug: 'a' }] }, { userAgent: 'Mozilla/5.0 (iPhone) Mobile Safari' });
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({ type: 'SESSION_START', source: 'Facebook', device: 'mobile' });
  });
});
