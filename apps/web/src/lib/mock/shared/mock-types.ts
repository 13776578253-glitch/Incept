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
