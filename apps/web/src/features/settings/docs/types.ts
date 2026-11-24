export type DocsLibraryRouteType = 'singleArticle' | 'collectionArticle';

export type DocsLibraryEntryModel = {
  documentId: number;
  locale: 'en' | 'zh';
  title: string;
  slug: string;
  routeType: DocsLibraryRouteType;
  kind: 'article' | 'reference' | 'note';
  layoutMode: 'sidebar' | 'contentOnly';
  accessRole: 'guest' | 'pro' | 'private';
  collectionId?: number;
  collectionSlug?: string;
  collectionTitle?: string;
  position?: number;
  finalRoute: string;
  createdAt: string;
  updatedAt: string;
};

export type DocsLibraryStatsModel = {
  totalArticles: number;
  standaloneArticleCount: number;
  collectionArticleCount: number;
  collectionCount: number;
  recentlyUpdatedCount: number;
};

export type DocsHomeCurationEntryModel = {
  entryType: 'singleArticle' | 'collection';
  targetId: number;
  title: string;
  slug: string;
  locales: Array<'en' | 'zh'>;
  accessRole: 'guest' | 'pro' | 'private';
  isCurated: boolean;
  publishedAt: string;
};

export type DocsLibraryPageModel = {
  stats: DocsLibraryStatsModel;
  entries: DocsLibraryEntryModel[];
  curationEntries?: DocsHomeCurationEntryModel[];
};
