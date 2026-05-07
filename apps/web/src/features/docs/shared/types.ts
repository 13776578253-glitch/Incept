export type DocsAccessRole = 'guest' | 'member' | 'pro';

export type DocsLayoutMode = 'sidebar' | 'contentOnly';

export type DocsHomeIntroModel = {
  eyebrow?: string;
  title: string;
  description?: string;
};

export type DocsContentBlockModel =
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
  layoutMode: DocsLayoutMode;
  eyebrow?: string;
  title: string;
  description?: string;
  outlineLabel: string;
  sidebarGroups: DocsNavGroupModel[];
  outline: DocsOutlineItemModel[];
  sections: DocsSectionModel[];
};

export type DocsHomeArticleItemModel = {
  id: string;
  slug: string;
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
  articles: DocsHomeArticleItemModel[];
};

export type DocsHomePageModel = {
  intro: DocsHomeIntroModel;
  groups: DocsHomeGroupModel[];
};
