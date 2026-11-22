import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppearanceProvider } from '@/components/base/appearance-provider';
import { DocsCodePaletteProvider } from '@/components/base/docs-code-palette-provider';
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
      'data-contrast',
      'data-font',
      'data-font-size',
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

    await user.click(screen.getByRole('button', { name: '增强' }));
    expect(document.documentElement).toHaveAttribute('data-contrast', 'strong');

    await user.click(screen.getByRole('combobox', { name: '界面字体' }));
    await user.click(await screen.findByRole('option', { name: '编辑衬线' }));
    expect(document.documentElement).toHaveAttribute('data-font', 'serif');

    await user.click(screen.getByRole('combobox', { name: '全局字号' }));
    await user.click(await screen.findByRole('option', { name: '16px' }));
    expect(document.documentElement).toHaveAttribute('data-font-size', '16');

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
});
