/**
 * Brand glyphs for the footer's social links, inline like whatsapp-icon.tsx so they render with
 * the page and take the surrounding text colour (currentColor) instead of loading an icon font.
 */
type IconProps = { className?: string };

const svg = { viewBox: '0 0 24 24', 'aria-hidden': true, focusable: false } as const;

export function InstagramIcon({ className }: IconProps) {
  return (
    <svg {...svg} className={className}>
      <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.3" cy="6.7" r="1.15" fill="currentColor" />
    </svg>
  );
}

export function FacebookIcon({ className }: IconProps) {
  return (
    <svg {...svg} className={className}>
      <path fill="currentColor" d="M13.5 22v-8.2h2.8l.5-3.4h-3.3V8.3c0-1 .3-1.7 1.7-1.7h1.7V3.6c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.6H7.4v3.4h2.8V22h3.3z" />
    </svg>
  );
}

export function TikTokIcon({ className }: IconProps) {
  return (
    <svg {...svg} className={className}>
      <path fill="currentColor" d="M16.6 2h-3.3v13.4a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9.2a6.3 6.3 0 1 0 5.4 6.2V8.6a7.7 7.7 0 0 0 4.5 1.4V6.7a4.6 4.6 0 0 1-4.6-4.7z" />
    </svg>
  );
}

export function XIcon({ className }: IconProps) {
  return (
    <svg {...svg} className={className}>
      <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
