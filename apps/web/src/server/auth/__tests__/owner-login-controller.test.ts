import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  set: vi.fn(), get: vi.fn(), login: vi.fn(), verify: vi.fn(), limit: vi.fn(), session: vi.fn(),
  origin: vi.fn(), viewer: vi.fn(), cancel: vi.fn(), manage: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: mocks.get, set: mocks.set }) }));
vi.mock('@incept/db', () => ({ prisma: { ownerChallenge: { updateMany: mocks.cancel } } }));
vi.mock('@incept/db/owner', () => ({
  OwnerAuthError: class extends Error { constructor(public status: number, public code: string) { super(code); } },
  consumeAuthLimit: mocks.limit, startOwnerLogin: mocks.login, completeOwnerChallenge: mocks.verify,
  issueLoginApproval: vi.fn(), getOwnerManagementState: vi.fn(), manageOwner: mocks.manage, reauthenticateOwner: vi.fn(),
  createTemporaryProGrant: vi.fn(), revokeTemporaryProGrant: vi.fn(), writeSecurityAudit: vi.fn(),
}));
vi.mock('../viewer', () => ({ getCurrentViewer: mocks.viewer }));
vi.mock('../request-origin', () => ({ hasSameOrigin: mocks.origin }));
vi.mock('../session-cookie', () => ({ clearAccessSessionCookie: vi.fn(), writeOwnerSessionCookie: mocks.session }));
import { ownerPostAction } from '../owner-controller';

const post = (action: string, body: unknown) => ownerPostAction(new Request(`http://localhost/api/auth/owner/${action}`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'test-browser' }, body: JSON.stringify(body),
}), action);
beforeEach(() => {
  vi.resetAllMocks();
  process.env.INCEPT_AUTH_ENCRYPTION_KEY = 'a1'.repeat(32);
  mocks.origin.mockReturnValue(true); mocks.viewer.mockResolvedValue({ role: 'guest' });
  mocks.get.mockImplementation((name: string) => name === 'incept-owner-device' ? { value: 'trusted-cookie' } : undefined);
});

it('sets the real session before confirming a password-only login and projects no internal credentials', async () => {
  mocks.login.mockResolvedValue({ stage: 'complete', sessionToken: 'private-session', sessionId: 'private-id' });
  const response = await post('login', { username: 'owner', password: 'password', trusted: true, skipTotp: true });
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ stage: 'complete' });
  expect(mocks.session).toHaveBeenCalledWith('private-session');
  expect(mocks.login).toHaveBeenCalledWith(expect.objectContaining({ deviceToken: 'trusted-cookie' }));
  expect(mocks.login.mock.calls[0][0]).not.toHaveProperty('skipTotp');
  expect(mocks.set).toHaveBeenCalledWith('incept-owner-challenge', '', expect.objectContaining({ maxAge: 0, httpOnly: true }));
});

it('returns the required challenge without minting a session or exposing the challenge token', async () => {
  const expiresAt = new Date(Date.now() + 300000).toISOString();
  mocks.login.mockResolvedValue({ stage: 'totp', challengeId: 'request-id', challengeToken: 'private-challenge', needsApproval: true, expiresAt });
  const response = await post('login', { username: 'owner', password: 'password' });
  expect(await response.json()).toEqual({ stage: 'totp', challengeId: 'request-id', needsApproval: true, expiresAt });
  expect(mocks.session).not.toHaveBeenCalled();
  expect(mocks.set).toHaveBeenCalledWith('incept-owner-challenge', 'private-challenge', expect.objectContaining({ expires: new Date(expiresAt) }));
});

it('synchronizes the challenge cookie when TOTP advances to a fresh ten-minute approval deadline', async () => {
  mocks.get.mockReturnValue({ value: 'challenge' });
  const expiresAt = new Date(Date.now() + 600000).toISOString();
  mocks.verify.mockResolvedValue({ stage: 'approval', challengeId: 'request', needsApproval: true, expiresAt });
  expect((await post('verify', { code: '123456' })).status).toBe(200);
  expect(mocks.set).toHaveBeenCalledWith('incept-owner-challenge', 'challenge', expect.objectContaining({ expires: new Date(expiresAt) }));
  expect(mocks.session).not.toHaveBeenCalled();
});

it('does not write a session after a rejected code and rejects cross-origin before authentication', async () => {
  mocks.get.mockReturnValue({ value: 'challenge' }); mocks.verify.mockResolvedValue({ error: 'invalid_code' });
  expect((await post('verify', { code: 'wrong' })).status).toBe(401);
  expect(mocks.session).not.toHaveBeenCalled();
  mocks.origin.mockReturnValue(false);
  expect((await post('login', { username: 'owner', password: 'password' })).status).toBe(403);
  expect(mocks.login).not.toHaveBeenCalled();
});

it('keeps Guest and Pro outside Owner management', async () => {
  for (const role of ['guest', 'pro']) {
    mocks.viewer.mockResolvedValue({ role });
    expect((await post('grant', { kind: 'single', lifetimeDays: null })).status).toBe(403);
  }
});

it('accepts an eight-character password change and rejects seven characters before calling management', async () => {
  mocks.viewer.mockResolvedValue({ role: 'owner', sessionId: 'owner-session' });
  mocks.manage.mockResolvedValue({ signedOut: true });
  const rejected = await post('password', { password: '1234567' });
  expect(rejected.status).toBe(400);
  expect(await rejected.json()).toEqual({ error: 'password_policy' });
  expect(mocks.manage).not.toHaveBeenCalled();
  const accepted = await post('password', { password: '12345678' });
  expect(accepted.status).toBe(200);
  expect(mocks.manage).toHaveBeenCalledWith('owner-session', 'password', '12345678');
  expect(mocks.set).toHaveBeenCalledWith('incept-owner-device', '', expect.objectContaining({ maxAge: 0 }));
});
