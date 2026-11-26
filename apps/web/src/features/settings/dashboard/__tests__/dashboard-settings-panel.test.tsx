import {
  readDashboardPreferences,
  recordKnownDashboardModels,
  resetDashboardPreferences,
} from '@incept/dashboard/react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardSettingsPanel } from '../dashboard-settings-panel';

const mocks = vi.hoisted(() => ({ locale: 'zh' as 'zh' | 'en' }));

vi.mock('@/hooks/use-language', () => ({
  useLanguage: () => ({
    language: mocks.locale,
    setLanguage: vi.fn(),
  }),
}));

describe('DashboardSettingsPanel', () => {
  beforeEach(() => {
    mocks.locale = 'zh';
    window.localStorage.clear();
    resetDashboardPreferences();
  });

  afterEach(() => {
    cleanup();
    resetDashboardPreferences();
    window.localStorage.clear();
  });

  it('persists palette style, family color swatch, manual pin/unpin, and resets cleanly', async () => {
    const user = userEvent.setup();
    recordKnownDashboardModels([
      { modelName: 'gpt-5', displayName: 'GPT-5', provider: 'openai' },
    ]);

    render(<DashboardSettingsPanel />);

    expect(screen.getByRole('heading', { name: '仪表盘' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '图表配色' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '固化模型与单模型配色（0 / 8）' })).toBeInTheDocument();

    // Switch Light palette style to Vivid & pick Light DeepSeek swatch
    expect(screen.getByRole('button', { name: '亮色模式' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '清透活力' }));
    expect(readDashboardPreferences().light.paletteStyle).toBe('vivid');
    expect(document.querySelector('[data-dashboard-palette="vivid"]')).not.toBeNull();

    // Pick a DeepSeek swatch color in Light mode
    await user.click(screen.getByRole('button', { name: 'DeepSeek #0284c7' }));
    expect(readDashboardPreferences().light.familyColors.DeepSeek).toBe('#0284c7');
    expect(readDashboardPreferences().dark.familyColors).toEqual({});

    // Switch to Dark mode scope and verify independent preferences
    await user.click(screen.getByRole('button', { name: '暗色模式' }));
    expect(screen.getByRole('button', { name: '跟随主题' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '柔和粉彩' }));
    await user.click(screen.getByRole('button', { name: 'DeepSeek #7dd3fc' }));
    expect(readDashboardPreferences().dark.paletteStyle).toBe('pastel');
    expect(readDashboardPreferences().dark.familyColors.DeepSeek).toBe('#7dd3fc');
    expect(readDashboardPreferences().light.familyColors.DeepSeek).toBe('#0284c7');

    // Add and pin a custom model ID
    await user.type(screen.getByRole('textbox', { name: '手动添加模型 ID' }), 'claude-sonnet');
    await user.click(screen.getByRole('button', { name: '添加并固化' }));
    expect(readDashboardPreferences().pinnedModels).toEqual(['claude-sonnet']);
    expect(screen.getByRole('heading', { name: '固化模型与单模型配色（1 / 8）' })).toBeInTheDocument();

    // Unpin claude-sonnet via the pin toggle button
    const pinnedToggle = screen.getByRole('button', { name: '已固化' });
    expect(pinnedToggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(pinnedToggle);
    expect(readDashboardPreferences().pinnedModels).toEqual([]);

    // Reset all dashboard customizations
    await user.click(screen.getByRole('button', { name: '恢复默认设置' }));
    expect(readDashboardPreferences()).toEqual({
      paletteStyle: 'theme',
      familyColors: {},
      modelColors: {},
      light: { paletteStyle: 'theme', familyColors: {}, modelColors: {} },
      dark: { paletteStyle: 'theme', familyColors: {}, modelColors: {} },
      pinnedModels: [],
    });
  });

  it('renders localized English labels and switches language cleanly', () => {
    mocks.locale = 'en';
    render(<DashboardSettingsPanel />);

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chart palette' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Theme' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Vivid' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pastel' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Data import' })).toBeNull();
  });

  it('shows cross-device data import only for Owner role', () => {
    render(<DashboardSettingsPanel isOwner />);
    expect(screen.getByRole('heading', { name: '数据导入' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开导入' })).toBeInTheDocument();
  });

  it('opens inline per-model color picker, applies theme-scoped overrides above family shades, and resets cleanly', async () => {
    const user = userEvent.setup();
    recordKnownDashboardModels([
      { modelName: 'gemini-4-hydrogen', displayName: 'gemini-4-hydrogen', provider: 'gemini' },
      { modelName: 'gemini-4-neon', displayName: 'gemini-4-neon', provider: 'gemini' },
    ]);

    render(<DashboardSettingsPanel />);

    // Open inline color picker for gemini-4-neon in Light mode
    const toggleBtn = screen.getByRole('button', { name: 'gemini-4-neon 颜色' });
    await user.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');

    // Click an accent swatch and verify Light-only persistence
    await user.click(screen.getByRole('button', { name: 'gemini-4-neon #2563eb' }));
    expect(readDashboardPreferences().light.modelColors['gemini-4-neon']).toBe('#2563eb');
    expect(readDashboardPreferences().dark.modelColors).toEqual({});

    // Edit hex input and click Apply
    const hexInput = screen.getByRole('textbox', { name: 'gemini-4-neon 十六进制颜色' });
    await user.clear(hexInput);
    await user.type(hexInput, '#cc5500');
    expect(readDashboardPreferences().light.modelColors['gemini-4-neon']).toBe('#cc5500');

    // Reset per-model override back to auto family shade
    await user.click(screen.getByRole('button', { name: '重置' }));
    expect(readDashboardPreferences().light.modelColors).toEqual({});
  });
});
