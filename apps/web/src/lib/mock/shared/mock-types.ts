export type MockNavigationItem = {
  id: string;
  label: string;
  href: string;
  description?: string;
};

export type MockSectionIntro = {
  eyebrow?: string;
  title: string;
  description?: string;
};

export type MockHeroStatement = {
  id: string;
  label: string;
  value: string;
};

export type MockCard = {
  id: string;
  title: string;
  description: string;
  href?: string;
  tone?: 'default' | 'muted' | 'emphasis';
};

export type MockBlogEntry = {
  id: string;
  title: string;
  summary: string;
  href: string;
  imageSrc: string;
  imageAlt: string;
};

export type MockSidebarItem = {
  id: string;
  label: string;
  href?: string;
  description?: string;
  active?: boolean;
};

export type MockSettingsSection = {
  id: string;
  title: string;
  description?: string;
  items: MockCard[];
};

export type MockBottomSection = {
  title: string;
  description: string;
};

export type MockAccessRole = 'guest' | 'pro' | 'private';

export type MockViewer = {
  id: string;
  name: string;
  role: string;
  accessRole: MockAccessRole;
};

export type MockDocsArticle = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  publishedAt: string;
  requiredRole: MockAccessRole;
  eyebrow?: string;
  tags?: string[];
  imageSrc?: string;
  imageAlt?: string;
};

export type MockDocsArchiveGroup = {
  id: string;
  label: string;
  description?: string;
  articles: MockDocsArticle[];
};

export type MockDocsLayoutMode = 'sidebar' | 'contentOnly';

export type MockDocsNavItem = {
  id: string;
  label: string;
  href: string;
  active?: boolean;
};

export type MockDocsNavGroup = {
  id: string;
  label: string;
  items: MockDocsNavItem[];
  defaultOpen?: boolean;
};

export type MockDocsOutlineItem = {
  id: string;
  label: string;
};

export type MockDocsParagraphBlock = {
  id: string;
  type: 'paragraph';
  text: string;
};

export type MockDocsListBlock = {
  id: string;
  type: 'list';
  items: string[];
};

export type MockDocsCalloutBlock = {
  id: string;
  type: 'callout';
  tone: 'note' | 'tip' | 'warning';
  title: string;
  text: string;
};

export type MockDocsContentBlock =
  | MockDocsParagraphBlock
  | MockDocsListBlock
  | MockDocsCalloutBlock;

export type MockDocsSection = {
  id: string;
  title: string;
  description?: string;
  blocks: MockDocsContentBlock[];
};

// Detail page for individual documentation articles
export type MockDocsDetailPage = {
  id: string;
  slug: string;
  layoutMode: MockDocsLayoutMode;
  eyebrow?: string;
  title: string;
  description?: string;
  outlineLabel: string;
  sidebarGroups: MockDocsNavGroup[];
  outline: MockDocsOutlineItem[];
  sections: MockDocsSection[];
};

export type MockDocsReferencePage = MockDocsDetailPage;
