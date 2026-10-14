import 'server-only';
import { OwnerAuthError, requireRecentOwnerSession, writeSecurityAudit, finishSecurityAudit } from '@incept/db/owner';
import { getCurrentViewer } from './viewer';
import { hasSameOrigin } from './request-origin';

// Keep credentials, request bodies and raw URLs out of the audit record.
export function withSensitiveOwnerAction<T extends unknown[]>(action: string, handler: (request: Request, ...args: T) => Promise<Response>) {
  return async (request: Request, ...args: T): Promise<Response> => {
    if (!hasSameOrigin(request)) return Response.json({ error: 'forbidden' }, { status: 403 });
    const viewer = await getCurrentViewer();
    if (viewer.role !== 'owner') return Response.json({ error: 'forbidden' }, { status: 403 });
    try {
      await requireRecentOwnerSession(viewer.sessionId);
    } catch (error) {
      if (error instanceof OwnerAuthError) return Response.json({ error: error.code }, { status: error.status });
      return Response.json({ error: 'service_unavailable' }, { status: 503 });
    }
    let audit;
    try { audit = await writeSecurityAudit(action, 'started', undefined, viewer.sessionId); }
    catch { return Response.json({ error: 'service_unavailable' }, { status: 503 }); }
    let response: Response;
    try { response = await handler(request, ...args); }
    catch (error) {
      await finishSecurityAudit(audit.id, 'failure').catch(() => {});
      throw error;
    }
    await finishSecurityAudit(audit.id, response.status < 400 ? 'success' : 'failure')
      .catch(() => console.error(JSON.stringify({ event: 'security_audit_failed', action })));
    return response;
  };
}
