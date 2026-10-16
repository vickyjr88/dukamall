import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { cleanGa4Id, cleanSearchConsoleCode, isGa4Id, isSearchConsoleCode } from '../../src/common/tracking-ids';
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
