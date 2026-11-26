import type { DocsContentBlockModel } from '@/features/docs/block-system/schema';

export type {
  DocsBlockType,
  DocsBlockVariant,
  DocsContentBlockModel,
  DocsHeadingBlockModel,
  DocsParagraphBlockModel,
  DocsParagraphInlineModel,
  DocsParagraphTextInlineModel,
  DocsParagraphLinkInlineModel,
  DocsParagraphDeleteInlineModel,
  DocsParagraphMarkInlineModel,
  DocsParagraphInlineCodeInlineModel,
  DocsListBlockModel,
  DocsChecklistItemModel,
  DocsChecklistBlockModel,
  DocsCalloutBlockModel,
  DocsQuoteBlockModel,
  DocsCodeBlockModel,
  DocsDividerBlockModel,
  DocsImageBlockModel,
  DocsHtmlBlockModel,
} from '@/features/docs/block-system/schema';

export type DocsAccessRole = 'guest' | 'pro' | 'private';

export type DocsLayoutMode = 'sidebar' | 'contentOnly';

export type DocsReadingStats = {
  chineseCharacterCount: number;
  wordCount: number;
  writingUnits: number;
  estimatedMinutes: number;
};

export type DocsHomeEntryType = 'collection' | 'singleArticle';

export type DocsHomeIntroModel = {
  eyebrow?: string;
  title: string;
  description?: string;
};

export type DocsSectionModel = {
  id: string;
  title: string;
  description?: string;
  blocks: DocsContentBlockModel[];
};

export type DocsNavItemModel = {
  id: string;
  type?: 'article' | 'folder';
  label: string;
  href?: string;
  active?: boolean;
  children?: DocsNavItemModel[];
};

export type DocsNavGroupModel = {
  id: string;
  label: string;
  items: DocsNavItemModel[];
  defaultOpen?: boolean;
};

export type DocsOutlineItemModel = {
  id: string;
  label: string;
  level?: 1 | 2 | 3 | 4;
  children?: DocsOutlineItemModel[];
};

export type DocsArticlePageModel = {
  id: string;
  slug: string;
  routeType: 'singleArticle' | 'collectionArticle';
  collectionSlug?: string;
  articleSlug?: string;
  layoutMode: DocsLayoutMode;
  locale: 'en' | 'zh';
  eyebrow?: string;
  // Tags placeholder: reserved field for interface compatibility.
  tags?: string[];
  title: string;
  description?: string;
  publishedAt?: string;
  lastEditedAt?: string;
  readingStats: DocsReadingStats;
  outlineLabel: string;
  sidebarGroups: DocsNavGroupModel[];
  outline: DocsOutlineItemModel[];
  sections: DocsSectionModel[];
};

export type DocsHomeArticleItemModel = {
  id: string;
  entryType: DocsHomeEntryType;
  slug: string;
  collectionSlug?: string;
  firstArticleSlug?: string;
  title: string;
  summary: string;
  publishedAt: string;
  requiredRole: DocsAccessRole;
  eyebrow?: string;
  // Tags placeholder: reserved field for interface compatibility.
  tags?: string[];
  isCurated?: boolean;
  isAccessible: boolean;
  href?: string;
};

export type DocsHomeStatsModel = {
  totalArticles: number;
  standalone: number;
  collections: number;
  recentlyUpdated: number;
};

export type DocsHomeGroupModel = {
  id: string;
  label: string;
  description?: string;
  entries: DocsHomeArticleItemModel[];
};

export type DocsHomePageModel = {
  intro: DocsHomeIntroModel;
  stats?: DocsHomeStatsModel;
  groups: DocsHomeGroupModel[];
};
