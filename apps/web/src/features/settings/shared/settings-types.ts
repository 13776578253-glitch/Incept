export type SettingsVisibility = 'public' | 'admin';

export type SettingsControlType =
  | 'theme-segmented'
  | 'code-palette-segmented'
  | 'boolean-toggle'
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
  disabledHint?: string;
  options?: SettingsOption[];
};

export type SettingsSection = {
  id: 'appearance' | 'language' | 'account' | 'plugin' | 'ai';
  label: string;
  description?: string;
  visibility: SettingsVisibility;
  rows: SettingsRow[];
};

export type SettingsPageData = {
  title: string;
  description: string;
  sections: SettingsSection[];
};
