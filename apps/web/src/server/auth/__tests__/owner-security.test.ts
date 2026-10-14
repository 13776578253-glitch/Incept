import { describe, expect, it } from 'vitest';
import { createTotpSecret, decryptTotp, encryptTotp, hashPassword, totpAt, verifyPassword, verifyTotp } from '@incept/db/owner/security';

describe('Owner credential primitives', () => {
  it('matches every SHA-1 RFC 6238 test vector', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    for (const [seconds, expected] of [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']] as const) {
      expect(totpAt(secret, Math.floor(seconds / 30), 8)).toBe(expected);
    }
  });
  it('rejects consumed steps and codes outside the clock window', () => {
    const secret = createTotpSecret(), now = new Date('2026-10-14T08:00:00Z'), step = Math.floor(now.getTime() / 30000);
    const code = totpAt(secret, step);
    expect(verifyTotp(secret, code, step - 1, now)).toBe(step);
    expect(verifyTotp(secret, code, step, now)).toBeNull();
    expect(verifyTotp(secret, totpAt(secret, step - 2), -1, now)).toBeNull();
  });
  it('salts dedicated password hashes and rejects incorrect or oversize passwords', async () => {
    const password = 'Owner password with 中文';
    const first = await hashPassword(password), second = await hashPassword(password);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword('incorrect password', first)).toBe(false);
    expect(await verifyPassword('a'.repeat(1025), first)).toBe(false);
    await expect(hashPassword('short')).rejects.toThrow();
  });
  it('uses authenticated encryption and rejects a lost or substituted encryption key', () => {
    const original = process.env.INCEPT_AUTH_ENCRYPTION_KEY;
    try {
      process.env.INCEPT_AUTH_ENCRYPTION_KEY = 'a1'.repeat(32);
      const secret = createTotpSecret(), encrypted = encryptTotp(secret);
      expect(encrypted).not.toContain(secret);
      expect(decryptTotp(encrypted)).toBe(secret);
      process.env.INCEPT_AUTH_ENCRYPTION_KEY = 'b2'.repeat(32);
      expect(() => decryptTotp(encrypted)).toThrow();
    } finally {
      if (original === undefined) delete process.env.INCEPT_AUTH_ENCRYPTION_KEY;
      else process.env.INCEPT_AUTH_ENCRYPTION_KEY = original;
    }
  });
});
