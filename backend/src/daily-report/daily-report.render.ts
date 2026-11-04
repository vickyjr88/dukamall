import { formatChange, formatMoney } from './daily-report.metrics';
import type { DailyReport } from './daily-report.types';

const INK = '#1a1a1a';
const MUTED = '#777';
const LINE = '#e6e6e6';
const GOOD = '#0f7a40';
const BAD = '#b3261e';

function esc(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const money = (r: DailyReport, amount: number) => esc(formatMoney(amount, r.currency));

function changeColour(change: number | null) {
  if (change === null || Math.round(change) === 0) return MUTED;
  return change > 0 ? GOOD : BAD;
}

function h3(text: string) {
  return `<h3 style="font-size:15px;margin:26px 0 8px;padding-top:14px;border-top:1px solid ${LINE};">${esc(text)}</h3>`;
}

function table(rows: string[][], header?: string[]) {
  const head = header
    ? `<tr>${header.map((h, i) => `<td style="padding:4px 0;font-size:12px;color:${MUTED};${i > 0 ? 'text-align:right;' : ''}">${esc(h)}</td>`).join('')}</tr>`
    : '';
  const body = rows
    .map((r) => `<tr>${r.map((v, i) => `<td style="padding:6px 0;border-bottom:1px solid ${LINE};font-size:14px;${i > 0 ? 'text-align:right;' : ''}">${v}</td>`).join('')}</tr>`)
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${head}${body}</table>`;
}

function kpi(label: string, value: string, sub = '', subColour = MUTED) {
  return `<td style="width:50%;padding:0 8px 12px 0;vertical-align:top;">
    <div style="font-size:12px;color:${MUTED};">${esc(label)}</div>
    <div style="font-size:21px;font-weight:700;color:${INK};">${esc(value)}</div>
    ${sub ? `<div style="font-size:12px;color:${subColour};">${esc(sub)}</div>` : ''}
  </td>`;
}

export function reportSubject(r: DailyReport) {
  const t = r.today;
  const sales = t.paidOrders === 0 ? 'no paid orders' : `${formatMoney(t.revenue, r.currency)} from ${t.paidOrders} order${t.paidOrders === 1 ? '' : 's'}`;
  return `${r.shopName} daily report, ${r.label}: ${sales}`;
}

export function needsActionCount(r: DailyReport) {
  return r.needsAction.awaitingShipment.count + r.needsAction.unpaidOver24h.count;
}

const age = (o: { orderNumber: string; ageHours: number }) => `${esc(o.orderNumber)} (${Math.round(o.ageHours)}h)`;

export function renderEmail(r: DailyReport): { subject: string; html: string } {
  const t = r.today;
  const parts: string[] = [];

  parts.push(`<h2 style="font-size:19px;margin:0 0 14px;">${esc(r.label)}</h2>`);
  parts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr>${kpi('Revenue (paid that day)', formatMoney(t.revenue, r.currency), `${formatChange(r.vsPreviousDay.revenueChange)} vs day before, ${formatChange(r.vsLastWeek.revenueChange)} vs last ${r.label.split(' ')[0]}`, changeColour(r.vsPreviousDay.revenueChange))}${kpi('Paid orders', String(t.paidOrders), `${t.placed} placed that day`)}</tr>
    <tr>${kpi('Items sold', String(t.items))}${kpi('Average order', t.paidOrders ? formatMoney(t.averageOrder, r.currency) : '-')}</tr>
    <tr>${kpi('Unpaid / cancelled', `${t.unpaid} / ${t.cancelled}`, 'placed that day')}${kpi('Discounts given', t.discountedOrders ? formatMoney(t.discounts, r.currency) : '-', t.discountedOrders ? `${t.discountedOrders} order${t.discountedOrders === 1 ? '' : 's'}` : '')}</tr>
  </table>`);

  if (t.placed === 0 && t.paidOrders === 0) {
    parts.push(`<p style="color:${MUTED};">No orders were placed or paid. If that is not expected, check that the shop and checkout are working.</p>`);
  }

  const a = r.needsAction;
  if (needsActionCount(r) > 0) {
    const items: string[] = [];
    if (a.awaitingShipment.count) items.push(`<li><strong>${a.awaitingShipment.count}</strong> paid order${a.awaitingShipment.count === 1 ? '' : 's'} not shipped yet. Oldest: ${a.awaitingShipment.oldest.map(age).join(', ')}</li>`);
    if (a.unpaidOver24h.count) items.push(`<li><strong>${a.unpaidOver24h.count}</strong> order${a.unpaidOver24h.count === 1 ? '' : 's'} unpaid for over 24 hours (${money(r, a.unpaidOver24h.value)}). Oldest: ${a.unpaidOver24h.oldest.map(age).join(', ')}</li>`);
    parts.push(h3('Needs your attention'), `<ul style="margin:0;padding-left:20px;font-size:14px;">${items.join('')}</ul>`);
  }

  if (r.orders.length) {
    parts.push(
      h3('Orders placed'),
      table(r.orders.map((o) => [`${esc(o.orderNumber)}<br><span style="color:${MUTED};font-size:12px;">${esc(o.customer)} &middot; ${esc(o.source)} &middot; ${esc(o.method)}</span>`, esc(o.status), money(r, o.total)]), ['Order', 'Status', 'Total']),
      r.ordersOmitted ? `<p style="font-size:12px;color:${MUTED};">and ${r.ordersOmitted} more.</p>` : '',
    );
  }

  if (r.topSellers.length) parts.push(h3('Best sellers'), table(r.topSellers.map((s) => [esc(s.name), `${s.units} sold`, money(r, s.revenue)])));

  if (r.bySource.length > 1 || r.byPayment.length > 1) {
    const rows = [
      ...r.bySource.map((s) => [`${esc(s.name)} <span style="color:${MUTED};font-size:12px;">order source</span>`, `${s.orders}`, money(r, s.revenue)]),
      ...r.byPayment.map((s) => [`${esc(s.name)} <span style="color:${MUTED};font-size:12px;">payment</span>`, `${s.orders}`, money(r, s.revenue)]),
    ];
    parts.push(h3('How orders arrived and were paid'), table(rows));
  }

  if (r.stock.soldOut.length || r.stock.low.length) {
    const rows = [
      ...r.stock.soldOut.map((s) => [esc(s.name), esc(s.sku), 'sold out']),
      ...r.stock.low.map((s) => [esc(s.name), esc(s.sku), `${s.onHand} left`]),
    ];
    parts.push(h3('Restock: sizes that sold and are nearly gone'), table(rows));
  }

  const d = r.demand;
  parts.push(
    h3('Interest and lost sales'),
    table([
      ['Carts left behind', `${d.abandonedCarts}`, d.abandonedValue ? money(r, d.abandonedValue) : '-'],
      ['WhatsApp order requests', `${d.whatsappOrderLeads}`, ''],
      ['New customer accounts', `${d.newCustomers}`, ''],
    ]),
  );

  const c = r.catalogue;
  const notes: string[] = [];
  if (c.missingPhoto) notes.push(`<strong style="color:${BAD};">${c.missingPhoto} live product${c.missingPhoto === 1 ? ' has' : 's have'} no photo and cannot appear in the Meta and TikTok feeds.</strong>`);
  if (c.syncedAwaitingStock) notes.push(`${c.syncedAwaitingStock} product${c.syncedAwaitingStock === 1 ? '' : 's'} copied from Drip Emporium still ${c.syncedAwaitingStock === 1 ? 'has' : 'have'} no stock set, so customers cannot buy ${c.syncedAwaitingStock === 1 ? 'it' : 'them'}.`);
  const otherEmpty = c.noStockAnywhere - c.syncedAwaitingStock;
  if (otherEmpty > 0) notes.push(`${otherEmpty} other live product${otherEmpty === 1 ? ' is' : 's are'} out of stock in every size.`);
  parts.push(h3('Catalogue'), `<p style="font-size:14px;margin:0 0 6px;">${c.activeProducts} products live, ${c.feedItems} sizes in the Meta and TikTok feeds.</p>${notes.map((n) => `<p style="font-size:14px;margin:0 0 6px;">${n}</p>`).join('')}`);

  parts.push(`<p style="font-size:12px;color:${MUTED};margin-top:22px;">Covers ${esc(r.label)} in Nairobi time. Revenue is orders paid that day; unpaid and cancelled orders are left out. To change who receives this, use the daily report settings in the portal.</p>`);

  return { subject: reportSubject(r), html: `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:${INK};">
<p style="font-size:13px;color:#888;text-transform:uppercase;letter-spacing:0.04em;margin:0 0 16px;">${esc(r.shopName)}</p>
${parts.join('\n')}
</div>` };
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * The six values the approved WhatsApp template fills in. Template text:
 *
 *   Daily report for {{1}} ({{2}}): {{3}} paid orders, {{4}} revenue, {{5}} vs the day before. {{6}} need attention. Full report is in your email.
 */
export function whatsappParams(r: DailyReport): string[] {
  const n = needsActionCount(r);
  return [
    oneLine(r.shopName),
    oneLine(r.label),
    String(r.today.paidOrders),
    oneLine(formatMoney(r.today.revenue, r.currency)),
    oneLine(formatChange(r.vsPreviousDay.revenueChange)),
    n === 0 ? 'Nothing' : `${n} item${n === 1 ? '' : 's'}`,
  ];
}
