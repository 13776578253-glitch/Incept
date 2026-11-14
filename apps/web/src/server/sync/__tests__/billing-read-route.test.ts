// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ read: vi.fn(), viewer: vi.fn(), requireOwner: vi.fn() }));
vi.mock('@incept/dashboard/adapters/billing', () => ({ readPublishedBilling: mocks.read }));
vi.mock('@incept/db/agent', () => ({ requireSyncOwner: mocks.requireOwner, JobError: class extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
} }));
vi.mock('@/server/auth', () => ({ getCurrentViewer: mocks.viewer }));

import { GET } from '@/app/api/dashboard/billing/route';
import { JobError } from '@incept/db/agent';

const request = (range = '30d') => new Request('https://fixture.invalid/api/dashboard/billing?range=' + range);
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('INCEPT_BILLING_READ_MODE', 'owner');
  vi.stubEnv('INCEPT_BILLING_PUBLICATION_FILE', '/fixture/publication.json');
  vi.stubEnv('INCEPT_SYNC_DATABASE_FILE', '/fixture/ledger.db');
  mocks.viewer.mockResolvedValue({ role: 'owner', sessionId: 'owner-fixture' });
});
afterEach(() => vi.unstubAllEnvs());

it('keeps the pilot disabled by default and rejects other roles before reading', async () => {
  vi.stubEnv('INCEPT_BILLING_READ_MODE', '');
  expect((await GET(request())).status).toBe(404);
  expect(mocks.viewer).not.toHaveBeenCalled();
  vi.stubEnv('INCEPT_BILLING_READ_MODE', 'owner');
  for (const role of ['pro', 'guest']) {
    mocks.viewer.mockResolvedValue({ role });
    expect((await GET(request())).status).toBe(403);
  }
  expect(mocks.read).not.toHaveBeenCalled();
});

it('serves the approved window only to Owner and keeps currency groups separate', async () => {
  const data = { range: '14d', estimatedCostUsd: '0.01', tokens: 4, estimatedTokens: 1,
    unpricedTokens: 2, excludedTokens: 1, recordedUnknownCurrency: 2 };
  mocks.read.mockResolvedValue(data);
  const response = await GET(request('14d'));
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual(data);
  expect(mocks.requireOwner).toHaveBeenCalledWith('owner-fixture');
  expect(mocks.read).toHaveBeenCalledWith('14d', '/fixture/ledger.db', '/fixture/publication.json');
});

it('returns an explicit error for invalid windows and unavailable publications', async () => {
  expect((await GET(request('2d'))).status).toBe(400);
  expect(mocks.read).not.toHaveBeenCalled();
  mocks.read.mockRejectedValue(Error('BILLING_PUBLICATION_STALE'));
  expect((await GET(request())).status).toBe(503);
});

it('rejects a revoked Owner session before reading the publication', async () => {
  mocks.requireOwner.mockRejectedValue(new JobError('FORBIDDEN', 403));
  expect((await GET(request())).status).toBe(403);
  expect(mocks.read).not.toHaveBeenCalled();
});
