import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { isLocalLoopbackDatabaseUrl, readDevAutoOwnerToken } from '../dev-owner';

const VALID_TOKEN = 'idev_' + 'a'.repeat(40);

describe('local dev auto-owner security boundary', () => {
  it('accepts only loopback database hostnames', () => {
    expect(isLocalLoopbackDatabaseUrl('postgresql://postgres:pw@127.0.0.1:5432/incept')).toBe(true);
    expect(isLocalLoopbackDatabaseUrl('postgresql://postgres:pw@localhost:5432/incept')).toBe(true);
    expect(isLocalLoopbackDatabaseUrl('postgresql://postgres:pw@[::1]:5432/incept')).toBe(true);
    expect(isLocalLoopbackDatabaseUrl('postgresql://postgres:pw@43.155.136.83:5432/incept')).toBe(false);
    expect(isLocalLoopbackDatabaseUrl('postgresql://postgres:pw@db.prod.internal:5432/incept')).toBe(false);
    expect(isLocalLoopbackDatabaseUrl('')).toBe(false);
  });

  it('hard-disables dev owner injection in production and test environments', () => {
    const base = {
      INCEPT_DEV_AUTO_OWNER: '1',
      INCEPT_DEV_OWNER_SESSION_TOKEN: VALID_TOKEN,
      DATABASE_URL: 'postgresql://postgres:pw@127.0.0.1:5432/incept',
    };
    expect(readDevAutoOwnerToken({ ...base, NODE_ENV: 'production' })).toBeNull();
    expect(readDevAutoOwnerToken({ ...base, NODE_ENV: 'test' })).toBeNull();
    expect(readDevAutoOwnerToken({ ...base, NODE_ENV: undefined })).toBeNull();
  });

  it('requires explicit opt-in, loopback database, and high-entropy token in development', () => {
    const valid = {
      NODE_ENV: 'development',
      INCEPT_DEV_AUTO_OWNER: '1',
      INCEPT_DEV_OWNER_SESSION_TOKEN: VALID_TOKEN,
      DATABASE_URL: 'postgresql://postgres:pw@127.0.0.1:5432/incept',
    };
    expect(readDevAutoOwnerToken(valid)).toBe(VALID_TOKEN);
    expect(readDevAutoOwnerToken({ ...valid, INCEPT_DEV_AUTO_OWNER: '0' })).toBeNull();
    expect(readDevAutoOwnerToken({ ...valid, INCEPT_DEV_AUTO_OWNER: undefined })).toBeNull();
    expect(readDevAutoOwnerToken({ ...valid, DATABASE_URL: 'postgresql://u:p@10.0.0.5:5432/incept' })).toBeNull();
    expect(readDevAutoOwnerToken({ ...valid, INCEPT_DEV_OWNER_SESSION_TOKEN: 'short' })).toBeNull();
  });
});
