import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ viewer: vi.fn(), stats: vi.fn(), entries: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/server/auth', () => ({ getCurrentViewer: mocks.viewer }));
vi.mock('@incept/db/docs', () => ({ getDocsLibraryStats: mocks.stats, listDocsLibraryEntries: mocks.entries }));
import { loadDocsSettings } from '../docs';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.stats.mockResolvedValue({ totalArticles: 0, standaloneArticleCount: 0, collectionArticleCount: 0, collectionCount: 0, recentlyUpdatedCount: 0 });
  mocks.entries.mockResolvedValue([]);
});

it.each(['guest', 'pro'])('does not query or serialize document management data for %s', async role => {
  mocks.viewer.mockResolvedValue({ role });
  expect(await loadDocsSettings()).toBeNull();
  expect(mocks.stats).not.toHaveBeenCalled();
  expect(mocks.entries).not.toHaveBeenCalled();
});

it('loads the publishing overview for the Owner settings section', async () => {
  mocks.viewer.mockResolvedValue({ role: 'owner' });
  expect(await loadDocsSettings()).toMatchObject({ stats: { totalArticles: 0 }, entries: [] });
  expect(mocks.stats).toHaveBeenCalledTimes(1);
  expect(mocks.entries).toHaveBeenCalledTimes(1);
});
