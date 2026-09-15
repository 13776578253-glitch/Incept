import type { AppLocale } from '@/i18n/config/locales';
import type { SettingsSection } from '../shared/settings-types';

// 插件分区。
//
// 形状对齐 ai 分区：本阶段只提供"板块本身 + 诚实的只读状态行"，
// 交互式偏好（默认倍速、吸附位置等）等音乐来源与存储方案确定后再接入。
// 这里刻意不放假开关——不可配置的值就用 status 展示，而不是做一个点了没反应的控件。
export function getPluginSettingsSection(locale: AppLocale): SettingsSection {
  if (locale === 'zh') {
    return {
      id: 'plugin',
      label: '插件',
      description: '全站插件与其偏好。',
      visibility: 'public',
      rows: [
        {
          id: 'plugin-floating-player',
          label: '悬浮播放器',
          description: '全站常驻的悬浮音乐播放器。在设置、工作台、导入预览等工具型页面会自动隐藏并暂停播放。',
          controlType: 'status',
          state: 'locked',
          visibility: 'public',
          value: '已启用',
        },
        {
          id: 'plugin-default-rate',
          label: '默认倍速',
          description: '倍速目前只跟随当前播放，刷新后回到 1x。默认倍速偏好在音乐来源与存储方案确定后接入。',
          controlType: 'status',
          state: 'locked',
          visibility: 'public',
          value: '1x',
          badge: '待接入',
        },
        {
          id: 'plugin-placement',
          label: '悬浮位置',
          description: '吸附边、垂直位置与收起形态按浏览器记忆，不随账号同步。',
          controlType: 'status',
          state: 'locked',
          visibility: 'public',
          value: '右侧 · 记住位置',
        },
      ],
    };
  }

  return {
    id: 'plugin',
    label: 'Plugin',
    description: 'Site-wide plugins and their preferences.',
    visibility: 'public',
    rows: [
      {
        id: 'plugin-floating-player',
        label: 'Floating player',
        description:
          'The site-wide floating music player. It hides itself and pauses playback on tool pages such as settings, workspace and import preview.',
        controlType: 'status',
        state: 'locked',
        visibility: 'public',
        value: 'Enabled',
      },
      {
        id: 'plugin-default-rate',
        label: 'Default speed',
        description:
          'The speed only applies to the current playback and returns to 1x on reload. A default-speed preference will follow the music source and storage decision.',
        controlType: 'status',
        state: 'locked',
        visibility: 'public',
        value: '1x',
        badge: 'Pending',
      },
      {
        id: 'plugin-placement',
        label: 'Floating position',
        description: 'Edge, vertical offset and collapsed shape are remembered per browser, not synced across devices.',
        controlType: 'status',
        state: 'locked',
        visibility: 'public',
        value: 'Right · remembered',
      },
    ],
  };
}
