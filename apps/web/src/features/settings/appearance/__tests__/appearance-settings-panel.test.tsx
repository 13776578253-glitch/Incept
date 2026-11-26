import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppearanceProvider } from '@/components/base/appearance-provider';
import { DocsCodePaletteProvider } from '@/components/base/docs-code-palette-provider';
import { dispatchSettingsNavigate } from '../../shared/settings-search-index';
import { AppearanceSettingsPanel } from '../appearance-settings-panel';

const mocks = vi.hoisted(() => ({ locale: 'zh' as 'zh' | 'en', refresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => mocks.locale,
}));

vi.mock('@/hooks/use-language', () => ({
  useLanguage: () => ({
    language: mocks.locale,
    setLanguage: vi.fn(),
  }),
}));

function renderPanel() {
  return render(
    <AppearanceProvider>
      <DocsCodePaletteProvider>
        <AppearanceSettingsPanel />
      </DocsCodePaletteProvider>
    </AppearanceProvider>,
  );
}

describe('AppearanceSettingsPanel', () => {
  beforeEach(() => {
    mocks.locale = 'zh';
    mocks.refresh.mockClear();
    window.localStorage.clear();
    document.cookie = 'incept-code-palette=; Path=/; Max-Age=0';
    document.documentElement.className = '';
    for (const attr of [
      'data-theme-preset',
      'data-accent',
      'data-accent-contrast',
      'data-contrast',
      'data-font',
      'data-font-size',
      'data-docs-font',
      'data-docs-font-size',
      'data-docs-line-height',
      'data-docs-image-scale',
      'data-docs-code-accent',
      'data-docs-inline-code-accent',
      'data-code-palette',
    ]) {
      document.documentElement.removeAttribute(attr);
    }
  });

  it('renders all 6 theme preset cards and updates preset and dark polarity', async () => {
    const user = userEvent.setup();
    renderPanel();

    for (const name of ['默认', '暖纸', 'Latte', 'Mocha', 'Rosé Pine Dawn', 'Rosé Pine']) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument();
    }

    await user.click(screen.getByRole('radio', { name: 'Mocha' }));
    expect(document.documentElement).toHaveAttribute('data-theme-preset', 'catppuccin-mocha');
    expect(document.documentElement).toHaveClass('dark');

    await user.click(screen.getByRole('radio', { name: 'Rosé Pine Dawn' }));
    expect(document.documentElement).toHaveAttribute('data-theme-preset', 'rose-pine-dawn');
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('switches back to default preset when selecting explicit light or dark mode', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('radio', { name: '暖纸' }));
    expect(document.documentElement).toHaveAttribute('data-theme-preset', 'warm-paper');

    await user.click(screen.getByRole('button', { name: '暗色' }));
    expect(document.documentElement).toHaveAttribute('data-theme-preset', 'default');
    expect(document.documentElement).toHaveClass('dark');
    expect(window.localStorage.getItem('incept-color-scheme')).toBe('dark');

    await user.click(screen.getByRole('button', { name: '跟随系统' }));
    expect(window.localStorage.getItem('incept-color-scheme')).toBeNull();
  });

  it('updates accent, contrast, font, font size, and code palette without locking code palette', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('radio', { name: '暖纸' }));
    await user.click(screen.getByRole('combobox', { name: '强调色' }));
    await user.click(await screen.findByRole('option', { name: '柔雾蓝' }));
    expect(document.documentElement).toHaveAttribute('data-accent', 'mist-blue');
    expect(document.documentElement).toHaveAttribute('data-accent-contrast', 'default');

    const accentContrastGroup = screen.getByRole('group', { name: '强调色对比度' });
    await user.click(within(accentContrastGroup).getByRole('button', { name: '增强' }));
    expect(document.documentElement).toHaveAttribute('data-accent-contrast', 'strong');
    expect(window.localStorage.getItem('incept-accent-contrast')).toBe('strong');
    expect(document.cookie).toContain('incept-accent-contrast=strong');

    const contrastGroup = screen.getByRole('group', { name: '界面对比度' });
    await user.click(within(contrastGroup).getByRole('button', { name: '增强' }));
    expect(document.documentElement).toHaveAttribute('data-contrast', 'strong');

    await user.click(screen.getByRole('combobox', { name: '界面字体' }));
    await user.click(await screen.findByRole('option', { name: '编辑衬线' }));
    expect(document.documentElement).toHaveAttribute('data-font', 'serif');

    await user.click(screen.getByRole('combobox', { name: '全局字号' }));
    await user.click(await screen.findByRole('option', { name: '16px' }));
    expect(document.documentElement).toHaveAttribute('data-font-size', '16');

    await user.click(screen.getByRole('button', { name: '高级' }));

    const codePaletteTrigger = screen.getByRole('combobox', { name: '代码块配色' });
    expect(codePaletteTrigger).not.toBeDisabled();
    await user.click(codePaletteTrigger);
    await user.click(await screen.findByRole('option', { name: 'VS Code' }));
    expect(document.documentElement).toHaveAttribute('data-code-palette', 'vscode');
    expect(document.cookie).toContain('incept-code-palette=vscode');
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('toggles collapsible live code preview and updates preview colors across palettes', async () => {
    const user = userEvent.setup();
    renderPanel();

    const advancedToggle = screen.getByRole('button', { name: '高级' });
    expect(advancedToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('combobox', { name: '文档图片缩放' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '代码块配色' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '行内代码强调色' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '代码块强调色' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '代码预览' })).not.toBeInTheDocument();

    await user.click(advancedToggle);
    expect(advancedToggle).toHaveAttribute('aria-expanded', 'true');

    const toggle = screen.getByRole('button', { name: '代码预览' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/useAppearance/)).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/useAppearance/)).toBeInTheDocument();

    const trigger = screen.getByRole('combobox', { name: '代码块配色' });
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'VS Code' }));

    const preview = screen.getByText(/useAppearance/).closest('pre');
    expect(preview).toHaveAttribute('data-preview-palette', 'vscode-light');
    expect(screen.getAllByText('const')[0]).toHaveStyle({ color: 'rgb(0, 0, 255)' });

    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'Vitesse' }));
    expect(preview).toHaveAttribute('data-preview-palette', 'vitesse-light');
    expect(screen.getAllByText('const')[0]).toHaveStyle({ color: 'rgb(30, 117, 79)' });
  });

  it('keeps basic docs typography visible while folding advanced options with reset and search auto-expand', async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(screen.getByRole('combobox', { name: '文档字体' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '文档字号' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '文档行距' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '文档图片缩放' })).not.toBeInTheDocument();

    const resetButton = screen.getByRole('button', { name: '重置为默认设置' });
    expect(resetButton).toBeDisabled();

    act(() => {
      dispatchSettingsNavigate({
        sectionId: 'appearance',
        anchorId: 'appearance-docs-image-scale',
      });
    });
    expect(screen.getByRole('button', { name: '高级' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('combobox', { name: '文档图片缩放' })).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: '文档字体' }));
    await user.click(await screen.findByRole('option', { name: /编辑衬线/ }));
    expect(document.documentElement).toHaveAttribute('data-docs-font', 'serif');
    expect(window.localStorage.getItem('incept-docs-font')).toBe('serif');
    expect(document.cookie).toContain('incept-docs-font=serif');

    await user.click(screen.getByRole('combobox', { name: '文档字号' }));
    await user.click(await screen.findByRole('option', { name: '12px' }));
    expect(document.documentElement).toHaveAttribute('data-docs-font-size', '12');
    expect(window.localStorage.getItem('incept-docs-font-size')).toBe('12');
    expect(document.cookie).toContain('incept-docs-font-size=12');

    await user.click(screen.getByRole('button', { name: '舒展' }));
    expect(document.documentElement).toHaveAttribute('data-docs-line-height', 'relaxed');
    expect(window.localStorage.getItem('incept-docs-line-height')).toBe('relaxed');
    expect(document.cookie).toContain('incept-docs-line-height=relaxed');

    await user.click(screen.getByRole('combobox', { name: '文档图片缩放' }));
    await user.click(await screen.findByRole('option', { name: '80%' }));
    expect(document.documentElement).toHaveAttribute('data-docs-image-scale', '80');
    expect(window.localStorage.getItem('incept-docs-image-scale')).toBe('80');
    expect(document.cookie).toContain('incept-docs-image-scale=80');

    await user.click(screen.getByRole('combobox', { name: '行内代码强调色' }));
    await user.click(await screen.findByRole('option', { name: '鼠尾草' }));
    expect(document.documentElement).toHaveAttribute('data-docs-inline-code-accent', 'sage');
    expect(window.localStorage.getItem('incept-docs-inline-code-accent')).toBe('sage');
    expect(document.cookie).toContain('incept-docs-inline-code-accent=sage');

    await user.click(screen.getByRole('combobox', { name: '行内代码强调色' }));
    await user.click(await screen.findByRole('option', { name: '关闭' }));
    expect(document.documentElement).toHaveAttribute('data-docs-inline-code-accent', 'none');

    await user.click(screen.getByRole('combobox', { name: '代码块强调色' }));
    await user.click(await screen.findByRole('option', { name: '柔雾蓝' }));
    expect(document.documentElement).toHaveAttribute('data-docs-code-accent', 'mist-blue');
    expect(window.localStorage.getItem('incept-docs-code-accent')).toBe('mist-blue');
    expect(document.cookie).toContain('incept-docs-code-accent=mist-blue');

    await user.click(screen.getByRole('combobox', { name: '代码块强调色' }));
    await user.click(await screen.findByRole('option', { name: '关闭' }));
    expect(document.documentElement).toHaveAttribute('data-docs-code-accent', 'none');

    expect(resetButton).not.toBeDisabled();
    await user.click(resetButton);
    expect(document.documentElement).toHaveAttribute('data-docs-font', 'inherit');
    expect(document.documentElement).toHaveAttribute('data-docs-font-size', 'inherit');
    expect(document.documentElement).toHaveAttribute('data-docs-line-height', 'comfortable');
    expect(document.documentElement).toHaveAttribute('data-docs-image-scale', '90');
    expect(document.documentElement).toHaveAttribute('data-docs-inline-code-accent', 'inherit');
    expect(document.documentElement).toHaveAttribute('data-docs-code-accent', 'inherit');
    expect(resetButton).toBeDisabled();
  });
});
