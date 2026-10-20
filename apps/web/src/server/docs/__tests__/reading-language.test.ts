import { beforeEach, expect, it, vi } from 'vitest';
import type { DbDocsHomeEntryRecord } from '@incept/db/docs';

const mocks = vi.hoisted(() => ({ cookie: vi.fn(), document: vi.fn(), collection: vi.fn(), article: vi.fn(), series: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: mocks.cookie }) }));
vi.mock('@incept/db', () => ({ prisma: { docsDocument: { findFirst: mocks.document }, docsCollection: { findFirst: mocks.collection } } }));
vi.mock('@incept/db/docs', () => ({ findPublishedDocsArticleBySlug: mocks.article, findPublishedDocsCollectionArticleBySlugs: mocks.series,
  findPublishedUnlistedDocsArticleByDocumentKey: vi.fn(), listPublishedDocsHomeEntries: vi.fn() }));
vi.mock('@/server/docs/mappers', () => ({ mapDocsArticleRecordToPageModel: (value: unknown) => value, mapDocsCollectionRecordToPageModel: (value: unknown) => value,
  docsHomeIntro: {}, mapDocsHomeEntriesToPageGroups: vi.fn() }));
import { getDocumentLanguage, resolveArticleReadingRoute, resolveCollectionReadingRoute, preferredHomeEntries } from '../reading-language';
import { getDocsArticlePage, getDocsCollectionArticlePage } from '../access';

beforeEach(() => { vi.resetAllMocks(); mocks.cookie.mockReturnValue({ value: 'zh' }); });

it('chooses reading language independently of the interface and defaults to the existing interface when unset', async () => {
  expect(await getDocumentLanguage('en')).toBe('zh');
  mocks.cookie.mockReturnValue(undefined); expect(await getDocumentLanguage('en')).toBe('en');
  mocks.cookie.mockReturnValue({ value: 'invalid' }); expect(await getDocumentLanguage('zh')).toBe('zh');
});

it('maps an English URL to the Chinese translation by identity even when slugs differ', async () => {
  mocks.document.mockResolvedValue({ locales: [{ locale: 'en', slug: 'english-slug' }, { locale: 'zh', slug: 'chinese-slug' }] });
  expect(await resolveArticleReadingRoute('en', 'english-slug')).toEqual({ locale: 'zh', slug: 'chinese-slug' });
  mocks.cookie.mockReturnValue({ value: 'en' });
  expect(await resolveArticleReadingRoute('zh', 'chinese-slug')).toEqual({ locale: 'en', slug: 'english-slug' });
});

it('keeps same-language documents unchanged and falls back when the preferred published version is absent', async () => {
  mocks.document.mockResolvedValue({ locales: [{ locale: 'zh', slug: 'only-chinese' }] });
  expect(await resolveArticleReadingRoute('zh', 'only-chinese')).toEqual({ locale: 'zh', slug: 'only-chinese' });
  mocks.cookie.mockReturnValue({ value: 'en' });
  expect(await resolveArticleReadingRoute('en', 'only-chinese')).toEqual({ locale: 'zh', slug: 'only-chinese' });
});

it('accepts original-language slug aliases after changing the interface locale', async () => {
  mocks.document.mockResolvedValueOnce(null).mockResolvedValueOnce({ locales: [{ locale: 'zh', slug: 'original' }, { locale: 'en', slug: 'translated' }] });
  expect(await resolveArticleReadingRoute('en', 'original')).toEqual({ locale: 'zh', slug: 'original' });
  expect(mocks.document).toHaveBeenCalledTimes(2);
});

it('resolves collection and article translations together and falls back to an available series version', async () => {
  mocks.collection.mockResolvedValue({ locales: [{ locale: 'zh', slug: 'series-zh' }, { locale: 'en', slug: 'series-en' }],
    items: [{ document: { locales: [{ locale: 'zh', slug: 'article-zh' }, { locale: 'en', slug: 'article-en' }] } }] });
  expect(await resolveCollectionReadingRoute('en', 'series-en', 'article-en')).toEqual({ locale: 'zh', collectionSlug: 'series-zh', articleSlug: 'article-zh' });
  mocks.cookie.mockReturnValue({ value: 'en' });
  mocks.collection.mockResolvedValue({ locales: [{ locale: 'zh', slug: 'series-zh' }], items: [{ document: { locales: [{ locale: 'zh', slug: 'article-zh' }] } }] });
  expect(await resolveCollectionReadingRoute('en', 'series-zh', 'article-zh')).toEqual({ locale: 'zh', collectionSlug: 'series-zh', articleSlug: 'article-zh' });
});

it('merges home translations once per identity, preferring the selected language without dropping untranslated entries', async () => {
  const primary = [{ entryType: 'singleArticle', documentId: 1, locale: 'zh', title: '首选' }] as DbDocsHomeEntryRecord[];
  const fallback = [{ entryType: 'singleArticle', documentId: 1, locale: 'en', title: 'Duplicate' },
    { entryType: 'singleArticle', documentId: 2, locale: 'en', title: 'English only' }] as DbDocsHomeEntryRecord[];
  const load = vi.fn().mockImplementation(({ locale }) => Promise.resolve(locale === 'zh' ? primary : fallback));
  expect((await preferredHomeEntries('en', load)).map(entry => entry.title)).toEqual(['首选', 'English only']);
});

it('preserves Guest/Pro/Owner article access after choosing a translation', async () => {
  mocks.document.mockResolvedValue({ locales: [{ locale: 'zh', slug: 'translated' }] });
  mocks.article.mockResolvedValue({ accessRole: 'pro', locale: 'zh' });
  expect(await getDocsArticlePage({ locale: 'en', slug: 'url', viewerRole: 'guest' })).toBeNull();
  expect(await getDocsArticlePage({ locale: 'en', slug: 'url', viewerRole: 'pro' })).toMatchObject({ locale: 'zh' });
  mocks.article.mockResolvedValue({ accessRole: 'private' });
  expect(await getDocsArticlePage({ locale: 'en', slug: 'url', viewerRole: 'pro' })).toBeNull();
  expect(await getDocsArticlePage({ locale: 'en', slug: 'url', viewerRole: 'private' })).not.toBeNull();
});

it('checks both collection and article permissions independently of reading language', async () => {
  mocks.collection.mockResolvedValue(null);
  mocks.series.mockResolvedValue({ collectionAccessRole: 'guest', articleAccessRole: 'pro', collectionItems: [], collectionNavigation: [] });
  expect(await getDocsCollectionArticlePage({ locale: 'en', collectionSlug: 'series', articleSlug: 'article', viewerRole: 'guest' })).toBeNull();
  expect(await getDocsCollectionArticlePage({ locale: 'en', collectionSlug: 'series', articleSlug: 'article', viewerRole: 'pro' })).not.toBeNull();
  mocks.series.mockResolvedValue({ collectionAccessRole: 'private', articleAccessRole: 'guest' });
  expect(await getDocsCollectionArticlePage({ locale: 'en', collectionSlug: 'series', articleSlug: 'article', viewerRole: 'pro' })).toBeNull();
});
