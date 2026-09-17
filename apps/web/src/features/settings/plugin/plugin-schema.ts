import type { AppLocale } from '@/i18n/config/locales';
import type { SettingsSection } from '../shared/settings-types';

// 插件分区

// 这三项偏好由 MusicPlayerPreferencesProvider 持有并持久化：
// 设置页与正在运行的播放器读的是同一份值，所以改动会立刻作用到播放中的曲目。

// TODO: 二级分组（group 字段与分段渲染）已经可用，但行 ID 仍没有插件命名空间——
// 加入第二个插件时需要处理 ID 冲突，或给行 ID 加上来源前缀。
export function getPluginSettingsSection(locale: AppLocale): SettingsSection {
  if (locale === 'zh') {
    return {
      id: 'plugin',
      label: '插件',
      description: '全站插件与偏好',
      visibility: 'public',
      rows: [
        {
          id: 'plugin-rate-lock',
          group: '音乐播放器',
          label: '倍速锁定',
          description: '锁定后播放器固定在 1x，速度按钮仍可见但点击不会改变档位；解除后可切换 0.5x 到 2x',
          controlType: 'plugin-rate-lock-toggle',
          state: 'interactive',
          visibility: 'public',
          options: [
            { id: 'enabled', label: '锁定' },
            { id: 'disabled', label: '切换' },
          ],
        },
        {
          id: 'plugin-placement-memory',
          group: '音乐播放器',
          label: '记住悬浮位置',
          description: '记住播放器的吸附边、垂直位置与收起形态；关闭后回到默认位置，并且不再记忆',
          controlType: 'plugin-placement-toggle',
          state: 'interactive',
          visibility: 'public',
          options: [
            { id: 'enabled', label: '开启' },
            { id: 'disabled', label: '关闭' },
          ],
        },
        {
          id: 'plugin-playback-mode',
          group: '音乐播放器',
          label: '默认播放模式',
          description: '顺序播放在列表播完后暂停；列表循环回到第一首继续；单曲循环重复当前一首；随机播放永不停止',
          controlType: 'plugin-playback-mode-segmented',
          state: 'interactive',
          visibility: 'public',
          options: [
            { id: 'off', label: '顺序' },
            { id: 'all', label: '循环' },
            { id: 'one', label: '单曲' },
            { id: 'shuffle', label: '随机' },
          ],
        },
      ],
    };
  }

  return {
    id: 'plugin',
    label: 'Plugin',
    description: 'Site-wide plugins and preferences',
    visibility: 'public',
    rows: [
      {
        id: 'plugin-rate-lock',
        group: 'Music player',
        label: 'Speed lock',
        description:
          'Locked pins the player at 1x: the speed control stays visible but pressing it changes nothing; unlocking restores the 0.5x to 2x cycle',
        controlType: 'plugin-rate-lock-toggle',
        state: 'interactive',
        visibility: 'public',
        options: [
          { id: 'enabled', label: 'Locked' },
          { id: 'disabled', label: 'Switch' },
        ],
      },
      {
        id: 'plugin-placement-memory',
        group: 'Music player',
        label: 'Remember floating position',
        description:
          'Remembers the edge, vertical offset and collapsed shape; turning it off returns the player to its default position and stops remembering',
        controlType: 'plugin-placement-toggle',
        state: 'interactive',
        visibility: 'public',
        options: [
          { id: 'enabled', label: 'On' },
          { id: 'disabled', label: 'Off' },
        ],
      },
      {
        id: 'plugin-playback-mode',
        group: 'Music player',
        label: 'Default playback mode',
        description:
          'Sequential pauses when the list ends, repeat list continues from the first track, repeat one holds the current track, and shuffle never stops',
        controlType: 'plugin-playback-mode-segmented',
        state: 'interactive',
        visibility: 'public',
        options: [
          { id: 'off', label: 'Sequential' },
          { id: 'all', label: 'Repeat list' },
          { id: 'one', label: 'Repeat one' },
          { id: 'shuffle', label: 'Shuffle' },
        ],
      },
    ],
  };
}
