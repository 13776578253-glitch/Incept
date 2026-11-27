import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  revalidatePathMock,
  hasSameOriginMock,
  getCurrentViewerMock,
  updateDocsDocumentMetadataMock,
  updateDocsCollectionMetadataMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  hasSameOriginMock: vi.fn(),
  getCurrentViewerMock: vi.fn(),
  updateDocsDocumentMetadataMock: vi.fn(),
  updateDocsCollectionMetadataMock: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock('@/server/auth', () => ({
  hasSameOrigin: hasSameOriginMock,
  getCurrentViewer: getCurrentViewerMock,
}));

vi.mock('@incept/db/docs', () => ({
  updateDocsDocumentMetadata: updateDocsDocumentMetadataMock,
  updateDocsCollectionMetadata: updateDocsCollectionMetadataMock,
}));

import { PATCH } from '../route';

function makePatchRequest(body: unknown) {
  return new Request('http://localhost:3000/api/internal/docs/metadata', {
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

describe('PATCH /api/internal/docs/metadata', () => {
  it('rejects cross-origin requests with 403', async () => {
    hasSameOriginMock.mockReturnValue(false);
    const response = await PATCH(
      makePatchRequest({ targetType: 'document', targetId: 1, locale: 'zh', title: 'New' }),
    );
    expect(response.status).toBe(403);
  });

  it('rejects non-owner viewers with 401', async () => {
    getCurrentViewerMock.mockResolvedValue({ role: 'guest' });
    const response = await PATCH(
      makePatchRequest({ targetType: 'document', targetId: 1, locale: 'zh', title: 'New' }),
    );
    expect(response.status).toBe(401);
  });

  it('rejects invalid titles and access roles with 400', async () => {
    const blankTitle = await PATCH(
      makePatchRequest({ targetType: 'document', targetId: 1, locale: 'zh', title: '   ' }),
    );
    expect(blankTitle.status).toBe(400);

    const badRole = await PATCH(
      makePatchRequest({ targetType: 'document', targetId: 1, locale: 'zh', accessRole: 'admin' }),
    );
    expect(badRole.status).toBe(400);
  });

  it('returns 404 when the target document does not exist', async () => {
    updateDocsDocumentMetadataMock.mockResolvedValue(null);
    const response = await PATCH(
      makePatchRequest({ targetType: 'document', targetId: 999, locale: 'zh', accessRole: 'guest' }),
    );
    expect(response.status).toBe(404);
  });

  it('updates document title and access role and revalidates docs layouts and settings', async () => {
    const updatedAt = new Date('2026-11-27T11:30:00.000Z');
    updateDocsDocumentMetadataMock.mockResolvedValue({
      targetType: 'document',
      documentId: 7,
      locale: 'zh',
      title: '新标题',
      accessRole: 'guest',
      updatedAt,
    });

    const response = await PATCH(
      makePatchRequest({
        targetType: 'document',
        targetId: 7,
        locale: 'zh',
        title: '  新标题  ',
        accessRole: 'guest',
      }),
    );
    expect(response.status).toBe(200);
    expect(updateDocsDocumentMetadataMock).toHaveBeenCalledWith({
      documentId: 7,
      locale: 'zh',
      title: '新标题',
      accessRole: 'guest',
    });
    expect(await response.json()).toEqual({
      ok: true,
      entry: {
        targetType: 'document',
        documentId: 7,
        locale: 'zh',
        title: '新标题',
        accessRole: 'guest',
        updatedAt: updatedAt.toISOString(),
      },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith('/zh/docs', 'layout');
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/docs', 'layout');
    expect(revalidatePathMock).toHaveBeenCalledWith('/zh/settings');
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/settings');
  });

  it('updates collection metadata and propagates access role to articles when requested', async () => {
    const updatedAt = new Date('2026-11-27T11:30:00.000Z');
    updateDocsCollectionMetadataMock.mockResolvedValue({
      targetType: 'collection',
      collectionId: 3,
      locale: 'zh',
      title: 'NLP 笔记',
      accessRole: 'guest',
      updatedDocumentIds: [11, 12],
      updatedAt,
    });

    const response = await PATCH(
      makePatchRequest({
        targetType: 'collection',
        targetId: 3,
        locale: 'zh',
        title: 'NLP 笔记',
        accessRole: 'guest',
        applyToArticles: true,
      }),
    );
    expect(response.status).toBe(200);
    expect(updateDocsCollectionMetadataMock).toHaveBeenCalledWith({
      collectionId: 3,
      locale: 'zh',
      title: 'NLP 笔记',
      accessRole: 'guest',
      applyToArticles: true,
    });
  });
});
