import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ viewer: vi.fn(), recent: vi.fn(), origin: vi.fn(), commit: vi.fn(), importRoadmap: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@incept/db', () => ({ prisma: {} }));
vi.mock('../viewer', () => ({ getCurrentViewer: mocks.viewer }));
vi.mock('@/server/auth', () => ({ getCurrentViewer: mocks.viewer, hasSameOrigin: mocks.origin }));
vi.mock('../request-origin', () => ({ hasSameOrigin: mocks.origin, getRequestOrigin: () => 'http://localhost' }));
vi.mock('@incept/db/owner', () => ({
  OwnerAuthError: class extends Error { constructor(public status: number, public code: string) { super(code); } },
  requireRecentOwnerSession: mocks.recent,
  writeSecurityAudit: async () => ({ id: 'audit-id' }), finishSecurityAudit: async () => ({}),
}));
vi.mock('@incept/dashboard/next', () => ({ dashboardImportCommitPost: mocks.commit }));
vi.mock('@incept/roadmap/next', async importOriginal => ({
  ...await importOriginal<typeof import('@incept/roadmap/next')>(),
  createRoadmapImportRoute: () => ({ POST: mocks.importRoadmap }),
}));

import { OwnerAuthError } from '@incept/db/owner';
import { POST as commit } from '@/app/api/dashboard/imports/commit/route';
import { roadmapImport } from '@/server/roadmap/assembly';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.origin.mockReturnValue(true);
  mocks.viewer.mockResolvedValue({ role: 'owner', sessionId: 'owner-session' });
  mocks.commit.mockResolvedValue(Response.json({ imported: true }));
  mocks.importRoadmap.mockResolvedValue(Response.json({ imported: true }));
});

for (const [name, route, handler] of [['dashboard', commit, mocks.commit], ['roadmap', roadmapImport, mocks.importRoadmap]] as const) {
  it(`${name} import refuses unauthenticated, cross-origin and stale step-up requests before writing`, async () => {
    const request = () => new Request('http://localhost/api/import', { method: 'POST' });
    for (const role of ['guest', 'pro']) {
      mocks.viewer.mockResolvedValue({ role });
      expect((await route(request())).status).toBe(403);
    }
    mocks.viewer.mockResolvedValue({ role: 'owner', sessionId: 'owner-session' });
    mocks.origin.mockReturnValue(false);
    expect((await route(request())).status).toBe(403);
    mocks.origin.mockReturnValue(true);
    mocks.recent.mockRejectedValueOnce(new OwnerAuthError(428, 'reauthentication_required'));
    expect((await route(request())).status).toBe(428);
    expect(handler).not.toHaveBeenCalled();
    expect((await route(request())).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });
}
