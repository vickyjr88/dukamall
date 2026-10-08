import type { ReactNode } from 'react';

/**
 * Renders the small markdown subset merchants write content pages in:
 *   ## headings (### for a smaller one; a single # is treated like ##), "- " bullets, "1. " numbered items, blank line = new
 *   paragraph, **bold**, and [text](link).
 *
 * It builds React elements directly and never touches raw HTML, so whatever a
 * merchant (or someone who got hold of their login) types can't inject script
 * into the storefront. Links are limited to http(s), mailto, tel and paths on
 * the same site -- no javascript: URLs.
 */

const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/(?!\/))/i;

function renderInline(text: string, key: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Links first, then bold inside what's left; neither nests into the other.
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      const href = match[2];
      nodes.push(
        SAFE_HREF.test(href)
          ? <a key={`${key}-${i}`} href={href} {...(/^https?:/i.test(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{match[1]}</a>
          : match[1],
      );
    } else {
      nodes.push(<strong key={`${key}-${i}`}>{match[3]}</strong>);
    }
    last = match.index + match[0].length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

type Block =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'p'; lines: string[] };

function parse(source: string): Block[] {
  const blocks: Block[] = [];
  for (const rawLine of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const tail = blocks[blocks.length - 1];

    if (!line.trim()) {
      // A blank line ends the current paragraph/list.
      blocks.push({ kind: 'p', lines: [] });
    } else if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length <= 2 ? 2 : 3, text: heading[2] });
    } else if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol';
      const text = (bullet ?? numbered)![1];
      if (tail && tail.kind === kind) tail.items.push(text);
      else blocks.push({ kind, items: [text] });
    } else if (tail && tail.kind === 'p') {
      tail.lines.push(line);
    } else {
      blocks.push({ kind: 'p', lines: [line] });
    }
  }
  return blocks.filter((b) => b.kind !== 'p' || b.lines.length > 0);
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = parse(text);
  return (
    <div className={className ?? 'shop-prose'}>
      {blocks.map((block, index) => {
        const key = `b${index}`;
        switch (block.kind) {
          case 'heading': {
            const Tag = block.level === 2 ? 'h2' : 'h3';
            return <Tag key={key}>{renderInline(block.text, key)}</Tag>;
          }
          case 'ul':
          case 'ol': {
            const Tag = block.kind;
            return <Tag key={key}>{block.items.map((item, i) => <li key={i}>{renderInline(item, `${key}-${i}`)}</li>)}</Tag>;
          }
          default:
            return (
              <p key={key}>
                {block.lines.map((line, i) => (
                  <span key={i}>{i > 0 ? <br /> : null}{renderInline(line, `${key}-${i}`)}</span>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}

/** The text of a page with the markdown syntax removed -- for meta descriptions and previews. */
export function plainText(source: string): string {
  return source
    .replace(/\r\n?/g, '\n')
    .replace(/\[([^\]]+)\]\([^)\s]*\)?/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^\s*(#{1,3}\s+|[-*]\s+|\d+[.)]\s+)/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}
