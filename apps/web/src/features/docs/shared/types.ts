import type { DocsContentBlockModel } from '@/features/docs/block-system/schema';

export type {
  DocsBlockType,
  DocsBlockVariant,
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
} from '@/features/docs/block-system/schema';
export type { DocsBlockCatalogItem } from '@/features/docs/block-system/catalog';

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

// 文档内容块模型，表示文档中的不同类型的内容块，如段落、列表、提示、标题、引用、代码块和分割线等
export type { DocsContentBlockModel } from '@/features/docs/block-system/schema';

export type DocsSectionModel = {
  id: string;
  title: string;
  description?: string;
  blocks: DocsContentBlockModel[];
};

export type DocsNavItemModel = {
  id: string;
  label: string;
  href: string;
  active?: boolean;
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
  title: string;
  description?: string;
  publishedAt?: string;
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
  isAccessible: boolean;
  href?: string;
};

export type DocsHomeGroupModel = {
  id: string;
  label: string;
  description?: string;
  entries: DocsHomeArticleItemModel[];
};

export type DocsHomePageModel = {
  intro: DocsHomeIntroModel;
  groups: DocsHomeGroupModel[];
};
