/**
 * The ONLY place that may read an integration id or secret from the environment, and only to copy it into the database once.
 *
 * Nairobi Gents' daily report used to send WhatsApp from the number in WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN. Those now live
 * in the platform's admin settings. So that the report does not stop on the deploy that moves them, the first start copies whatever
 * is still in the environment into the platform's WhatsApp sender, if nothing is saved there yet. Afterwards the variables can be
 * removed from the server and are never read again. (test/unit/integrations-no-env.spec.ts fails if any other file reads them.)
 */
export type EnvWhatsApp = { phoneNumberId: string; accessToken: string; template: string; language: string };

export function whatsAppFromEnvironment(env: NodeJS.ProcessEnv = process.env): EnvWhatsApp | null {
  const phoneNumberId = (env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const accessToken = (env.WHATSAPP_ACCESS_TOKEN || '').trim();
  if (!phoneNumberId || !accessToken) return null;
  return {
    phoneNumberId,
    accessToken,
    template: (env.WHATSAPP_REPORT_TEMPLATE || '').trim() || 'daily_report',
    language: (env.WHATSAPP_TEMPLATE_LANG || '').trim() || 'en',
  };
}
