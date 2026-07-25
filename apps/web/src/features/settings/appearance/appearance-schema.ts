import type { AppLocale } from '@/i18n/config/locales';
import type { SettingsSection } from '../shared/settings-types';

export function getAppearanceSettingsSection(locale: AppLocale): SettingsSection {
  if (locale === 'zh') {
    return {
      id: 'appearance',
      label: '主题',
      description: '控制站点的整体观感与阅读明暗',
      visibility: 'public',
      rows: [
        {
          id: 'appearance-theme',
          label: '主题模式',
          description: '在亮色、暗色与跟随系统之间切换',
          controlType: 'theme-segmented',
          state: 'interactive',
          visibility: 'public',
        },
        {
          id: 'appearance-reading-filter',
          label: '护眼模式',
          description: '轻微暖黄色调，让长时间阅读更柔和',
          controlType: 'boolean-toggle',
          state: 'interactive',
          visibility: 'public',
          options: [
            { id: 'enabled', label: '已开启' },
            { id: 'disabled', label: '已关闭' },
          ],
        },
        {
          id: 'appearance-code-palette',
          label: '代码块配色',
          description: '为代码块选择成组的亮色与暗色编辑器配色',
          disabledHint: '护眼模式开启时，代码块固定使用 Rosé Pine Dawn；当前选择会保留，并在关闭护眼后恢复。',
          controlType: 'code-palette-segmented',
          state: 'interactive',
          visibility: 'public',
          options: [
            { id: 'vscode', label: 'VS Code-like' },
            { id: 'github', label: 'GitHub-like' },
            { id: 'vitesse', label: 'Vitesse' },
          ],
        },
      ],
    };
  }

  return {
    id: 'appearance',
    label: 'Appearance',
    description: 'Control the overall appearance and reading contrast of the site.',
    visibility: 'public',
    rows: [
      {
        id: 'appearance-theme',
        label: 'Theme mode',
        description: 'Switch between light, dark, and system themes.',
        controlType: 'theme-segmented',
        state: 'interactive',
        visibility: 'public',
      },
      {
        id: 'appearance-reading-filter',
        label: 'Eye-comfort mode',
        description: 'Adds a subtle warm tint for a softer long-form reading environment.',
        controlType: 'boolean-toggle',
        state: 'interactive',
        visibility: 'public',
        options: [
          { id: 'enabled', label: 'On' },
          { id: 'disabled', label: 'Off' },
        ],
      },
      {
        id: 'appearance-code-palette',
        label: 'Code palette',
        description: 'Choose a matched light and dark editor palette for code blocks.',
        disabledHint: 'Eye-comfort mode uses Rosé Pine Dawn for code blocks. Your selection is preserved and returns when the filter is off.',
        controlType: 'code-palette-segmented',
        state: 'interactive',
        visibility: 'public',
        options: [
          { id: 'vscode', label: 'VS Code-like' },
          { id: 'github', label: 'GitHub-like' },
          { id: 'vitesse', label: 'Vitesse' },
        ],
      },
    ],
  };
}
