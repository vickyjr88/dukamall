import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  cleanGa4Id, cleanMetaPixelId, cleanSearchConsoleCode, cleanTikTokPixelId, cleanXPixelId,
  isGa4Id, isMetaPixelId, isSearchConsoleCode, isTikTokPixelId, isXPixelId,
} from '../../src/common/tracking-ids';
import { UpdateStorefrontDto } from '../../src/shop/storefront-content.dto';

const check = async (body: Record<string, unknown>) => {
  const dto = plainToInstance(UpdateStorefrontDto, body);
  return { dto, errors: await validate(dto) };
};

describe('Google Analytics ID', () => {
  it('accepts real-looking GA4 IDs', () => {
    for (const id of ['G-ABC123DEF4', 'G-1A2B3C4D5E', 'G-XXXXXXXXXX']) expect(isGa4Id(id)).toBe(true);
  });
  it('is cleaned: trimmed and upper-cased', () => {
    expect(cleanGa4Id('  g-abc123def4 ')).toBe('G-ABC123DEF4');
  });
  it.each([
    ["G-X'); alert(1);//"], ['G-ABC123</script><script>alert(1)'], ['UA-12345-1'], ['G-'], ['G-AB'], ['GTM-ABCD123'], ['ABC123DEF4'],
    ['G-ABC 123DEF4'], ['G-ABC123DEF4\nG-EVIL'], ["javascript:alert(1)"], ['G-ÅBC123DEF4'],
  ])('rejects %s', (bad) => {
    expect(isGa4Id(cleanGa4Id(bad))).toBe(false);
  });
});

describe('Search Console code', () => {
  const code = 'aBcD1234_efGH5678-ijKL9012mnOP3456qrST7890';
  it('accepts the bare code', () => expect(isSearchConsoleCode(cleanSearchConsoleCode(code))).toBe(true));
  it('pulls the code out of the whole tag Google shows', () => {
    expect(cleanSearchConsoleCode(`<meta name="google-site-verification" content="${code}" />`)).toBe(code);
    expect(cleanSearchConsoleCode(`  <meta name='google-site-verification' content='${code}'>  `)).toBe(code);
  });
  it.each([['short'], ['has spaces in the middle of the code xxxxxxxxxx'], ['"><script>alert(1)</script>aaaaaaaaaaaaaaaa'], ['a'.repeat(101)]])('rejects %s', (bad) => {
    expect(isSearchConsoleCode(cleanSearchConsoleCode(bad))).toBe(false);
  });
});

describe('storefront settings validation', () => {
  it('cleans and accepts a pasted GA4 ID and a pasted tag', async () => {
    const { dto, errors } = await check({ ga4MeasurementId: ' g-abc123def4 ', searchConsoleVerification: '<meta name="google-site-verification" content="aBcD1234_efGH5678-ijKL9012mnOP3456" />' });
    expect(errors).toHaveLength(0);
    expect(dto.ga4MeasurementId).toBe('G-ABC123DEF4');
    expect(dto.searchConsoleVerification).toBe('aBcD1234_efGH5678-ijKL9012mnOP3456');
  });
  it('refuses an injection attempt', async () => {
    const { errors } = await check({ ga4MeasurementId: "G-X'); alert(1);//" });
    expect(errors.map((e) => e.property)).toContain('ga4MeasurementId');
  });
  it('lets an empty string through so the field can be cleared', async () => {
    expect((await check({ ga4MeasurementId: '', searchConsoleVerification: '' })).errors).toHaveLength(0);
    expect((await check({ ga4MeasurementId: null })).errors).toHaveLength(0);
  });
});

describe('ad pixel IDs', () => {
  const evil = ["1234567890'); alert(1);//", '123456789012345</script><script>alert(1)', 'javascript:alert(1)', '123 456 789 012 345', '1234567890\nEVIL', '', '   ', '١٢٣٤٥٦٧٨٩٠'];

  it('Meta: accepts a numeric Pixel ID and trims it', () => {
    expect(isMetaPixelId(cleanMetaPixelId(' 1234567890123456 '))).toBe(true);
    expect(isMetaPixelId('123456789012345')).toBe(true);
  });
  it.each([['abc1234567890'], ['12345'], ['1'.repeat(21)], ['12345678a'], ...evil.map((e) => [e])])('Meta: rejects %s', (bad) => {
    expect(isMetaPixelId(cleanMetaPixelId(bad))).toBe(false);
  });

  it('TikTok: accepts the upper-case ID and cleans a lower-case paste', () => {
    expect(isTikTokPixelId('C1A2B3D4E5F6G7H8I9J0')).toBe(true);
    expect(cleanTikTokPixelId(' c1a2b3d4e5f6g7h8i9j0 ')).toBe('C1A2B3D4E5F6G7H8I9J0');
    expect(isTikTokPixelId(cleanTikTokPixelId(' c1a2b3d4e5f6g7h8i9j0 '))).toBe(true);
  });
  it.each([['SHORT'], ['C1A2B3D4E5F6-G7H8I9J0'], ['A'.repeat(31)], ...evil.map((e) => [e])])('TikTok: rejects %s', (bad) => {
    expect(isTikTokPixelId(cleanTikTokPixelId(bad))).toBe(false);
  });

  it('X: accepts short lower-case IDs and cleans an upper-case paste', () => {
    for (const id of ['o1abc', 'oh9z2', 'nuxyz12']) expect(isXPixelId(id)).toBe(true);
    expect(cleanXPixelId(' O1ABC ')).toBe('o1abc');
  });
  it.each([['abc'], ['o1-abc'], ['a'.repeat(13)], ...evil.map((e) => [e])])('X: rejects %s', (bad) => {
    expect(isXPixelId(cleanXPixelId(bad))).toBe(false);
  });

  it('is cleaned, accepted and clearable through the storefront settings DTO', async () => {
    const ok = await check({ metaPixelId: ' 1234567890123456 ', tiktokPixelId: ' c1a2b3d4e5f6g7h8i9j0', xPixelId: ' O1ABC ' });
    expect(ok.errors).toHaveLength(0);
    expect(ok.dto).toMatchObject({ metaPixelId: '1234567890123456', tiktokPixelId: 'C1A2B3D4E5F6G7H8I9J0', xPixelId: 'o1abc' });
    expect((await check({ metaPixelId: '', tiktokPixelId: null, xPixelId: '' })).errors).toHaveLength(0);
  });
  it('refuses injection attempts in every pixel field', async () => {
    const { errors } = await check({ metaPixelId: "1');alert(1);//", tiktokPixelId: "X'); alert(1);//", xPixelId: '"><script>' });
    expect(errors.map((e) => e.property).sort()).toEqual(['metaPixelId', 'tiktokPixelId', 'xPixelId']);
  });
});
