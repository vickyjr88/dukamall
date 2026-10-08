// Plain, inline-styled HTML -- no template engine or MJML, since this
// platform sends a handful of short emails and a template engine would be more
// ceremony than the content justifies. Each function returns {subject, html}
// for EmailService.send to use directly.
//
// EVERY dynamic value goes through esc(). Several of these come straight from
// customers (a name typed at checkout, a custom size) and the order
// confirmation is sent to whatever address they entered, so an unescaped value
// would let anyone have the platform send an HTML email -- a link included --
// from the shop's address to any inbox. URLs are escaped too, as attribute
// values.

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapper(shopName: string, bodyHtml: string): string {
  return `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <p style="font-size: 13px; color: #888; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 20px;">${esc(shopName)}</p>
      ${bodyHtml}
    </div>
  `;
}

const money = (currency: string, amount: number) => `${esc(currency)} ${amount.toLocaleString()}`;

export function orderConfirmationEmail(params: {
  shopName: string;
  orderNumber: string;
  firstName: string;
  lines: { name: string; variantName: string; quantity: number; priceKes: number }[];
  subtotalKes: number;
  discountKes: number;
  shippingKes?: number;
  totalKes: number;
  currency: string;
}) {
  const { shopName, orderNumber, firstName, lines, subtotalKes, discountKes, shippingKes = 0, totalKes, currency } = params;
  const rows = lines
    .map((l) => `<tr><td style="padding:6px 0;">${l.quantity} &times; ${esc(l.name)} (${esc(l.variantName)})</td><td style="padding:6px 0; text-align:right;">${money(currency, l.priceKes * l.quantity)}</td></tr>`)
    .join('');
  const discountRow = discountKes > 0
    ? `<tr><td style="padding:6px 0; color:#0f7a40;">Discount</td><td style="padding:6px 0; text-align:right; color:#0f7a40;">-${money(currency, discountKes)}</td></tr>`
    : '';
  const shippingRow = shippingKes > 0
    ? `<tr><td style="padding:6px 0;">Delivery</td><td style="padding:6px 0; text-align:right;">${money(currency, shippingKes)}</td></tr>`
    : '';
  return {
    subject: `Order ${orderNumber} confirmed`,
    html: wrapper(shopName, `
      <h2 style="margin: 0 0 8px;">Thanks, ${esc(firstName)}!</h2>
      <p style="color:#555; margin: 0 0 20px;">Your order <strong>${esc(orderNumber)}</strong> has been received.</p>
      <table style="width:100%; border-collapse:collapse; font-size:14px;">
        ${rows}
        <tr><td style="padding:6px 0; border-top:1px solid #eee;">Subtotal</td><td style="padding:6px 0; text-align:right; border-top:1px solid #eee;">${money(currency, subtotalKes)}</td></tr>
        ${discountRow}
        ${shippingRow}
        <tr><td style="padding:6px 0; font-weight:700;">Total</td><td style="padding:6px 0; text-align:right; font-weight:700;">${money(currency, totalKes)}</td></tr>
      </table>
    `),
  };
}

export function staffInviteEmail(params: { shopName: string; firstName: string; email: string; temporaryPassword: string; portalUrl: string }) {
  const { shopName, firstName, email, temporaryPassword, portalUrl } = params;
  return {
    subject: `You've been added to ${shopName}`,
    html: wrapper(shopName, `
      <h2 style="margin: 0 0 8px;">Welcome, ${esc(firstName)}</h2>
      <p style="color:#555;">You now have access to the ${esc(shopName)} merchant portal.</p>
      <p style="margin: 16px 0; padding: 12px 16px; background:#f5f5f5; border-radius:6px;">
        <strong>Email:</strong> ${esc(email)}<br/>
        <strong>Temporary password:</strong> ${esc(temporaryPassword)}
      </p>
      <p style="color:#555;">Please log in and change your password as soon as possible.</p>
      <p><a href="${esc(portalUrl)}" style="color:#2438a8;">Log in to the portal &rarr;</a></p>
    `),
  };
}

export function passwordResetEmail(params: { shopName: string; resetUrl: string }) {
  const { shopName, resetUrl } = params;
  return {
    subject: 'Reset your password',
    html: wrapper(shopName, `
      <h2 style="margin: 0 0 8px;">Reset your password</h2>
      <p style="color:#555;">Click the link below to set a new password. This link expires in 1 hour and can only be used once.</p>
      <p><a href="${esc(resetUrl)}" style="color:#2438a8;">Reset password &rarr;</a></p>
      <p style="color:#999; font-size:13px; margin-top:20px;">If you didn't request this, you can safely ignore this email.</p>
    `),
  };
}

export function newOrderAlertEmail(params: {
  shopName: string; orderNumber: string; customerName: string; phone: string | null; currency: string;
  totalKes: number; itemCount: number; paid: boolean; portalUrl: string;
}) {
  const { shopName, orderNumber, customerName, phone, currency, totalKes, itemCount, paid, portalUrl } = params;
  return {
    subject: `New order ${orderNumber} - ${currency} ${totalKes.toLocaleString()}`,
    html: wrapper(shopName, `
      <h2 style="margin: 0 0 8px;">New order ${esc(orderNumber)}</h2>
      <p style="color:#555; margin: 0 0 16px;">${esc(customerName)}${phone ? ` &middot; ${esc(phone)}` : ''}<br/>
        ${itemCount} item${itemCount === 1 ? '' : 's'} &middot; <strong>${money(currency, totalKes)}</strong> &middot; ${paid ? 'paid' : 'not paid yet'}</p>
      <p><a href="${esc(portalUrl)}" style="color:#2438a8;">Open the order &rarr;</a></p>
    `),
  };
}

export function newLeadAlertEmail(params: {
  shopName: string; customerName: string | null; phone: string | null; items: string[]; portalUrl: string;
}) {
  const { shopName, customerName, phone, items, portalUrl } = params;
  return {
    subject: `New WhatsApp order enquiry${customerName ? ` from ${customerName.replace(/[\r\n]+/g, ' ')}` : ''}`,
    html: wrapper(shopName, `
      <h2 style="margin: 0 0 8px;">Someone is ordering on WhatsApp</h2>
      <p style="color:#555; margin: 0 0 16px;">${esc(customerName ?? 'A customer')}${phone ? ` &middot; ${esc(phone)}` : ''}<br/>${items.map(esc).join('<br/>')}</p>
      <p style="color:#888; font-size:13px;">They may not have sent the message yet. It shows under Leads either way.</p>
      <p><a href="${esc(portalUrl)}" style="color:#2438a8;">Open Leads &rarr;</a></p>
    `),
  };
}
