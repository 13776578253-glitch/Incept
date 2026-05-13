import type { DocAccessRole, DocLayoutMode, DocKind, DocStatus } from '../../generated/client/index.js';

export type DbDocsLocale = 'en' | 'zh';

// 定义文档内容块的类型，包括段落、列表、提示、标题、引用、代码块和分割线等不同类型的内容块 / 同feature type 结构 / 待修改
// TODO: 需要根据实际使用情况调整内容块的结构和字段
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
  title: string;
  summary?: string | null;
  status: DocStatus;
  publishedAt?: Date | null;
  bodyJson: DbDocsBody;
  sidebarJson: DbDocsSidebar;
  seoTitle?: string | null;
  seoDescription?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DbDocsCollectionArticleListItem = {
  documentId: number;
  locale: DbDocsLocale;
  slug: string;
  title: string;
  summary?: string | null;
  publishedAt?: Date | null;
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
  articleSlug: string;
  articleTitle: string;
  articleSummary?: string | null;
  articleEyebrow?: string | null;
  articlePublishedAt?: Date | null;
  articleBodyJson: DbDocsBody;
  articleStatus: DocStatus;
  articleKind: DocKind;
  articleLayoutMode: DocLayoutMode;
  collectionItems: DbDocsCollectionArticleListItem[];
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
};

export type DbDocsHomeEntryRecord =
  | ({
      entryType: 'singleArticle';
    } & DbDocsHomeArticleRecord)
  | ({
      entryType: 'collection';
    } & DbDocsHomeCollectionRecord);
