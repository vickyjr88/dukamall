import { BadRequestException } from '@nestjs/common';
import { AXIS_ORDER, Section, axisLabel } from './sections';

/**
 * What a variant is made of: a set of named options ({ storage: "128GB", colour: "Black", condition: "New" }). Each
 * combination is its own variant, with its own SKU, price and stock. Pure functions, so the rules are tested without a
 * database and used the same way by the portal and the storefront.
 */

export type Attributes = Record<string, string>;

const KEY = /^[a-z][a-z0-9]{0,19}$/;
const MAX_VALUE = 40;
const MAX_KEYS = 6;

/** Clean what a client sent: known shape, trimmed, no empty values. When the product's section is known, its required options must be there. */
export function cleanAttributes(raw: unknown, section?: Section): Attributes {
  const out: Attributes = {};
  if (raw !== undefined && raw !== null) {
    if (typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('Options must be a set of names and values.');
    const entries = Object.entries(raw as Record<string, unknown>);
    if (entries.length > MAX_KEYS) throw new BadRequestException(`A product can have up to ${MAX_KEYS} kinds of option.`);
    for (const [key, value] of entries) {
      if (!KEY.test(key)) throw new BadRequestException(`"${key}" is not a valid option name.`);
      if (value === undefined || value === null || String(value).trim() === '') continue;
      const text = String(value).trim();
      if (text.length > MAX_VALUE) throw new BadRequestException(`${axisLabel(key)} can be up to ${MAX_VALUE} characters.`);
      out[key] = text;
    }
  }
  if (section) {
    for (const axis of section.axes) {
      if (axis.required && !out[axis.key]) throw new BadRequestException(`${axis.label} is required for ${section.noun}.`);
    }
  }
  return out;
}

/** The label of one variant, options in their usual order: "128GB / Black / New". */
export function variantLabel(attributes: Attributes | null | undefined, size?: string | null): string {
  const values = optionEntries(attributes).map(([, value]) => value);
  if (values.length) return values.join(' / ');
  return size?.trim() ?? '';
}

/** The options of a variant, in display order. */
export function optionEntries(attributes: Attributes | null | undefined): Array<[string, string]> {
  const entries = Object.entries(attributes ?? {}).filter(([, v]) => typeof v === 'string' && v.trim());
  const rank = (key: string) => {
    const i = AXIS_ORDER.indexOf(key);
    return i === -1 ? AXIS_ORDER.length : i;
  };
  return entries.map((e, i) => ({ e, i })).sort((a, b) => rank(a.e[0]) - rank(b.e[0]) || a.i - b.i).map((x) => x.e);
}

/**
 * The `size` column mirrors a "size" option, so everything that already reads sizes (the size filter, size labels, the
 * product feed) keeps working for a shirt entered the new way.
 */
export function sizeFrom(attributes: Attributes, explicitSize?: string | null): string | null {
  return attributes.size ?? (explicitSize?.trim() || null);
}

export type OptionGroup = { key: string; label: string; values: string[] };

/**
 * The choices to show on a product page: one group per kind of option that any of its variants has, each with its values
 * in the order they first appear (the order the merchant entered them). A product with no options at all has no groups,
 * and the page falls back to its plain size picker.
 */
export function optionGroups(variants: Array<{ attributes?: unknown }>): OptionGroup[] {
  const seen = new Map<string, string[]>();
  for (const variant of variants) {
    for (const [key, value] of optionEntries(variant.attributes as Attributes | null)) {
      const values = seen.get(key) ?? [];
      if (!values.includes(value)) values.push(value);
      seen.set(key, values);
    }
  }
  return Array.from(seen.entries())
    .sort((a, b) => {
      const ra = AXIS_ORDER.indexOf(a[0]); const rb = AXIS_ORDER.indexOf(b[0]);
      return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
    })
    .map(([key, values]) => ({ key, label: axisLabel(key), values }));
}

export type Condition = 'new' | 'refurbished' | 'used';

/** "New", "Refurbished", "Used" (and common spellings) as the three conditions a shopping feed understands; null when none is stated. */
export function conditionOf(attributes: Attributes | null | undefined): Condition | null {
  const raw = (attributes?.condition ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (/^(brand )?new|sealed|boxed/.test(raw)) return 'new';
  if (/refurb|renew|reconditioned|certified/.test(raw)) return 'refurbished';
  if (/used|second|pre-?owned|ex-?uk|open box/.test(raw)) return 'used';
  return null;
}

export type Spec = { label: string; value: string };

/** Specifications from a client: trimmed, blank rows dropped, bounded. */
export function cleanSpecs(raw: unknown): Spec[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new BadRequestException('Specifications must be a list.');
  if (raw.length > 30) throw new BadRequestException('A product can have up to 30 specifications.');
  const out: Spec[] = [];
  for (const row of raw) {
    const label = String((row as any)?.label ?? '').trim();
    const value = String((row as any)?.value ?? '').trim();
    if (!label && !value) continue;
    if (!label || !value) throw new BadRequestException('Each specification needs both a name and a value.');
    if (label.length > 40 || value.length > 200) throw new BadRequestException('A specification name can be up to 40 characters and its value up to 200.');
    out.push({ label, value });
  }
  return out;
}
