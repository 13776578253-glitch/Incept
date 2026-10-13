import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { getRequestOrigin, hasSameOrigin } from './request-origin';

afterEach(() => vi.unstubAllEnvs());
describe('reverse proxy origin validation', () => {
  it('accepts the public HTTPS origin only when the private proxy contract is enabled', () => {
    const request = new Request('http://0.0.0.0:3000/api/auth/owner/login', { headers: {
      origin: 'https://site.example', 'x-forwarded-host': 'site.example', 'x-forwarded-proto': 'https',
    } });
    vi.stubEnv('INCEPT_TRUST_PROXY', '0');
    expect(hasSameOrigin(request)).toBe(false);
    vi.stubEnv('INCEPT_TRUST_PROXY', '1');
    expect(hasSameOrigin(request)).toBe(true);
    expect(getRequestOrigin(request)).toBe('https://site.example');
  });
  it('rejects a foreign origin and malformed forwarding headers', () => {
    vi.stubEnv('INCEPT_TRUST_PROXY', '1');
    for (const host of ['site.example', 'site.example,attacker.example', 'site.example/evil']) {
      expect(hasSameOrigin(new Request('http://0.0.0.0:3000/api', { headers: {
        origin: 'https://attacker.example', 'x-forwarded-host': host, 'x-forwarded-proto': 'https',
      } }))).toBe(false);
    }
  });
});
