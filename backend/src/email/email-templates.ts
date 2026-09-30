// Plain, inline-styled HTML -- no template engine or MJML, since this
// platform sends exactly three kinds of email and each is short enough
// that a template engine would be more ceremony than the content justifies.
// Each function returns {subject, html} for EmailService.send to use directly.

function wrapper(shopName: string, bodyHtml: string): string {
  return `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <p style="font-size: 13px; color: #888; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 20px;">${shopName}</p>
      ${bodyHtml}
    </div>
  `;
}

export function orderConfirmationEmail(params: {
  shopName: string;
  orderNumber: string;
  firstName: string;
  lines: { name: string; variantName: string; quantity: number; priceKes: number }[];
  subtotalKes: number;
  discountKes: number;
  totalKes: number;
  currency: string;
}) {
  const { shopName, orderNumber, firstName, lines, subtotalKes, discountKes, totalKes, currency } = params;
  const rows = lines
    .map((l) => `<tr><td style="padding:6px 0;">${l.quantity} &times; ${l.name} (${l.variantName})</td><td style="padding:6px 0; text-align:right;">${currency} ${(l.priceKes * l.quantity).toLocaleString()}</td></tr>`)
    .join('');
  const discountRow = discountKes > 0
    ? `<tr><td style="padding:6px 0; color:#0f7a40;">Discount</td><td style="padding:6px 0; text-align:right; color:#0f7a40;">-${currency} ${discountKes.toLocaleString()}</td></tr>`
    : '';
  return {
    subject: `Order ${orderNumber} confirmed`,
    html: wrapper(shopName, `
      <h2 style="margin: 0 0 8px;">Thanks, ${firstName}!</h2>
      <p style="color:#555; margin: 0 0 20px;">Your order <strong>${orderNumber}</strong> has been received.</p>
      <table style="width:100%; border-collapse:collapse; font-size:14px;">
        ${rows}
        <tr><td style="padding:6px 0; border-top:1px solid #eee;">Subtotal</td><td style="padding:6px 0; text-align:right; border-top:1px solid #eee;">${currency} ${subtotalKes.toLocaleString()}</td></tr>
        ${discountRow}
        <tr><td style="padding:6px 0; font-weight:700;">Total</td><td style="padding:6px 0; text-align:right; font-weight:700;">${currency} ${totalKes.toLocaleString()}</td></tr>
      </table>
    `),
  };
}

export function staffInviteEmail(params: { shopName: string; firstName: string; email: string; temporaryPassword: string; portalUrl: string }) {
  const { shopName, firstName, email, temporaryPassword, portalUrl } = params;
  return {
    subject: `You've been added to ${shopName}`,
    html: wrapper(shopName, `
      <h2 style="margin: 0 0 8px;">Welcome, ${firstName}</h2>
      <p style="color:#555;">You now have access to the ${shopName} merchant portal.</p>
      <p style="margin: 16px 0; padding: 12px 16px; background:#f5f5f5; border-radius:6px;">
        <strong>Email:</strong> ${email}<br/>
        <strong>Temporary password:</strong> ${temporaryPassword}
      </p>
      <p style="color:#555;">Please log in and change your password as soon as possible.</p>
      <p><a href="${portalUrl}" style="color:#2438a8;">Log in to the portal &rarr;</a></p>
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
      <p><a href="${resetUrl}" style="color:#2438a8;">Reset password &rarr;</a></p>
      <p style="color:#999; font-size:13px; margin-top:20px;">If you didn't request this, you can safely ignore this email.</p>
    `),
  };
}
