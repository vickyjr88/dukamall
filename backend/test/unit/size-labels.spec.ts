import { canonicalSize, distinctSizes, sizeSpellings } from '../../src/common/size-labels';

describe('size labels', () => {
  it('treats "EUR 40" and a bare "40" as one size', () => {
    expect(canonicalSize('EUR 40')).toBe('40');
    expect(canonicalSize('eur40')).toBe('40');
    expect(canonicalSize(' 40 ')).toBe('40');
    expect(canonicalSize('EUR 40.5')).toBe('40.5');
  });

  it('leaves other systems and labels alone', () => {
    for (const s of ['UK 8', 'US 9', 'XL', 'One size', 'Medium', '32W']) expect(canonicalSize(s)).toBe(s);
  });

  it('lists every spelling to match, so a filter finds products stored either way', () => {
    expect(sizeSpellings('40')).toEqual(['40', 'EUR 40', 'EUR40']);
    expect(sizeSpellings('EUR 40')).toEqual(['40', 'EUR 40', 'EUR40']);
    expect(sizeSpellings('UK 8')).toEqual(['UK 8']);
  });

  it('merges the two spellings into one chip and sorts numerically', () => {
    const raw = ['38', '39', '40', 'EUR 36', 'EUR 37', 'EUR 38', 'EUR 40', 'EUR 46', 'S', 'M', 'UK 8'];
    expect(distinctSizes(raw)).toEqual(['36', '37', '38', '39', '40', '46', 'M', 'S', 'UK 8']);
  });
});
