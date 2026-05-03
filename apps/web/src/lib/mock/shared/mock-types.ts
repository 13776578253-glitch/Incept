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

export type MockSettingsVisibility = 'public' | 'admin';

export type MockSettingsControlType =
  | 'theme-segmented'
  | 'language-segmented'
  | 'select'
  | 'button'
  | 'status'
  | 'input';

export type MockSettingsRowState =
  | 'interactive'
  | 'locked'
  | 'collapsed-preview';

export type MockSettingsOption = {
  id: string;
  label: string;
};

export type MockSettingsAnchor = {
  id: string;
  label: string;
  description?: string;
};

export type MockSettingsRow = {
  id: string;
  label: string;
  description: string;
  controlType: MockSettingsControlType;
  state: MockSettingsRowState;
  visibility: MockSettingsVisibility;
  value?: string;
  placeholder?: string;
  actionLabel?: string;
  badge?: string;
  options?: MockSettingsOption[];
};

export type MockSettingsDomain = {
  id: string;
  anchorId: string;
  label: string;
  description?: string;
  visibility: MockSettingsVisibility;
  defaultExpanded?: boolean;
  rows: MockSettingsRow[];
};

export type MockSettingsGroup = {
  id: string;
  title: string;
  description?: string;
  domains: MockSettingsDomain[];
};
