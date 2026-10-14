import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  viewer: vi.fn(),
  origin: vi.fn(),
}));

vi.mock('@/server/auth', () => ({
  getCurrentViewer: mocks.viewer,
  hasSameOrigin: mocks.origin,
}));

vi.mock('@incept/db', () => ({ prisma: {} }));
vi.mock('@/server/auth/sensitive-action', () => ({ withSensitiveOwnerAction: (_action: string, handler: unknown) => handler }));

import { authorizeOwner, isRoadmapOwner } from '../assembly';

describe('roadmap owner gate', () => {
  beforeEach(() => {
    mocks.viewer.mockReset();
    mocks.origin.mockReset();
    mocks.origin.mockReturnValue(true);
  });

  it('reports false for an anonymous viewer', async () => {
    mocks.viewer.mockResolvedValue({ role: 'guest' });

    expect(await isRoadmapOwner()).toBe(false);
    expect(
      await authorizeOwner(new Request('http://localhost/api/internal/roadmap/entries', { method: 'POST' })),
    ).toBe(false);
  });

  it('reports true for the owner and keeps the same-origin rule', async () => {
    mocks.viewer.mockResolvedValue({ role: 'owner', sessionId: 's' });

    expect(await isRoadmapOwner()).toBe(true);
    expect(
      await authorizeOwner(new Request('http://localhost/api/internal/roadmap/entries', { method: 'POST' })),
    ).toBe(true);

    mocks.origin.mockReturnValue(false);
    expect(
      await authorizeOwner(new Request('http://localhost/api/internal/roadmap/entries', { method: 'POST' })),
    ).toBe(false);
  });

  it('permits owner reads without Origin but never anonymous reads', async () => {
    mocks.origin.mockReturnValue(false);
    mocks.viewer.mockResolvedValue({ role: 'owner', sessionId: 's' });
    expect(await authorizeOwner(new Request('http://localhost/api/internal/roadmap/roadmaps'))).toBe(true);
    mocks.viewer.mockResolvedValue({ role: 'guest' });
    expect(await authorizeOwner(new Request('http://localhost/api/internal/roadmap/roadmaps'))).toBe(false);
  });
});
