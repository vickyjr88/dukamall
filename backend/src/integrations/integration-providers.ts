import { IntegrationProvider } from '@prisma/client';

/**
 * What each connection is made of. This is the one place that says which ids and secrets a provider needs, how they are checked,
 * and what the owner is told about them, so the portal screen, the validation and the "is it connected" test all agree.
 *
 * Every shop brings its own Meta app, so the app id and app secret are fields of the shop's own connection.
 */
export type FieldKind = 'config' | 'secret';

export type FieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  /** The connection is not usable without it. */
  required?: boolean;
  help: string;
  placeholder?: string;
  /** What a value has to look like. This catches a pasted label or a stray space, not a wrong token (the Test button does that). */
  pattern?: RegExp;
  patternHint?: string;
  /** The id Meta calls this connection by; stored in its own unique column so events can be matched to the shop. */
  externalId?: boolean;
  default?: string;
  /** How the screen shows it: a text box (the default), an on/off switch (value "true" or "false") or a number box. */
  input?: 'text' | 'toggle' | 'number';
};

export type ProviderDef = {
  label: string;
  description: string;
  fields: FieldDef[];
};

const DIGITS = /^\d{5,25}$/;
const TEMPLATE_NAME = /^[a-z0-9_]{1,512}$/;
const TOKEN = /^\S{16,1000}$/;

export const PROVIDERS: Record<IntegrationProvider, ProviderDef> = {
  WHATSAPP: {
    label: 'WhatsApp',
    description: 'The number your shop messages customers from, and the daily report from. Needs a WhatsApp Business Account on the Meta Cloud API.',
    fields: [
      { key: 'phoneNumberId', label: 'Phone number ID', kind: 'config', required: true, externalId: true, pattern: DIGITS, patternHint: 'digits only', placeholder: '543573888841483', help: 'WhatsApp Manager > API setup. This is an id, not the phone number itself.' },
      { key: 'wabaId', label: 'WhatsApp Business Account ID', kind: 'config', pattern: DIGITS, patternHint: 'digits only', help: 'Needed to connect incoming messages and delivery reports.' },
      { key: 'appId', label: 'Meta app ID', kind: 'config', pattern: DIGITS, patternHint: 'digits only', help: 'The app you created for this shop in the Meta developer dashboard.' },
      { key: 'reportTemplate', label: 'Daily report template name', kind: 'config', default: 'daily_report', pattern: /^[a-z0-9_]{1,512}$/, patternHint: 'lower case letters, digits and underscores', help: 'The approved template the daily report is sent with.' },
      { key: 'templateLang', label: 'Template language', kind: 'config', default: 'en', pattern: /^[a-z]{2,3}(_[A-Z]{2})?$/, patternHint: 'like en or en_GB', help: 'The language the templates were approved in.' },
      { key: 'templateGroup', label: 'Template: join the group', kind: 'config', default: 'join_group', pattern: TEMPLATE_NAME, patternHint: 'lower case letters, digits and underscores', help: 'Approved template with two variables: {{1}} the customer\'s first name, {{2}} the group link. Sent when you pick "Join the WhatsApp group" and in the welcome series.' },
      { key: 'templateReview', label: 'Template: rate us on Google', kind: 'config', default: 'rate_us', pattern: TEMPLATE_NAME, patternHint: 'lower case letters, digits and underscores', help: 'Approved template with two variables: {{1}} the customer\'s first name, {{2}} your Google review link.' },
      { key: 'templateLocation', label: 'Template: where to find us', kind: 'config', pattern: TEMPLATE_NAME, patternHint: 'lower case letters, digits and underscores', help: 'Optional. An approved template with no variables (the address is written in it).' },
      { key: 'templateRange', label: 'Template: what we sell', kind: 'config', pattern: TEMPLATE_NAME, patternHint: 'lower case letters, digits and underscores', help: 'Optional. An approved template with no variables.' },
      { key: 'autoSubscribe', label: 'Welcome people who message you', kind: 'config', input: 'toggle', default: 'false', pattern: /^(true|false)$/, patternHint: 'on or off', help: 'When on, anyone who messages your number is told they will get updates (and that STOP opts out), then receives the welcome series. Off until you turn it on.' },
      { key: 'dailySendCap', label: 'Most template messages a day', kind: 'config', input: 'number', default: '200', pattern: /^\d{1,4}$/, patternHint: 'a number', help: 'A new Meta business can start about 250 conversations a day, so stay under that until it is verified.' },
      { key: 'accessToken', label: 'Access token', kind: 'secret', required: true, pattern: TOKEN, patternHint: 'no spaces', help: 'A permanent System User token with whatsapp_business_messaging and whatsapp_business_management.' },
      { key: 'appSecret', label: 'App secret', kind: 'secret', pattern: TOKEN, patternHint: 'no spaces', help: 'Optional. Lets the shop check that incoming events really come from Meta.' },
    ],
  },
  FACEBOOK: {
    label: 'Facebook Page',
    description: 'Your shop\'s Facebook Page: replies to comments and posts products.',
    fields: [
      { key: 'pageId', label: 'Page ID', kind: 'config', required: true, externalId: true, pattern: DIGITS, patternHint: 'digits only', help: 'Your Page > About > Page transparency, or Meta Business Suite > Settings > Pages.' },
      { key: 'appId', label: 'Meta app ID', kind: 'config', pattern: DIGITS, patternHint: 'digits only', help: 'The app you created for this shop in the Meta developer dashboard.' },
      { key: 'pageUrl', label: 'Page link', kind: 'config', pattern: /^https:\/\/\S{4,300}$/, patternHint: 'a link starting with https://', placeholder: 'https://www.facebook.com/yourpage', help: 'Optional. Shown to people who message you.' },
      { key: 'pageAccessToken', label: 'Page access token', kind: 'secret', required: true, pattern: TOKEN, patternHint: 'no spaces', help: 'The Page\'s own token, taken from a System User token with pages_messaging, pages_read_engagement, pages_manage_metadata, pages_manage_engagement and pages_manage_posts.' },
      { key: 'appSecret', label: 'App secret', kind: 'secret', pattern: TOKEN, patternHint: 'no spaces', help: 'Optional. Lets the shop check that incoming events really come from Meta.' },
    ],
  },
  THREADS: {
    label: 'Threads',
    description: 'Your shop\'s Threads account: posts products.',
    fields: [
      { key: 'userId', label: 'Threads account ID', kind: 'config', externalId: true, pattern: DIGITS, patternHint: 'digits only', help: 'Leave blank: it is found from the token when you press Test connection.' },
      { key: 'appId', label: 'Threads app ID', kind: 'config', pattern: DIGITS, patternHint: 'digits only', help: 'Shown in the Threads use case of the app (it is different from the Facebook app ID).' },
      { key: 'accessToken', label: 'Access token', kind: 'secret', required: true, pattern: TOKEN, patternHint: 'no spaces', help: 'From the Threads use case\'s user token generator. It lasts 60 days and the shop renews it itself.' },
      { key: 'appSecret', label: 'Threads app secret', kind: 'secret', pattern: TOKEN, patternHint: 'no spaces', help: 'Optional. Needed only to exchange a short-lived token for a long one.' },
    ],
  },
};

export const PROVIDER_KEYS = Object.keys(PROVIDERS) as IntegrationProvider[];

export const isProvider = (value: string): value is IntegrationProvider => (PROVIDER_KEYS as string[]).includes(value);

export const fieldsOf = (provider: IntegrationProvider) => PROVIDERS[provider].fields;
export const requiredKeys = (provider: IntegrationProvider) => fieldsOf(provider).filter((f) => f.required).map((f) => f.key);
export const externalIdKey = (provider: IntegrationProvider) => fieldsOf(provider).find((f) => f.externalId)?.key ?? null;

/** What the screen may show of a stored secret: that it is set, and its last four characters. Never the value. */
export const secretHint = (value: string | undefined | null): string | null => (value ? `••••${value.slice(-4)}` : null);

export type SecretInput = { config?: Record<string, unknown>; secrets?: Record<string, unknown>; clear?: string[] };

/** Checks an owner's input against the provider's fields and returns it cleaned. Throws a message the owner can act on. */
export function cleanInput(provider: IntegrationProvider, input: SecretInput): { config: Record<string, string>; secrets: Record<string, string>; clear: string[] } {
  const defs = new Map(fieldsOf(provider).map((f) => [f.key, f]));
  const config: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  const clear: string[] = [];

  const take = (source: Record<string, unknown> | undefined, kind: FieldKind, into: Record<string, string>) => {
    for (const [key, raw] of Object.entries(source ?? {})) {
      const def = defs.get(key);
      if (!def || def.kind !== kind) throw new Error(`"${key}" is not a ${kind === 'secret' ? 'secret' : 'setting'} of ${PROVIDERS[provider].label}.`);
      if (raw === undefined || raw === null) continue;
      if (typeof raw !== 'string') throw new Error(`${def.label} must be text.`);
      const value = raw.trim();
      // Blank means "leave it alone" for a secret (the screen never shows the old one) and "clear it" for a setting.
      if (value === '') { if (kind === 'config') clear.push(key); continue; }
      if (def.pattern && !def.pattern.test(value)) throw new Error(`${def.label} does not look right${def.patternHint ? ` (${def.patternHint})` : ''}.`);
      into[key] = value;
    }
  };
  take(input.config, 'config', config);
  take(input.secrets, 'secret', secrets);

  for (const key of input.clear ?? []) {
    const def = defs.get(key);
    if (!def) throw new Error(`"${key}" is not a field of ${PROVIDERS[provider].label}.`);
    if (!clear.includes(key)) clear.push(key);
  }
  return { config, secrets, clear };
}
