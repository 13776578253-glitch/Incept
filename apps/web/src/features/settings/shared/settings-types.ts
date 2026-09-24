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
  // 二级分组标题：同一分区内连续同组的行归为一段，段前渲染二级标题
  group?: string;
};

export type SettingsSection = {
  // 分区 id 放开为字符串以容纳注册表贡献；内置 appearance/language/account/music/ai 为保留字（见 mount/registry）
  id: string;
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
