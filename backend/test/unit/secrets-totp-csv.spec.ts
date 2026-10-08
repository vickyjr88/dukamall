import { decryptSecret, encryptSecret, isEncrypted } from '../../src/common/secrets';
import { base32Encode, generateTotpSecret, totpCode, verifyTotp, hashRecoveryCode, newRecoveryCodes } from '../../src/common/totp';
import { toCsv } from '../../src/common/csv';
import { reminderKindFor } from '../../src/trial/trial.service';

describe('stored secrets', () => {
  it('encrypts, never leaving the plaintext in the stored value', () => {
    const stored = encryptSecret('sk_live_super_secret');
    expect(isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain('super_secret');
    expect(decryptSecret(stored)).toBe('sk_live_super_secret');
  });
  it('uses a fresh nonce each time', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });
  it('still reads legacy plaintext, and does not encrypt twice', () => {
    expect(decryptSecret('sk_old_plain')).toBe('sk_old_plain');
    const once = encryptSecret('x');
    expect(encryptSecret(once)).toBe(once);
  });
  it('rejects tampered data', () => {
    const stored = encryptSecret('value');
    expect(() => decryptSecret(stored.slice(0, -4) + 'AAAA')).toThrow();
  });
  it('passes null through', () => {
    expect(decryptSecret(null)).toBeNull();
  });
});

describe('two-factor codes (TOTP)', () => {
  const rfcSecret = base32Encode(Buffer.from('12345678901234567890'));
  it('matches the RFC 6238 test vector', () => {
    expect(totpCode(rfcSecret, Math.floor(59 / 30))).toBe('287082');
  });
  it('accepts the current code and the neighbouring steps (clock drift)', () => {
    const s = generateTotpSecret(); const now = Date.now(); const step = Math.floor(now / 30000);
    expect(verifyTotp(s, totpCode(s, step), null, now)).toBe(step);
    expect(verifyTotp(s, totpCode(s, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(s, totpCode(s, step + 1), null, now)).toBe(step + 1);
  });
  it('rejects a code from two steps away, and garbage', () => {
    const s = generateTotpSecret(); const now = Date.now(); const step = Math.floor(now / 30000);
    expect(verifyTotp(s, totpCode(s, step - 3), null, now)).toBeNull();
    expect(verifyTotp(s, 'abcdef', null, now)).toBeNull();
    expect(verifyTotp(s, '12345', null, now)).toBeNull();
  });
  it('refuses to accept the same code twice (replay)', () => {
    const s = generateTotpSecret(); const now = Date.now(); const step = Math.floor(now / 30000);
    const first = verifyTotp(s, totpCode(s, step), null, now);
    expect(first).toBe(step);
    expect(verifyTotp(s, totpCode(s, step), first, now)).toBeNull();
  });
  it('recovery codes are unique, and are matched regardless of dashes and case', () => {
    const codes = newRecoveryCodes();
    expect(new Set(codes).size).toBe(codes.length);
    expect(hashRecoveryCode(codes[0].toUpperCase())).toBe(hashRecoveryCode(codes[0].replace(/-/g, '')));
  });
});

describe('CSV exports', () => {
  it('neutralises spreadsheet formulas in customer-supplied text', () => {
    const out = toCsv([{ name: '=HYPERLINK("http://evil","x")', a: '@SUM(1)', b: '+cmd', c: '-2+3' }], ['name', 'a', 'b', 'c']);
    const data = out.split('\n')[1];
    expect(data).toContain(`'=HYPERLINK`);
    expect(data).toContain(`'@SUM(1)`);
    expect(data).toContain(`'-2+3`);
  });
  it('leaves real numbers and normal text alone, and quotes commas', () => {
    const out = toCsv([{ n: -5, s: 'Nairobi, Kenya', t: 'plain' }], ['n', 's', 't']);
    expect(out.split('\n')[1]).toBe('-5,"Nairobi, Kenya",plain');
  });
});

describe('trial reminder timing', () => {
  const now = new Date('2026-01-10T12:00:00Z'); const days = (n: number) => new Date(now.getTime() + n * 86_400_000);
  it.each([[30, null], [8, null], [6.9, '7d'], [3, '3d'], [2.5, '3d'], [0.9, '1d'], [-0.1, 'ended'], [-40, 'ended']])('%s days left -> %s', (n, kind) => {
    expect(reminderKindFor(days(n as number), now)).toBe(kind);
  });
});
