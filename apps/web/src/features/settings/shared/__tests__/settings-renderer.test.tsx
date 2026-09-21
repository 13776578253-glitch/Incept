import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { getMusicSettingsSection } from '../../music/music-schema';
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
    musicPlaybackRateLocked: true,
    setMusicPlaybackRateLocked: vi.fn(),
    musicRememberPlacement: true,
    setMusicRememberPlacement: vi.fn(),
    musicPlaybackMode: 'off',
    setMusicPlaybackMode: vi.fn(),
    isMusicPreferencesReady: true,
    ...overrides,
  };
}

it('renders the music section with its second-level group heading', () => {
  render(<SettingsSectionPanel section={getMusicSettingsSection('zh')} {...makeInteractions()} />);

  expect(screen.getByRole('heading', { name: '音乐' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '播放器' })).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: '锁定' })).toBeChecked();
  expect(screen.getByRole('switch', { name: '开启' })).toBeChecked();
  expect(screen.getByRole('button', { name: '单曲' })).toBeInTheDocument();
});

it('toggles a music switch with the negated value', async () => {
  const interactions = makeInteractions();
  const user = userEvent.setup();

  render(<SettingsSectionPanel section={getMusicSettingsSection('en')} {...interactions} />);

  await user.click(screen.getByRole('switch', { name: 'Locked' }));

  expect(interactions.setMusicPlaybackRateLocked).toHaveBeenCalledWith(false);

  await user.click(screen.getByRole('switch', { name: 'On' }));

  expect(interactions.setMusicRememberPlacement).toHaveBeenCalledWith(false);
});

// 分段控件的选中态只体现在 className 上：没有 aria-pressed/aria-checked 可查，因此断言的是回调
it('selects a playback mode through the segmented control', async () => {
  const interactions = makeInteractions();
  const user = userEvent.setup();

  render(<SettingsSectionPanel section={getMusicSettingsSection('zh')} {...interactions} />);

  await user.click(screen.getByRole('button', { name: '循环' }));

  expect(interactions.setMusicPlaybackMode).toHaveBeenCalledWith('all');
});

it('disables the music controls until the preferences are ready', () => {
  render(
    <SettingsSectionPanel
      section={getMusicSettingsSection('zh')}
      {...makeInteractions({ isMusicPreferencesReady: false })}
    />,
  );

  for (const control of screen.getAllByRole('switch')) {
    expect(control).toBeDisabled();
  }

  expect(screen.getByRole('button', { name: '顺序' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '随机' })).toBeDisabled();
});

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
