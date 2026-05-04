export type SettingsVisibility = 'public' | 'admin';

export type SettingsControlType =
  | 'theme-segmented'
  | 'language-segmented'
  | 'select'
  | 'button'
  | 'status'
  | 'input';

export type SettingsRowState =
  | 'interactive'
  | 'locked'
  | 'collapsed-preview';

export type SettingsOption = {
  id: string;
  label: string;
};

export type SettingsAnchor = {
  id: string;
  label: string;
  description?: string;
};

export type SettingsRow = {
  id: string;
  label: string;
  description: string;
  controlType: SettingsControlType;
  state: SettingsRowState;
  visibility: SettingsVisibility;
  value?: string;
  placeholder?: string;
  actionLabel?: string;
  badge?: string;
  options?: SettingsOption[];
};

export type SettingsDomain = {
  id: string;
  anchorId: string;
  label: string;
  description?: string;
  visibility: SettingsVisibility;
  defaultExpanded?: boolean;
  rows: SettingsRow[];
};

export type SettingsGroup = {
  id: string;
  title: string;
  description?: string;
  domains: SettingsDomain[];
};

export type SettingsPageData = {
  sidebar: SettingsAnchor[];
  groups: SettingsGroup[];
};
