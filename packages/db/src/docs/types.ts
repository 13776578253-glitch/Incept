import type { DocAccessRole, DocLayoutMode, DocKind, DocStatus } from '../../generated/client/index.js';

export type DbDocsLocale = 'en' | 'zh';

export type DbDocsSectionBlock =
  | {
      id: string;
      type: 'paragraph';
      text: string;
    }
  | {
      id: string;
      type: 'list';
      items: string[];
    }
  | {
      id: string;
      type: 'callout';
      tone: 'note' | 'tip' | 'warning';
      title: string;
      text: string;
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
  sidebarJson?: {
    groups?: DbDocsNavGroup[];
  } | null;
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

export type DbDocsHomeGroupRecord = {
  year: string;
  articles: DbDocsHomeArticleRecord[];
};
