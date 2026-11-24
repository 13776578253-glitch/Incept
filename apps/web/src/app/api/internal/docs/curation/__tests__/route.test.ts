import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  revalidatePathMock,
  hasSameOriginMock,
  getCurrentViewerMock,
  setDocsHomeEntryCuratedMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  hasSameOriginMock: vi.fn(),
  getCurrentViewerMock: vi.fn(),
  setDocsHomeEntryCuratedMock: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock('@/server/auth', () => ({
  hasSameOrigin: hasSameOriginMock,
  getCurrentViewer: getCurrentViewerMock,
}));

vi.mock('@incept/db/docs', () => ({
  setDocsHomeEntryCurated: setDocsHomeEntryCuratedMock,
}));

import { PATCH } from '../route';

function makePatchRequest(body: unknown) {
  return new Request('http://localhost:3000/api/internal/docs/curation', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      origin: 'http://localhost:3000',
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  hasSameOriginMock.mockReturnValue(true);
  getCurrentViewerMock.mockResolvedValue({ role: 'owner' });
});

describe('PATCH /api/internal/docs/curation', () => {
  it('rejects cross-origin requests with 403', async () => {
    hasSameOriginMock.mockReturnValue(false);
    const response = await PATCH(
      makePatchRequest({ entryType: 'singleArticle', targetId: 1, isCurated: true }),
    );
    expect(response.status).toBe(403);
  });

  it('rejects non-owner viewers with 401', async () => {
    getCurrentViewerMock.mockResolvedValue({ role: 'guest' });
    const response = await PATCH(
      makePatchRequest({ entryType: 'singleArticle', targetId: 1, isCurated: true }),
    );
    expect(response.status).toBe(401);
  });

  it('rejects invalid payloads with 400', async () => {
    const response = await PATCH(
      makePatchRequest({ entryType: 'unknown', targetId: -1, isCurated: 'yes' }),
    );
    expect(response.status).toBe(400);
  });

  it('returns 404 when the target record does not exist', async () => {
    setDocsHomeEntryCuratedMock.mockResolvedValue(null);
    const response = await PATCH(
      makePatchRequest({ entryType: 'collection', targetId: 999, isCurated: true }),
    );
    expect(response.status).toBe(404);
  });

  it('updates curation status and revalidates docs and settings routes', async () => {
    setDocsHomeEntryCuratedMock.mockResolvedValue({
      entryType: 'collection',
      targetId: 10,
      isCurated: true,
    });

    const response = await PATCH(
      makePatchRequest({ entryType: 'collection', targetId: 10, isCurated: true }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      entry: {
        entryType: 'collection',
        targetId: 10,
        isCurated: true,
      },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith('/zh/docs');
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/docs');
    expect(revalidatePathMock).toHaveBeenCalledWith('/zh/settings');
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/settings');
  });
});
