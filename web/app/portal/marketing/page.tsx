"use client";

/**
 * Marketing: every way this shop reaches customers, in one place: what is on, what went out this week, what needs a person, and the tools a person
 * uses by hand (the daily WhatsApp Status, Share, QR codes). Read-only: each card opens the page where the thing is set up or done.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { portalFetch } from '../portal-api';
import { useSession } from '../portal-session';

type Tally = { posted: number; failed: number; topFailure: string | null };
type Hub = {
  shop: { name: string; origin: string; whatsappNumber: string | null; groupUrl: string | null };
  connections: { whatsapp: boolean; facebook: boolean; threads: boolean };
  features: { welcomeSeries: boolean; commentReplies: boolean; postFacebook: boolean; postThreads: boolean };
  postingAllowed: boolean;
  week: {
    whatsapp: { sent: number; failed: number; delivered: number; newPeople: number; optOuts: number };
    comments: { sent: number; failed: number; skipped: number };
    posts: { facebook: Tally; threads: Tally };
    status: { prepared: number; posted: number };
  };
  attention: { key: string; severity: 'problem' | 'warn'; text: string }[];
  shares: { total: number; people: number; visitsFromShares: number; byChannel: { channel: string; count: number }[] };
  catalogue: { shareable: number; noPhoto: number };
  pixels: { meta: boolean; tiktok: boolean; x: boolean };
  feeds: { name: string; url: string }[];
};

type State = 'on' | 'off' | 'setup';
const STATE_LABEL: Record<State, string> = { on: 'On', off: 'Off', setup: 'Needs setup' };

function Tool({ href, title, state, children, stat }: { href: string; title: string; state?: State; children: React.ReactNode; stat?: string }) {
  return (
    <Link href={href} className="mk-card">
      <div className="mk-card-head"><strong>{title}</strong>{state ? <span className={`mk-state is-${state}`}>{STATE_LABEL[state]}</span> : null}</div>
      <p>{children}</p>
      {stat ? <div className="mk-stat">{stat}</div> : null}
      <span className="mk-open">Open &rarr;</span>
    </Link>
  );
}

export default function MarketingPage() {
  const { ready, isOwner } = useSession();
  const [hub, setHub] = useState<Hub | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    portalFetch('/portal/marketing/hub').then((r) => (r.ok ? r.json() : Promise.reject())).then(setHub).catch(() => setError(true));
  }, [ready]);

  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); setCopied(url); window.setTimeout(() => setCopied(null), 2500); } catch { /* the address is shown, it can be copied by hand */ }
  }

  if (error) return <div className="portal-alert is-error">Could not load Marketing. Try again in a moment.</div>;
  if (!hub) return <p>Loading...</p>;

  const wa = hub.week.whatsapp;
  const posted = hub.week.posts.facebook.posted + hub.week.posts.threads.posted;
  const waState: State = !hub.connections.whatsapp ? 'setup' : hub.features.welcomeSeries ? 'on' : 'off';
  const fbState: State = !hub.connections.facebook ? 'setup' : hub.features.commentReplies ? 'on' : 'off';
  const postState: State = !hub.connections.facebook && !hub.connections.threads ? 'setup' : (hub.features.postFacebook || hub.features.postThreads) && hub.postingAllowed ? 'on' : 'off';

  return (
    <div>
      <div className="portal-page-head">
        <h3>Marketing</h3>
        <p style={{ fontSize: 13, color: 'var(--p-muted)' }}>Reach customers every day. Start with the two things you do by hand, which take five minutes and need no setup.</p>
      </div>

      {hub.attention.length > 0 ? (
        <div className="portal-card" style={{ marginBottom: 16 }}>
          <h4>Needs a look</h4>
          <ul className="mk-attn">
            {hub.attention.map((a) => <li key={a.key} className={`is-${a.severity}`}>{a.text}</li>)}
          </ul>
          {isOwner ? <Link href="/portal/integrations" className="portal-btn portal-btn-sm portal-btn-outline">Open connections</Link> : null}
        </div>
      ) : null}

      <h4 className="mk-h">Do it by hand, every day</h4>
      <div className="mk-grid">
        <Tool href="/portal/status-kit" title="WhatsApp Status" stat={hub.week.status.prepared ? `${hub.week.status.posted} of ${hub.week.status.prepared} posted this week` : 'Ready-made pictures, made fresh each day'}>
          Three ready 9:16 pictures a day in your shop&apos;s colours, with the caption. Share to your Status in ten seconds. Most customers see it before they see anything else you do.
        </Tool>
        <Tool href="/portal/share" title="Share products" stat={hub.shares.total ? `${hub.shares.total} share${hub.shares.total === 1 ? '' : 's'} this week${hub.shares.visitsFromShares ? `, ${hub.shares.visitsFromShares} visit${hub.shares.visitsFromShares === 1 ? '' : 's'}` : ''}` : `${hub.catalogue.shareable} products ready to share`}>
          Search a product and send it to WhatsApp chats and groups, Facebook, X or Telegram with a tracked link. Tick several to send a catalogue message.
        </Tool>
        <Tool href="/portal/share?tab=link" title="Link &amp; QR code">
          A tagged link and a printable QR poster for the shop door, the till, parcels and business cards. Analytics counts each by name.
        </Tool>
      </div>

      <h4 className="mk-h">Automatic</h4>
      <div className="mk-grid">
        <Tool href="/portal/whatsapp" title="WhatsApp welcome and follow-up" state={waState} stat={hub.connections.whatsapp ? `${wa.sent} sent, ${wa.delivered} delivered, ${wa.newPeople} new people this week` : undefined}>
          Welcomes people who message you, sends reminders, and keeps a list that respects STOP. Delivered counts what reached phones, not what was accepted.
        </Tool>
        <Tool href="/portal/facebook" title="Page comment replies" state={fbState} stat={hub.connections.facebook ? `${hub.week.comments.sent} answered this week` : undefined}>
          Answers every comment on your Page posts and ads in public, and messages the person privately with the product.
        </Tool>
        <Tool href="/portal/social" title="Posting to Facebook and Threads" state={postState} stat={posted ? `${posted} posted this week` : undefined}>
          Posts your products on a schedule with a photo, price and link. Off until you switch it on.
        </Tool>
        <Tool href="/portal/discounts" title="Discount codes">
          Percent or fixed-amount codes with a minimum order, an expiry and a limit. Put the code in a post, then watch redemptions.
        </Tool>
      </div>

      <h4 className="mk-h">Ads and catalogues</h4>
      <div className="mk-grid">
        <Tool href="/portal/integrations" title="Ad tracking" state={hub.pixels.meta || hub.pixels.tiktok || hub.pixels.x ? 'on' : 'setup'} stat={[hub.pixels.meta && 'Meta', hub.pixels.tiktok && 'TikTok', hub.pixels.x && 'X'].filter(Boolean).join(', ') || undefined}>
          Meta, TikTok and X pixels, so the ads you run learn who buys. Without them, ad platforms are guessing.
        </Tool>
        <Tool href="/portal/analytics" title="Where visits came from">
          See which post, ad or QR code brought visitors and orders, with your ad spend set against them.
        </Tool>
      </div>

      <div className="portal-card" style={{ marginTop: 16 }}>
        <h4>Product catalogues for ad platforms</h4>
        <p style={{ fontSize: 13, color: 'var(--p-muted)', marginBottom: 12 }}>Paste an address into Meta Commerce Manager or TikTok Catalog as a scheduled feed. It updates by itself when your prices and stock change.</p>
        <ul className="mk-feeds">
          {hub.feeds.map((f) => (
            <li key={f.url}>
              <span>{f.name}</span>
              <input readOnly value={f.url} onFocus={(e) => e.currentTarget.select()} aria-label={f.name} />
              <button type="button" className="portal-btn portal-btn-sm portal-btn-outline" onClick={() => copy(f.url)}>{copied === f.url ? 'Copied' : 'Copy'}</button>
            </li>
          ))}
        </ul>
        {hub.catalogue.noPhoto > 0 ? <p className="an-note"><Link href="/portal/products?view=no_photo">{hub.catalogue.noPhoto} shown product{hub.catalogue.noPhoto === 1 ? ' has' : 's have'} no photo</Link>, and platforms reject those.</p> : null}
      </div>
    </div>
  );
}
