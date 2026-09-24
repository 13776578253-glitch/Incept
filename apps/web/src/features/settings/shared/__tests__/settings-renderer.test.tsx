import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { SettingsSectionPanel } from '../settings-renderer';
import type { SettingsSection } from '../settings-types';

type Interactions = Omit<Parameters<typeof SettingsSectionPanel>[0], 'section'>;

function makeInteractions(overrides: Partial<Interactions> = {}): Interactions {
  return {
    theme: 'light',
    setTheme: vi.fn(),
    isThemeReady: true,
    eyeComfortFilterEnabled: false,
    setEyeComfortFilter: vi.fn(),
    isEyeComfortFilterReady: true,
    codePalette: 'vscode',
    setCodePalette: vi.fn(),
    isCodePaletteReady: true,
    language: 'zh',
    setLanguage: vi.fn(),
    ...overrides,
  };
}

// history: music 用例已迁入 @incept/music 的 music-settings-panel.test.tsx（断言逐字等价保留）

it('renders ungrouped rows without a group heading', () => {
  const section: SettingsSection = {
    id: 'appearance',
    label: '外观',
    visibility: 'public',
    rows: [
      {
        id: 'theme',
        label: '主题',
        description: '选择站点主题',
        controlType: 'theme-segmented',
        state: 'interactive',
        visibility: 'public',
      },
    ],
  };

  render(<SettingsSectionPanel section={section} {...makeInteractions()} />);

  expect(screen.getByRole('heading', { name: '主题' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '播放器' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '亮色' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '跟随系统' })).toBeInTheDocument();
});

it('renders status, button and input rows as static controls', () => {
  const section: SettingsSection = {
    id: 'ai',
    label: '模型',
    visibility: 'public',
    rows: [
      {
        id: 'status-row',
        label: '连接状态',
        description: '当前连接',
        controlType: 'status',
        state: 'interactive',
        visibility: 'public',
        value: '已连接',
      },
      {
        id: 'button-row',
        label: '同步',
        description: '手动触发一次同步',
        controlType: 'button',
        state: 'locked',
        visibility: 'public',
        value: '稍后',
        actionLabel: '立即同步',
      },
      {
        id: 'input-row',
        label: '密钥',
        description: '粘贴访问密钥',
        controlType: 'input',
        state: 'locked',
        visibility: 'public',
        placeholder: '粘贴密钥',
      },
    ],
  };

  render(<SettingsSectionPanel section={section} {...makeInteractions()} />);

  expect(screen.getByText('已连接')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '立即同步' })).toBeDisabled();
  expect(screen.getByPlaceholderText('粘贴密钥')).toBeDisabled();
});
