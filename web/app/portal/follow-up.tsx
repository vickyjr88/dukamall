"use client";

/**
 * "Follow up on WhatsApp": opens the customer's chat with a message already written, listing what was in the cart or order
 * with a link to each product. Nothing is sent from here: the message opens in WhatsApp for the merchant to read, change if
 * they like, and send themselves.
 *
 * The message itself is built on the server (backend/src/common/follow-up.ts), which knows the shop's name and storefront
 * address, so the links are the real ones and the wording is the same wherever the button appears.
 */

export type FollowUp = { phone: string; message: string; url: string };

export function FollowUpButton({ followUp, onOpened, children, solid }: { followUp: FollowUp | null | undefined; onOpened?: () => void; children?: React.ReactNode; solid?: boolean }) {
  if (!followUp) return null;
  return (
    <a
      href={followUp.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${solid ? '' : 'portal-btn-outline '}portal-btn portal-btn-sm`}
      onClick={() => onOpened?.()}
      title="Opens WhatsApp with the message ready. You press send."
    >
      {children ?? 'Follow up on WhatsApp'}
    </a>
  );
}

/** What will be sent, shown before it is: the merchant can see exactly what the customer is about to read. */
export function FollowUpPreview({ followUp }: { followUp: FollowUp | null | undefined }) {
  if (!followUp) return null;
  return (
    <details style={{ marginTop: 10 }}>
      <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--p-muted)' }}>See the message</summary>
      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '8px 0 0', padding: 12, borderRadius: 8, background: 'rgba(0,0,0,0.04)', fontSize: 14 }}>{followUp.message}</pre>
      <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--p-muted)' }}>To +{followUp.phone}. You can change it in WhatsApp before sending.</p>
    </details>
  );
}
