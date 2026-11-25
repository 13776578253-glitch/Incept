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

    // Switch palette style to Vivid
    await user.click(screen.getByRole('button', { name: '清透活力' }));
    expect(readDashboardPreferences().paletteStyle).toBe('vivid');
    expect(document.querySelector('[data-dashboard-palette="vivid"]')).not.toBeNull();

    // Pick a DeepSeek swatch color
    await user.click(screen.getByRole('button', { name: 'DeepSeek #0284c7' }));
    expect(readDashboardPreferences().familyColors.DeepSeek).toBe('#0284c7');

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
  });
});
