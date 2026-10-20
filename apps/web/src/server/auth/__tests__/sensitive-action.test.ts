import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ viewer: vi.fn(), origin: vi.fn(), recent: vi.fn(), audit: vi.fn(), finish: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../viewer', () => ({ getCurrentViewer: mocks.viewer }));
vi.mock('../request-origin', () => ({ hasSameOrigin: mocks.origin }));
vi.mock('@incept/db/owner', () => ({
  OwnerAuthError: class extends Error { constructor(public status: number, public code: string) { super(code); } },
  requireRecentOwnerSession: mocks.recent, writeSecurityAudit: mocks.audit, finishSecurityAudit: mocks.finish,
}));
import { OwnerAuthError } from '@incept/db/owner';
import { withSensitiveOwnerAction } from '../sensitive-action';
beforeEach(() => { vi.resetAllMocks(); mocks.audit.mockResolvedValue({ id: 'audit-id' }); mocks.finish.mockResolvedValue({}); mocks.origin.mockReturnValue(true); mocks.viewer.mockResolvedValue({ role: 'owner', sessionId: 'session-id' }); });
it('rejects Guest, Pro, cross-origin and stale Owner before executing deletion', async () => {
  const handler = vi.fn(), wrapped = withSensitiveOwnerAction('content.delete', handler);
  for (const role of ['guest', 'pro']) { mocks.viewer.mockResolvedValue({ role }); expect((await wrapped(new Request('http://localhost', { method: 'DELETE' }))).status).toBe(403); }
  mocks.origin.mockReturnValue(false); expect((await wrapped(new Request('http://localhost'))).status).toBe(403);
  mocks.origin.mockReturnValue(true); mocks.viewer.mockResolvedValue({ role: 'owner', sessionId: 's' }); mocks.recent.mockRejectedValue(new OwnerAuthError(428, 'reauthentication_required'));
  expect((await wrapped(new Request('http://localhost'))).status).toBe(428); expect(handler).not.toHaveBeenCalled();
});
it('audits the result without request body, Cookie, query or raw path', async () => {
  const handler = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  const wrapped = withSensitiveOwnerAction('content.delete', handler);
  const request = new Request('http://localhost/private-secret?password=secret', { method: 'DELETE', headers: { cookie: 'private-cookie' }, body: 'private-body' });
  expect((await wrapped(request)).status).toBe(204);
  expect(mocks.audit).toHaveBeenCalledWith('content.delete', 'started', undefined, 'session-id');
  expect(mocks.finish).toHaveBeenCalledWith('audit-id', 'success');
  expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain('private-');
});
it('refuses execution if the audit cannot start and preserves a known successful response if final auditing fails', async () => {
  const handler = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  const wrapped = withSensitiveOwnerAction('content.delete', handler);
  mocks.audit.mockRejectedValueOnce(new Error('database unavailable'));
  expect((await wrapped(new Request('http://localhost'))).status).toBe(503); expect(handler).not.toHaveBeenCalled();
  mocks.finish.mockRejectedValueOnce(new Error('final audit unavailable'));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect((await wrapped(new Request('http://localhost'))).status).toBe(204);
  expect(handler).toHaveBeenCalledTimes(1); expect(log).toHaveBeenCalledWith(JSON.stringify({ event: 'security_audit_failed', action: 'content.delete' }));
  log.mockRestore();
});
