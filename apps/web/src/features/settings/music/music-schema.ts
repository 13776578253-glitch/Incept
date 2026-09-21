import type { AppLocale } from '@/i18n/config/locales';
import type { SettingsSection } from '../shared/settings-types';

// 音乐分区：播放器偏好与曲库管理
export function getMusicSettingsSection(locale: AppLocale): SettingsSection {
  if (locale === 'zh') {
    return {
      id: 'music',
      label: '音乐',
      description: '播放器偏好与曲库',
      visibility: 'public',
      rows: [
        {
          id: 'music-rate-lock',
          group: '播放器',
          label: '倍速锁定',
          description: '锁定后播放器固定在 1x，速度按钮仍可见但点击不会改变档位；解除后可切换 0.5x 到 2x',
          controlType: 'music-rate-lock-toggle',
          state: 'interactive',
          visibility: 'public',
          options: [
            { id: 'enabled', label: '锁定' },
            { id: 'disabled', label: '切换' },
          ],
        },
        {
          id: 'music-placement-memory',
          group: '播放器',
          label: '记住悬浮位置',
          description: '记住播放器的吸附边、垂直位置与收起形态；关闭后回到默认位置，并且不再记忆',
          controlType: 'music-placement-toggle',
          state: 'interactive',
          visibility: 'public',
          options: [
            { id: 'enabled', label: '开启' },
            { id: 'disabled', label: '关闭' },
          ],
        },
        {
          id: 'music-playback-mode',
          group: '播放器',
          label: '默认播放模式',
          description: '顺序播放在列表播完后暂停；列表循环回到第一首继续；单曲循环重复当前一首；随机播放永不停止',
          controlType: 'music-playback-mode-segmented',
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
    id: 'music',
    label: 'Music',
    description: 'Player preferences and libraries.',
    visibility: 'public',
    rows: [
      {
        id: 'music-rate-lock',
        group: 'Player',
        label: 'Speed lock',
        description:
          'Locked pins the player at 1x: the speed control stays visible but pressing it changes nothing; unlocking restores the 0.5x to 2x cycle',
        controlType: 'music-rate-lock-toggle',
        state: 'interactive',
        visibility: 'public',
        options: [
          { id: 'enabled', label: 'Locked' },
          { id: 'disabled', label: 'Switch' },
        ],
      },
      {
        id: 'music-placement-memory',
        group: 'Player',
        label: 'Remember floating position',
        description:
          'Remembers the edge, vertical offset and collapsed shape; turning it off returns the player to its default position and stops remembering',
        controlType: 'music-placement-toggle',
        state: 'interactive',
        visibility: 'public',
        options: [
          { id: 'enabled', label: 'On' },
          { id: 'disabled', label: 'Off' },
        ],
      },
      {
        id: 'music-playback-mode',
        group: 'Player',
        label: 'Default playback mode',
        description:
          'Sequential pauses when the list ends, repeat list continues from the first track, repeat one holds the current track, and shuffle never stops',
        controlType: 'music-playback-mode-segmented',
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
