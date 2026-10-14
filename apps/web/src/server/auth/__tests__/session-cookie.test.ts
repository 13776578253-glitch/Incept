import { beforeEach, expect, it, vi } from 'vitest';

const { set } = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ set }) }));
import { writeOwnerSessionCookie } from '../session-cookie';

beforeEach(() => set.mockClear());

it('keeps the Owner cookie for the full seven-day session with HttpOnly and same-origin cookie policy', async () => {
  await writeOwnerSessionCookie('test-session-token');
  expect(set).toHaveBeenCalledWith(expect.objectContaining({
    name: 'incept-access-session', value: 'test-session-token', maxAge: 7 * 86400,
    httpOnly: true, sameSite: 'lax', path: '/',
  }));
});
