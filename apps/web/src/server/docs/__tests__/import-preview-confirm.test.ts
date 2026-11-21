import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  viewer: vi.fn(),
  origin: vi.fn(),
  getPreview: vi.fn(),
  readDraft: vi.fn(),
  deleteDraft: vi.fn(),
  findConfirmation: vi.fn(),
  confirmDraft: vi.fn(),
  importArticle: vi.fn(),
  importDirectory: vi.fn(),
  writeAudit: vi.fn(),
  notFoundError: new Error('NEXT_HTTP_ERROR_FALLBACK;404'),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw mocks.notFoundError;
  },
}));
vi.mock('@/server/auth', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/server/auth')>();
  return {
    ...original,
    getCurrentViewer: mocks.viewer,
    hasSameOrigin: mocks.origin,
    getRequestOrigin: () => 'http://localhost',
    requireOwner: async () => {
      const viewer = await mocks.viewer();
      if (viewer.role !== 'owner') {
        throw mocks.notFoundError;
      }
      return viewer;
    },
  };
});
vi.mock('@/server/docs/import-preview', () => ({
  getDocsImportPreview: mocks.getPreview,
}));
vi.mock('@/features/docs', () => ({
  ImportPreviewFeature: () => null,
}));
vi.mock('@/features/docs/importer/draft-store', () => ({
  readDocsImportDraft: mocks.readDraft,
  deleteDocsImportDraft: mocks.deleteDraft,
}));
vi.mock('@incept/db/docs', () => ({
  findDocsImportConfirmation: mocks.findConfirmation,
  confirmDocsImportDraft: mocks.confirmDraft,
  importDocsArticleDraft: mocks.importArticle,
  importDocsCollectionDirectory: mocks.importDirectory,
}));
vi.mock('@incept/db/owner', () => ({
  writeSecurityAudit: mocks.writeAudit,
}));

import DocsImportPreviewPage from '@/app/[locale]/docs/import-preview/[draftId]/page';
import { POST as confirmImport } from '@/app/[locale]/docs/import-preview/[draftId]/confirm/route';

const draftId = '329fd371-8658-44c6-8bb6-481e27dcffc2';
const firstSource = {
  meta: {
    locale: 'zh',
    kind: 'article',
    routeType: 'collectionArticle',
    collectionSlug: 'nlp-text-classification',
    slug: 'ml-math-foundations',
  },
};
const secondSource = { meta: { ...firstSource.meta, slug: 'nlp-task-foundations' } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.origin.mockReturnValue(true);
  mocks.viewer.mockResolvedValue({ role: 'owner', sessionId: 'owner-session' });
  mocks.findConfirmation.mockResolvedValue(null);
  mocks.confirmDraft.mockImplementation(async (_id, fn) => fn({}));
  mocks.importDirectory.mockResolvedValue({ documentIds: [39] });
  mocks.writeAudit.mockResolvedValue({});
  mocks.readDraft.mockReturnValue({
    id: draftId,
    draftType: 'collectionDirectory',
    replace: true,
    issues: [],
    source: firstSource,
    collectionSources: [firstSource, secondSource],
    collectionNodes: [],
  });
});

it('rejects non-owner viewers on the import-preview page before reading drafts', async () => {
  const props: Parameters<typeof DocsImportPreviewPage>[0] = {
    params: Promise.resolve({ locale: 'zh', draftId }),
    searchParams: Promise.resolve({ article: 'nlp-task-foundations' }),
  };

  for (const viewer of [
    { role: 'guest' },
    { role: 'pro', sessionId: 'pro-session', principalId: 'p1' },
  ]) {
    mocks.viewer.mockResolvedValueOnce(viewer);
    await expect(DocsImportPreviewPage(props)).rejects.toBe(mocks.notFoundError);
  }
  expect(mocks.getPreview).not.toHaveBeenCalled();

  mocks.getPreview.mockResolvedValueOnce({ draft: { id: draftId } });
  const element = await DocsImportPreviewPage(props);
  expect(mocks.getPreview).toHaveBeenCalledWith(draftId, 'nlp-task-foundations');
  expect(element).toBeTruthy();
});

it('rejects non-owner or cross-origin confirm requests directly and confirms for Owner without step-up reauthentication', async () => {
  const makeRequest = () =>
    new Request(`http://localhost/zh/docs/import-preview/${draftId}/confirm`, {
      method: 'POST',
    });
  const context = { params: Promise.resolve({ locale: 'zh', draftId }) };

  mocks.origin.mockReturnValueOnce(false);
  expect((await confirmImport(makeRequest(), context)).status).toBe(403);

  for (const viewer of [
    { role: 'guest' },
    { role: 'pro', sessionId: 'pro-session', principalId: 'p1' },
  ]) {
    mocks.viewer.mockResolvedValueOnce(viewer);
    expect((await confirmImport(makeRequest(), context)).status).toBe(403);
  }
  expect(mocks.readDraft).not.toHaveBeenCalled();
  expect(mocks.confirmDraft).not.toHaveBeenCalled();

  const response = await confirmImport(makeRequest(), context);
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe(
    'http://localhost/zh/docs/series/nlp-text-classification/ml-math-foundations?imported=1',
  );
  expect(response.headers.get('x-docs-import-document-id')).toBe('39');
  expect(mocks.importDirectory).toHaveBeenCalledExactlyOnceWith({
    sources: [firstSource, secondSource],
    nodes: [],
    replace: true,
    db: {},
  });
  expect(mocks.writeAudit).toHaveBeenCalledWith(
    'docs.publish',
    'success',
    draftId,
    'owner-session',
    {},
  );
  expect(mocks.deleteDraft).toHaveBeenCalledWith(draftId);
});
