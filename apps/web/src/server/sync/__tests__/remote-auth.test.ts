import { describe, expect, it } from 'vitest';
import { OwnerAuthError } from '@incept/db/owner';
import { RemoteSync } from '../remote';

describe('remote owner recent-authentication boundary', () => {
  it('returns 428 before parsing a mutating remote job request', async () => {
    const remote = new RemoteSync({
      executor: {} as never,
      owner: async () => { throw new OwnerAuthError(428, 'reauthentication_required'); },
      gatewayBase: 'http://127.0.0.1:1',
      secret: 'a'.repeat(64),
      readMode: () => 'v1',
    });
    const response = await remote.handle(new Request('https://example.invalid/api/dashboard/sync/jobs', {
      method: 'POST',
      headers: { origin: 'https://example.invalid', 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: '00000000-0000-4000-8000-000000000001', idempotencyKey: '00000000-0000-4000-8000-000000000002' }),
    }));
    expect(response?.status).toBe(428);
    expect(await response?.json()).toMatchObject({ error: 'reauthentication_required' });
  });
});
