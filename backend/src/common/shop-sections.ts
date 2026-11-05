import { Prisma } from '@prisma/client';
import { SECTION_KEYS, sectionByKey, slugOf } from './sections';

/**
 * Switching a section on for a shop: remember it on the shop, and create its starter categories (never twice, never over
 * what the shop already has). Used by sign-up and by the portal's Sections screen, so a shop made either way is the same.
 */

/** Section keys from a client: known ones only, no repeats, in a stable order. */
export function cleanSectionKeys(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  return SECTION_KEYS.filter((key) => list.includes(key));
}

/**
 * Creates the starter categories of `sectionKey` that the shop does not have, and files an existing category of the same
 * name (made by hand before) under the section so its products pick up the section's options. A category already filed
 * under another section is left alone. Returns what happened, for the screen to say.
 */
export async function ensureSectionCategories(
  db: Prisma.TransactionClient,
  shopId: string,
  sectionKey: string,
  only?: string[],
): Promise<{ created: string[]; adopted: string[] }> {
  const section = sectionByKey(sectionKey);
  if (!section) return { created: [], adopted: [] };
  const names = only ? section.categories.filter((n) => only.includes(n)) : section.categories;
  const created: string[] = [];
  const adopted: string[] = [];
  for (const name of names) {
    const slug = slugOf(name);
    const existing = await db.productCategory.findUnique({ where: { shopId_slug: { shopId, slug } } });
    if (!existing) {
      await db.productCategory.create({ data: { shopId, name, slug, section: sectionKey } });
      created.push(name);
    } else if (!existing.section) {
      await db.productCategory.update({ where: { id: existing.id }, data: { section: sectionKey } });
      adopted.push(name);
    }
  }
  return { created, adopted };
}
