import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { MusicSettingsPanel } from '../music-settings-panel';

// history: 原 settings-renderer 的 4 个 music 用例在偏好内移后随迁至本套件，保持断言等价
const preferences = vi.hoisted(() => ({
  playbackRateLocked: true,
  rememberPlacement: true,
  playbackMode: 'off' as string,
  isReady: true,
  setPlaybackRateLocked: vi.fn(),
  setRememberPlacement: vi.fn(),
  setPlaybackMode: vi.fn(),
}));

vi.mock('../../preferences/use-music-player-preferences', () => ({
  useMusicPlayerPreferences: () => preferences,
}));

beforeEach(() => {
  preferences.playbackRateLocked = true;
  preferences.rememberPlacement = true;
  preferences.playbackMode = 'off';
  preferences.isReady = true;
  preferences.setPlaybackRateLocked.mockClear();
  preferences.setRememberPlacement.mockClear();
  preferences.setPlaybackMode.mockClear();
});

it('renders the music section with its second-level group heading', () => {
  render(<MusicSettingsPanel locale="zh" data={null} />);

  expect(screen.getByRole('heading', { name: '音乐' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '播放器' })).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: '锁定' })).toBeChecked();
  expect(screen.getByRole('switch', { name: '开启' })).toBeChecked();
  expect(screen.getByRole('button', { name: '单曲' })).toBeInTheDocument();
});

it('toggles a music switch with the negated value', async () => {
  const user = userEvent.setup();

  render(<MusicSettingsPanel locale="en" data={null} />);

  await user.click(screen.getByRole('switch', { name: 'Locked' }));

  expect(preferences.setPlaybackRateLocked).toHaveBeenCalledWith(false);

  await user.click(screen.getByRole('switch', { name: 'On' }));

  expect(preferences.setRememberPlacement).toHaveBeenCalledWith(false);
});

// 分段控件的选中态只体现在 className 上：没有 aria-pressed/aria-checked 可查，因此断言的是回调
it('selects a playback mode through the segmented control', async () => {
  const user = userEvent.setup();

  render(<MusicSettingsPanel locale="zh" data={null} />);

  await user.click(screen.getByRole('button', { name: '循环' }));

  expect(preferences.setPlaybackMode).toHaveBeenCalledWith('all');
});

it('disables the music controls until the preferences are ready', () => {
  preferences.isReady = false;

  render(<MusicSettingsPanel locale="zh" data={null} />);

  for (const control of screen.getAllByRole('switch')) {
    expect(control).toBeDisabled();
  }

  expect(screen.getByRole('button', { name: '顺序' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '随机' })).toBeDisabled();
});

it('keeps the management panel hidden for non-owner data', () => {
  render(<MusicSettingsPanel locale="zh" data={null} />);

  expect(screen.queryByText('曲库')).not.toBeInTheDocument();
});
