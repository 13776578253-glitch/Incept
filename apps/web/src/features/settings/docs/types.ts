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

export type DocsLibraryPageModel = {
  stats: DocsLibraryStatsModel;
  entries: DocsLibraryEntryModel[];
};
