import { FeedRow } from './product-feed.service';

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

function itemXml(row: FeedRow): string {
  return `
    <item>
      <g:id>${escapeXml(row.id)}</g:id>
      <title>${cdata(row.title)}</title>
      <description>${cdata(row.description)}</description>
      <link>${escapeXml(row.link)}</link>
      <g:image_link>${escapeXml(row.imageLink)}</g:image_link>
      <g:availability>${row.availability}</g:availability>
      <g:price>${row.price}</g:price>
      <g:condition>${row.condition}</g:condition>
      <g:brand>${escapeXml(row.brand)}</g:brand>
      <g:mpn>${escapeXml(row.mpn)}</g:mpn>
      <g:item_group_id>${escapeXml(row.itemGroupId)}</g:item_group_id>
      ${row.productType ? `<g:product_type>${escapeXml(row.productType)}</g:product_type>` : ''}
    </item>`;
}

export function feedXml(shopName: string, origin: string, rows: FeedRow[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${escapeXml(shopName)} Product Feed</title>
    <link>${escapeXml(origin)}</link>
    <description>Product catalogue for ${escapeXml(shopName)}</description>
    ${rows.map(itemXml).join('')}
  </channel>
</rss>`;
}

// [FeedRow key, header name]. The header names are what Meta, Google Merchant
// Center and TikTok match columns on, and they are snake_case -- the same
// names the XML feed already uses as <g:image_link>, <g:item_group_id> and
// <g:product_type>. The CSV used the row's camelCase keys as headers, so a
// platform could not find an image_link column and reported every item as
// having no product image URL, even though each row had one.
export const CSV_COLUMNS: [keyof FeedRow, string][] = [
  ['id', 'id'],
  ['title', 'title'],
  ['description', 'description'],
  ['link', 'link'],
  ['imageLink', 'image_link'],
  ['availability', 'availability'],
  ['price', 'price'],
  ['condition', 'condition'],
  ['brand', 'brand'],
  ['mpn', 'mpn'],
  ['itemGroupId', 'item_group_id'],
  ['productType', 'product_type'],
];

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function feedCsv(rows: FeedRow[]): string {
  const header = CSV_COLUMNS.map(([, name]) => name).join(',');
  const lines = rows.map((row) => CSV_COLUMNS.map(([key]) => csvCell(String(row[key] ?? ''))).join(','));
  return [header, ...lines].join('\n');
}
