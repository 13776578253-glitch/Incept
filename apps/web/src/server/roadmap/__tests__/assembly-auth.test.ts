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

import { authorizeOwner, isRoadmapOwner } from '../assembly';

describe('roadmap owner gate (M3 server assertion)', () => {
  beforeEach(() => {
    mocks.viewer.mockReset();
    mocks.origin.mockReset();
    mocks.origin.mockReturnValue(true);
  });

  it('reports false for an anonymous viewer', async () => {
    mocks.viewer.mockResolvedValue({ role: 'guest' });

    expect(await isRoadmapOwner()).toBe(false);
    expect(
      await authorizeOwner(new Request('http://localhost/api/internal/roadmap/entries')),
    ).toBe(false);
  });

  it('reports true for the owner and keeps the same-origin rule', async () => {
    mocks.viewer.mockResolvedValue({ role: 'owner', sessionId: 's' });

    expect(await isRoadmapOwner()).toBe(true);
    expect(
      await authorizeOwner(new Request('http://localhost/api/internal/roadmap/entries')),
    ).toBe(true);

    mocks.origin.mockReturnValue(false);
    expect(
      await authorizeOwner(new Request('http://localhost/api/internal/roadmap/entries')),
    ).toBe(false);
  });
});
