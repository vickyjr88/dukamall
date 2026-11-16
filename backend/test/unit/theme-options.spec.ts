import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateThemeDto } from '../../src/shop/storefront-content.dto';
import {
  DEFAULT_STYLE_PRESET, FONT_PAIRINGS, FONT_PAIRING_KEYS, LAYOUT_PRESET_KEYS, STYLE_PRESETS, STYLE_PRESET_KEYS,
} from '../../src/shop/theme-options';

const errorsFor = async (body: Record<string, unknown>) => (await validate(plainToInstance(UpdateThemeDto, body))).map((e) => e.property);

describe('theme options', () => {
  it('offers the original look first and as the default, so no shop changes unless its owner picks another', () => {
    expect(DEFAULT_STYLE_PRESET).toBe('classic');
    expect(STYLE_PRESETS[0].key).toBe('classic');
    expect(STYLE_PRESET_KEYS).toEqual(['classic', 'maison', 'noir']);
  });

  it('accepts every offered style, font pairing and layout, and nothing else', async () => {
    for (const key of STYLE_PRESET_KEYS) expect(await errorsFor({ stylePreset: key })).toEqual([]);
    for (const key of FONT_PAIRING_KEYS) expect(await errorsFor({ fontPairing: key })).toEqual([]);
    for (const key of LAYOUT_PRESET_KEYS) expect(await errorsFor({ layoutPreset: key })).toEqual([]);
    expect(await errorsFor({ stylePreset: 'brutalist' })).toEqual(['stylePreset']);
    expect(await errorsFor({ stylePreset: '' })).toEqual(['stylePreset']);
    expect(await errorsFor({ fontPairing: 'comic-sans' })).toEqual(['fontPairing']);
  });

  it('keeps the luxury font pairings the luxury styles are designed around', () => {
    expect(FONT_PAIRINGS.map((f) => f.key)).toEqual(expect.arrayContaining(['cormorant-jost', 'bodoni-hanken']));
  });

  it('describes every style for the picker', () => {
    for (const s of STYLE_PRESETS) {
      expect(s.label.length).toBeGreaterThan(5);
      expect(s.description.length).toBeGreaterThan(20);
    }
  });
});
