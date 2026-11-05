/**
 * Sections: the kinds of thing a shop on this platform can sell. The platform serves many merchants, and a phone shop, a
 * watch seller and a clothes boutique do not describe a product the same way: shoes and clothes come in sizes, a phone in
 * storage, colour and condition, a watch usually in nothing at all.
 *
 * A section says, for a category and every product in it:
 *  - which OPTIONS its products come in (each combination is a variant with its own price and stock),
 *  - which SPECIFICATIONS are worth listing (suggested labels, never required),
 *  - which CATEGORIES to start a shop with.
 *
 * A shop switches sections on (at sign-up, or in the portal under Sections); a category belongs to one section. Nothing
 * here is stored: the catalogue is code, so every shop gets improvements to it, and what a shop stores is only the keys.
 */

export type SectionAxis = {
  /** The key stored on each variant's `attributes`, e.g. "storage". Lower case letters and digits. */
  key: string;
  /** What shoppers and staff see: "Storage". */
  label: string;
  /** True when a product in this section cannot be ordered without a value (a shirt needs a size). */
  required: boolean;
  /** One-click suggestions in the product form; staff can type anything. */
  presets: string[];
  /** Shown beside the field in the product form. */
  hint?: string;
};

export type Section = {
  key: string;
  label: string;
  /** One line for the sign-up and Sections screens. */
  tagline: string;
  /** What to call one in a sentence ("a watch"), for messages. */
  noun: string;
  axes: SectionAxis[];
  /** Suggested specification labels for a product's table. */
  specs: string[];
  /** Categories created when the shop switches the section on. */
  categories: string[];
  /** Google Merchant product category, for the product feed. */
  googleCategory: string;
};

const SIZE_CLOTHES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const SIZE_SHOES = Array.from({ length: 11 }, (_, i) => `EUR ${36 + i}`);

export const SECTIONS: Section[] = [
  {
    key: 'footwear',
    label: 'Shoes',
    tagline: 'Sneakers, boots, sandals and other footwear, sold by size.',
    noun: 'a pair of shoes',
    axes: [{ key: 'size', label: 'Size', required: true, presets: SIZE_SHOES }],
    specs: ['Material', 'Sole', 'Closure'],
    categories: ['Sneakers', 'Boots', 'Sandals', 'Casual shoes', 'Official shoes'],
    googleCategory: 'Apparel & Accessories > Shoes',
  },
  {
    key: 'clothes',
    label: 'Clothes',
    tagline: 'T-shirts, trousers, dresses and jackets, by size and colour.',
    noun: 'a garment',
    axes: [
      { key: 'size', label: 'Size', required: true, presets: SIZE_CLOTHES },
      { key: 'colour', label: 'Colour', required: false, presets: ['Black', 'White', 'Grey', 'Navy', 'Red', 'Green', 'Blue', 'Beige'] },
    ],
    specs: ['Material', 'Fit', 'Care'],
    categories: ['T-shirts', 'Shirts', 'Trousers and jeans', 'Dresses and skirts', 'Jackets and hoodies', 'Shorts', 'Underwear and socks', 'Kids wear'],
    googleCategory: 'Apparel & Accessories > Clothing',
  },
  {
    key: 'watches',
    label: 'Watches',
    tagline: 'Watches and straps. A watch has no size: only list a choice (such as a strap colour) if there really is one.',
    noun: 'a watch',
    axes: [{ key: 'choice', label: 'Choice', required: false, presets: ['Black strap', 'Brown strap', 'Silver', 'Gold'], hint: 'Only if the model comes in versions, such as a strap or dial colour.' }],
    specs: ['Movement', 'Case size', 'Strap material', 'Water resistance'],
    categories: ['Mens watches', 'Womens watches', 'Smartwatches', 'Watch straps and accessories'],
    googleCategory: 'Apparel & Accessories > Jewelry > Watches',
  },
  {
    key: 'electronics',
    label: 'Electronics',
    tagline: 'TVs, laptops, audio and appliances.',
    noun: 'an electronic product',
    axes: [{ key: 'option', label: 'Option', required: false, presets: [], hint: 'Only if it comes in versions, such as a screen size or a colour.' }],
    specs: ['Model number', 'Power', 'Dimensions', 'Warranty'],
    categories: ['TVs and screens', 'Laptops and computers', 'Audio and speakers', 'Cameras', 'Home appliances', 'Kitchen appliances', 'Gaming'],
    googleCategory: 'Electronics',
  },
  {
    key: 'devices',
    label: 'Devices and accessories',
    tagline: 'Phones, tablets and the accessories that go with them. Storage, colour and condition are separate choices with their own price and stock.',
    noun: 'a device',
    axes: [
      { key: 'storage', label: 'Storage', required: false, presets: ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB'], hint: 'Phones and tablets. Leave empty for an accessory.' },
      { key: 'colour', label: 'Colour', required: false, presets: ['Black', 'White', 'Silver', 'Gold', 'Blue', 'Green', 'Red', 'Purple'] },
      { key: 'condition', label: 'Condition', required: false, presets: ['New', 'Refurbished', 'Used'], hint: 'Say so if you sell anything that is not new: it is shown to shoppers and in your product feed.' },
    ],
    specs: ['Display', 'Processor', 'RAM', 'Camera', 'Battery', 'Operating system', 'Network', 'SIM', 'Warranty'],
    categories: ['Phones', 'Tablets', 'Phone cases and covers', 'Screen protectors', 'Chargers and cables', 'Power banks', 'Earphones and headphones', 'Smartwatches and bands', 'Speakers', 'Memory cards and storage'],
    googleCategory: 'Electronics > Communications > Telephony > Mobile Phones',
  },
];

export const SECTION_KEYS = SECTIONS.map((s) => s.key);
export const sectionByKey = (key: string | null | undefined): Section | undefined => SECTIONS.find((s) => s.key === key);

/** The order option groups are shown in, whatever order a variant stored them. Unknown keys follow, as they appeared. */
export const AXIS_ORDER = ['size', 'storage', 'colour', 'condition', 'choice', 'option'];

const LABELS: Record<string, string> = Object.fromEntries(SECTIONS.flatMap((s) => s.axes.map((a) => [a.key, a.label])));
export const axisLabel = (key: string): string => LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);

export const slugOf = (name: string) =>
  name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
