import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zhNavigation from '../../../messages/zh/navigation.json';
import { SiteHeader } from '../site-header';

const mocks = vi.hoisted(() => ({
  pathname: '/zh/docs',
  searchParams: '',
  language: 'zh' as 'zh' | 'en',
  resolvedPolarity: 'light' as 'light' | 'dark',
  toggleSmartTheme: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const parts = key.split('.');
    let current: unknown = zhNavigation;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return key;
      }
    }
    return typeof current === 'string' ? current : key;
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.searchParams),
}));

vi.mock('@/hooks/use-language', () => ({
  useLanguage: () => ({
    language: mocks.language,
    setLanguage: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-appearance', () => ({
  useAppearance: () => ({
    resolvedPolarity: mocks.resolvedPolarity,
    toggleSmartTheme: mocks.toggleSmartTheme,
  }),
}));

vi.mock('@/hooks/use-mounted', () => ({
  useMounted: () => true,
}));

vi.mock('@/components/layouts/navigation-link', () => ({
  NavigationLink: ({ children, ...props }: ComponentProps<'a'>) => (
    <a {...props}>{children}</a>
  ),
}));

describe('SiteHeader', () => {
  beforeEach(() => {
    mocks.pathname = '/zh/docs';
    mocks.searchParams = '';
    mocks.language = 'zh';
    mocks.resolvedPolarity = 'light';
    mocks.toggleSmartTheme = vi.fn();
  });

  it('renders primary nav links without aria-haspopup="menu" and marks active route', () => {
    render(<SiteHeader />);

    const nav = screen.getByRole('navigation', { name: '主导航' });
    const docsLink = within(nav).getByRole('link', { name: '文档' });
    const roadmapLink = within(nav).getByRole('link', { name: '路线图' });
    const dashboardLink = within(nav).getByRole('link', { name: '仪表盘' });
    const aboutLink = within(nav).getByRole('link', { name: '关于' });

    expect(docsLink).toHaveAttribute('href', '/zh/docs');
    expect(docsLink).toHaveAttribute('aria-current', 'page');
    expect(roadmapLink).toHaveAttribute('href', '/zh/roadmap');
    expect(roadmapLink).not.toHaveAttribute('aria-current');
    expect(dashboardLink).toHaveAttribute('href', '/zh/dashboard');
    expect(aboutLink).toHaveAttribute('href', '/zh/about');
    expect(nav.querySelectorAll('[aria-haspopup="menu"]')).toHaveLength(0);
  });

  it('toggles docs submenu with disclosure button, closes on Escape, and restores focus', async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);

    const toggle = screen.getByRole('button', { name: '展开文档子菜单' });
    const submenuId = toggle.getAttribute('aria-controls');
    expect(submenuId).toBeTruthy();

    const submenu = document.getElementById(submenuId!);
    expect(submenu).toHaveAttribute('aria-hidden', 'true');
    expect(submenu).toHaveAttribute('inert');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(submenu).toHaveAttribute('aria-hidden', 'false');
    expect(submenu).not.toHaveAttribute('inert');
    expect(within(submenu!).getByRole('link', { name: /随笔/ })).toHaveAttribute('href', '/zh/notes');

    fireEvent.keyDown(toggle.closest('li')!, { key: 'Escape' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(submenu).toHaveAttribute('aria-hidden', 'true');
    expect(submenu).toHaveAttribute('inert');
    expect(toggle).toHaveFocus();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('link', { name: '路线图' }));
    fireEvent.blur(toggle.closest('li')!, {
      relatedTarget: screen.getByRole('link', { name: '路线图' }),
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('pins submenu open when clicked during mouse hover preview and closes on second click', async () => {
    const user = userEvent.setup();
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(hover: hover)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    try {
      render(<SiteHeader />);

      const toggle = screen.getByRole('button', { name: '展开文档子菜单' });
      const listItem = toggle.closest('li')!;
      fireEvent.pointerEnter(listItem, { pointerType: 'mouse' });
      expect(toggle).toHaveAttribute('aria-expanded', 'true');

      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');

      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('preserves returnTo on settings link, highlights active settings, and triggers smart theme toggle', async () => {
    const user = userEvent.setup();
    mocks.pathname = '/zh/roadmap';
    mocks.searchParams = 'project=alpha';

    const { rerender } = render(<SiteHeader />);
    const settingsLink = screen.getByRole('link', { name: '设置' });
    expect(settingsLink).toHaveAttribute('href', '/zh/settings?returnTo=%2Fzh%2Froadmap%3Fproject%3Dalpha');
    expect(settingsLink).not.toHaveAttribute('aria-current');

    const themeButton = screen.getByRole('button', { name: '切换主题 (深色)' });
    await user.click(themeButton);
    expect(mocks.toggleSmartTheme).toHaveBeenCalledTimes(1);

    mocks.pathname = '/zh/settings';
    mocks.searchParams = 'section=appearance';
    rerender(<SiteHeader />);
    const activeSettingsLink = screen.getByRole('link', { name: '设置' });
    expect(activeSettingsLink).toHaveAttribute('href', '/zh/settings?section=appearance');
    expect(activeSettingsLink).toHaveAttribute('aria-current', 'page');
  });

  it('closes pinned submenu when clicking primary nav link on the same route', async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);

    const nav = screen.getByRole('navigation', { name: '主导航' });
    const docsLink = within(nav).getByRole('link', { name: '文档' });
    const toggle = screen.getByRole('button', { name: '展开文档子菜单' });
    const submenuId = toggle.getAttribute('aria-controls');
    const submenu = document.getElementById(submenuId!);

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(submenu).toHaveAttribute('aria-hidden', 'false');
    expect(submenu).not.toHaveAttribute('inert');

    await user.click(docsLink);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(submenu).toHaveAttribute('aria-hidden', 'true');
    expect(submenu).toHaveAttribute('inert');
  });

  it('closes hover-preview submenu immediately when hovering an adjacent nav item while keeping pinned submenu open', async () => {
    const user = userEvent.setup();
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(hover: hover)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    try {
      render(<SiteHeader />);

      const toggle = screen.getByRole('button', { name: '展开文档子菜单' });
      const docsItem = toggle.closest('li')!;
      const roadmapItem = screen.getByRole('link', { name: '路线图' }).closest('li')!;

      fireEvent.pointerEnter(docsItem, { pointerType: 'mouse' });
      expect(toggle).toHaveAttribute('aria-expanded', 'true');

      fireEvent.pointerEnter(roadmapItem, { pointerType: 'mouse' });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');

      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');

      fireEvent.pointerEnter(roadmapItem, { pointerType: 'mouse' });
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('toggles redesigned mobile icon menu dropdown, collapses nested groups, avoids double active dots, and closes on link click or Escape', async () => {
    const user = userEvent.setup();
    mocks.pathname = '/zh/docs';
    render(<SiteHeader />);

    expect(screen.getByRole('link', { name: '设置' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '切换主题 (深色)' })).toBeInTheDocument();

    const menuToggle = screen.getByRole('button', { name: '菜单' });
    expect(menuToggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById('mobile-site-navigation')).toBeNull();

    await user.click(menuToggle);
    expect(screen.getByRole('button', { name: '关闭' })).toHaveAttribute('aria-expanded', 'true');

    const mobileDropdown = document.getElementById('mobile-site-navigation')!;
    expect(mobileDropdown).not.toBeNull();

    // Defaults to collapsed: child routes are hidden and parent row holds the active indicator dot
    const docsGroupButton = within(mobileDropdown).getByRole('button', { name: '文档' });
    expect(docsGroupButton).toHaveAttribute('aria-expanded', 'false');
    expect(within(mobileDropdown).queryByRole('link', { name: /随笔/ })).toBeNull();
    expect(mobileDropdown.querySelectorAll('[data-mobile-nav-active-dot]')).toHaveLength(1);
    expect(within(docsGroupButton.parentElement!).getByRole('button')).toContainElement(
      mobileDropdown.querySelector('[data-mobile-nav-active-dot="parent"]') as HTMLElement,
    );

    // Expanding moves the active dot exclusively to the active child route (no duplicate dots)
    await user.click(docsGroupButton);
    expect(docsGroupButton).toHaveAttribute('aria-expanded', 'true');
    expect(mobileDropdown.querySelector('[data-mobile-nav-active-dot="parent"]')).toBeNull();
    expect(mobileDropdown.querySelectorAll('[data-mobile-nav-active-dot]')).toHaveLength(1);
    expect(within(mobileDropdown).getByRole('link', { name: /文档/ })).toHaveAttribute('aria-current', 'page');

    await user.click(within(mobileDropdown).getByRole('link', { name: /随笔/ }));
    expect(document.getElementById('mobile-site-navigation')).toBeNull();

    // Reopening resets the accordion group back to collapsed
    await user.click(screen.getByRole('button', { name: '菜单' }));
    const reopenedDropdown = document.getElementById('mobile-site-navigation')!;
    expect(within(reopenedDropdown).getByRole('button', { name: '文档' })).toHaveAttribute('aria-expanded', 'false');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.getElementById('mobile-site-navigation')).toBeNull();
  });
});
