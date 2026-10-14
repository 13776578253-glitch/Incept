import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { getRequestOrigin, hasSameOrigin } from './request-origin';

afterEach(() => vi.unstubAllEnvs());
describe('reverse proxy origin validation', () => {
  it('matches the real loopback Host in development when Next normalizes the internal URL', () => {
    vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('INCEPT_TRUST_PROXY', '0');
    for (const host of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000']) {
      const request = new Request('http://localhost:3000/api/auth/owner/login', { headers: { host, origin: `http://${host}` } });
      expect(getRequestOrigin(request)).toBe(`http://${host}`);
      expect(hasSameOrigin(request)).toBe(true);
    }
  });
  it('does not allow foreign origins, alias crossings, unrelated ports or remote Host values through the development rule', () => {
    vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('INCEPT_TRUST_PROXY', '0');
    for (const [host, origin] of [['127.0.0.1:3000', 'https://attacker.example'], ['127.0.0.1:3000', 'http://localhost:3000'],
      ['127.0.0.1:4000', 'http://127.0.0.1:4000'], ['attacker.example:3000', 'http://attacker.example:3000']]) {
      expect(hasSameOrigin(new Request('http://localhost:3000/api', { headers: { host, origin } }))).toBe(false);
    }
  });
  it('never applies development Host normalization to production', () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('INCEPT_TRUST_PROXY', '0');
    expect(hasSameOrigin(new Request('http://localhost:3000/api', { headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' } }))).toBe(false);
  });
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
