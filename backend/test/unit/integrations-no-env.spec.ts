import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Every id and secret for WhatsApp, Facebook and Threads lives in the admin settings, never in the environment. This fails the build
 * if any code outside the one-time import reads such a variable again, so the rule cannot erode quietly.
 */
const SRC = join(__dirname, '../../src');
const ALLOWED = new Set(['integrations/env-import.ts']);
const PATTERN = /process\.env\.(WHATSAPP|FACEBOOK|THREADS|META|MAUTIC|OUTREACH)_[A-Z0-9_]+|process\.env\[['"`](WHATSAPP|FACEBOOK|THREADS|META|MAUTIC|OUTREACH)_/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : full.endsWith('.ts') ? [full] : [];
  });
}

describe('no integration id or secret is read from the environment', () => {
  it('only the one-time import touches them', () => {
    const offenders = files(SRC)
      .filter((f) => !ALLOWED.has(relative(SRC, f)))
      .filter((f) => PATTERN.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it('and the old list of report shops is gone: a shop is scheduled by its own saved settings', () => {
    const offenders = files(SRC).filter((f) => /DAILY_REPORT_SHOPS/.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});
