import type {
  DocAccessRole,
  DocLayoutMode,
  DocKind,
  DocStatus,
} from '../../generated/client/index.js';

export type DbDocsLocale = 'en' | 'zh';

// history: The current block union matches the implemented renderer and importer contract.
// Future block additions require an explicit schema, importer, renderer, and database contract change.
export type DbDocsSectionBlock =
  | {
      id: string;
      type: 'paragraph';
      text?: string;
      content?: (
        | {
            type: 'text';
            text: string;
          }
        | {
            type: 'link';
            label: string;
            href: string;
            external?: boolean;
          }
        | {
            type: 'delete';
            text: string;
          }
        | {
            type: 'mark';
            text: string;
          }
        | {
            type: 'inlineCode';
            code: string;
          }
      )[];
      variant?: 'default' | 'lead' | 'muted';
      spacing?: 'default' | 'relaxed';
    }
  | {
      id: string;
      type: 'list';
      items: string[];
      listStyle?: 'unordered' | 'ordered';
      variant?: 'default' | 'emphasis';
    }
  | {
      id: string;
      type: 'checklist';
      items: {
        id: string;
        text: string;
        checked: boolean;
      }[];
      variant?: 'default' | 'emphasis';
    }
  | {
      id: string;
      type: 'callout';
      tone: 'note' | 'tip' | 'attention' | 'warning' | 'meta';
      title: string;
      text: string;
      variant?: 'default' | 'soft' | 'context';
    }
  | {
      id: string;
      type: 'heading';
      level: 1 | 2 | 3 | 4;
      text: string;
      variant?: 'display' | 'default' | 'compact' | 'subtle';
    }
  | {
      id: string;
      type: 'quote';
      text: string;
      attribution?: string;
    }
  | {
      id: string;
      type: 'code';
      code: string;
      language: string;
      caption?: string;
      variant?: 'block' | 'compact';
    }
  | {
      id: string;
      type: 'divider';
      variant?: 'default' | 'spacious';
    }
  | {
      id: string;
      type: 'image';
      src: string;
      alt: string;
      caption?: string;
    };

export type DbDocsSection = {
  id: string;
  title: string;
  description?: string;
  blocks: DbDocsSectionBlock[];
};

export type DbDocsNavGroupItem = {
  id: string;
  label: string;
  href: string;
  active?: boolean;
};

export type DbDocsNavGroup = {
  id: string;
  label: string;
  items: DbDocsNavGroupItem[];
  defaultOpen?: boolean;
};

export type DbDocsOutlineItem = {
  id: string;
  label: string;
};

export type DbDocsBody = {
  sections: DbDocsSection[];
};

export type DbDocsSidebar = {
  groups: DbDocsNavGroup[];
};

export type DbDocsArticleRecord = {
  documentId: number;
  kind: DocKind;
  layoutMode: DocLayoutMode;
  accessRole: DocAccessRole;
  locale: DbDocsLocale;
  slug: string;
  eyebrow?: string | null;
  // Tags placeholder: unused contract field reserved for interface compatibility.
  tags?: string[];
  title: string;
  summary?: string | null;
  status: DocStatus;
  publishedAt?: Date | null;
  lastEditedAt?: Date | null;
  bodyJson: DbDocsBody;
  sidebarJson: DbDocsSidebar;
  seoTitle?: string | null;
  seoDescription?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DbDocsCollectionArticleListItem = {
  documentId: number;
  accessRole: DocAccessRole;
  locale: DbDocsLocale;
  slug: string;
  title: string;
  summary?: string | null;
  publishedAt?: Date | null;
};

export type DbDocsCollectionNavigationNode = {
  id: number;
  nodeKey: string;
  type: 'article' | 'folder';
  position: number;
  label?: string | null;
  documentId?: number;
  accessRole?: DocAccessRole;
  slug?: string;
  title?: string;
  active?: boolean;
  children: DbDocsCollectionNavigationNode[];
};

export type DbDocsCollectionRecord = {
  collectionId: number;
  locale: DbDocsLocale;
  collectionSlug: string;
  collectionTitle: string;
  collectionSummary?: string | null;
  collectionEyebrow?: string | null;
  collectionStatus: DocStatus;
  collectionPublishedAt?: Date | null;
  collectionAccessRole: DocAccessRole;
  articleDocumentId: number;
  articleAccessRole: DocAccessRole;
  articleSlug: string;
  articleTitle: string;
  articleSummary?: string | null;
  articleEyebrow?: string | null;
  articlePublishedAt?: Date | null;
  articleLastEditedAt?: Date | null;
  articleBodyJson: DbDocsBody;
  articleStatus: DocStatus;
  articleKind: DocKind;
  articleLayoutMode: DocLayoutMode;
  collectionItems: DbDocsCollectionArticleListItem[];
  collectionNavigation: DbDocsCollectionNavigationNode[];
  seoTitle?: string | null;
  seoDescription?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DbDocsHomeArticleRecord = {
  documentId: number;
  locale: DbDocsLocale;
  slug: string;
  title: string;
  summary?: string | null;
  publishedAt: Date;
  requiredRole: DocAccessRole;
  eyebrow?: string | null;
  // Tags placeholder: unused contract field reserved for interface compatibility.
  tags?: string[];
  accessRole: DocAccessRole;
};

export type DbDocsHomeCollectionRecord = {
  collectionId: number;
  locale: DbDocsLocale;
  collectionSlug: string;
  title: string;
  summary?: string | null;
  publishedAt: Date;
  requiredRole: DocAccessRole;
  eyebrow?: string | null;
  accessRole: DocAccessRole;
  firstArticleSlug: string;
  firstArticleAccessRole: DocAccessRole;
};

export type DbDocsHomeEntryRecord =
  | ({
      entryType: 'singleArticle';
    } & DbDocsHomeArticleRecord)
  | ({
      entryType: 'collection';
    } & DbDocsHomeCollectionRecord);

export type DbDocsLibraryRouteType = 'singleArticle' | 'collectionArticle';

export type DbDocsLibraryEntryRecord = {
  documentId: number;
  locale: DbDocsLocale;
  title: string;
  slug: string;
  routeType: DbDocsLibraryRouteType;
  kind: DocKind;
  layoutMode: DocLayoutMode;
  accessRole: DocAccessRole;
  collectionId?: number;
  collectionSlug?: string;
  collectionTitle?: string;
  position?: number;
  finalRoute: string;
  createdAt: Date;
  updatedAt: Date;
};

export type DbDocsLibraryStatsRecord = {
  totalArticles: number;
  standaloneArticleCount: number;
  collectionArticleCount: number;
  collectionCount: number;
  recentlyUpdatedCount: number;
};
