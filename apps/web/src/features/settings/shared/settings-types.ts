export type SettingsVisibility = 'public' | 'admin';

export type SettingsControlType =
  | 'theme-segmented'
  | 'code-palette-segmented'
  | 'boolean-toggle'
  | 'language-segmented'
  | 'select'
  | 'button'
  | 'status'
  | 'input'
  | 'music-rate-lock-toggle'
  | 'music-placement-toggle'
  | 'music-playback-mode-segmented';

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
  // 二级分组标题：同一分区内连续同组的行归为一段，段前渲染二级标题
  group?: string;
};

export type SettingsSection = {
  id: 'appearance' | 'language' | 'account' | 'music' | 'ai';
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
