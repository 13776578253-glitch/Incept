'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createSiteNavigation } from '@/components/layouts/site-navigation';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLanguage } from '@/hooks/use-language';
import { MobileSiteHeader } from '@/components/layouts/site-header-mo';

function isItemActive(pathname: string, matchPrefix?: string, href?: string) {
  if (!pathname) return false;
  if (href && pathname === href) return true;
  if (matchPrefix && matchPrefix !== '/' && pathname.startsWith(matchPrefix)) {
    return true;
  }
  return false;
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5">
      <path
        d="M11.293 16.293a1 1 0 0 0 1.414 0l6-6a1 1 0 1 0-1.414-1.414L12 14.172 6.707 8.879a1 1 0 0 0-1.414 1.414l6 6Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SearchIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[1.08rem]">
      <path
        d="M19.14 12.94a7.97 7.97 0 0 0 .05-.94 7.97 7.97 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.28 7.28 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.22-1.12.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.97 7.97 0 0 0-.05.94c0 .32.02.63.05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.22 1.12-.53 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true" className="size-4">
      <path
        d="M11 0a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0V1a1 1 0 0 1 1-1ZM3.222 3.222a1 1 0 0 1 1.414 0L6.05 4.636A1 1 0 0 1 4.636 6.05L3.222 4.636a1 1 0 0 1 0-1.414Zm15.556 0a1 1 0 0 1 0 1.414L17.364 6.05a1 1 0 0 1-1.414-1.414l1.414-1.414a1 1 0 0 1 1.414 0ZM11 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm-5 3a5 5 0 1 1 10 0 5 5 0 0 1-10 0ZM0 11a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H1a1 1 0 0 1-1-1Zm18 0a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2h-2a1 1 0 0 1-1-1ZM6.05 15.95a1 1 0 0 1 0 1.414l-1.414 1.414a1 1 0 0 1-1.414-1.414l1.414-1.414a1 1 0 0 1 1.414 0Zm9.9 0a1 1 0 0 1 1.414 0l1.414 1.414a1 1 0 0 1-1.414 1.414L15.95 17.364a1 1 0 0 1 0-1.414ZM11 18a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1Z"
        fill="currentColor"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4">
      <path
        d="M10.784.47a1 1 0 0 1 .047.974A8 8 0 0 0 10 5c0 4.418 3.582 8 8 8h.058a1 1 0 0 1 .854 1.47A9.98 9.98 0 0 1 10 20C4.477 20 0 15.523 0 10 0 4.501 4.438.04 9.928 0a1 1 0 0 1 .856.47ZM8.41 2.158A8.034 8.034 0 0 0 2 10c0 4.418 3.582 8 8 8a7.957 7.957 0 0 0 6.352-3.135A10.03 10.03 0 0 1 8 5c0-.986.143-1.94.41-2.842Z"
        fill="currentColor"
      />
    </svg>
  );
}

function BrandLogoIcon() {
  return (
    <svg viewBox="0 0 24 16" className="size-[1.9rem] shrink-0" fill="none" aria-hidden="true">
      <path d="M1 3h14v4.2H1z" fill="currentColor" />
      <path d="M9.5 8.8H23V13H9.5z" fill="currentColor" />
      <path d="M18 3h5v4.2h-5z" fill="currentColor" />
    </svg>
  );
}

export function SiteHeader() {
  const t = useTranslations('navigation');
  const pathname = usePathname();
  const { language, setLanguage } = useLanguage();
  const { colorScheme, setColorScheme } = useColorScheme();
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setOpenDropdown(null);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const navigation = useMemo(
    () => createSiteNavigation(language, t),
    [language, t],
  );
  const activeTheme = mounted ? colorScheme : 'system';
  const nextTheme = activeTheme === 'dark' ? 'light' : 'dark';
  const isDark = mounted && activeTheme === 'dark';
  const settingsHref = `/${language}/settings`;
  const isSettingsActive = pathname === settingsHref;

  const openMenu = (id: string) => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }

    setOpenDropdown(id);
  };

  const scheduleCloseMenu = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }

    closeTimeoutRef.current = setTimeout(() => {
      setOpenDropdown(null);
    }, 180);
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[var(--color-navbar-border)] bg-[var(--color-navbar-bg)] shadow-[0_1px_0_0_var(--color-navbar-border)]">
      <div className="flex h-[var(--navbar-height)] w-full items-center px-4 md:px-6 xl:grid xl:grid-cols-[minmax(14rem,1fr)_auto_minmax(26rem,1fr)] xl:gap-10 xl:px-10 2xl:px-12">
        <Link
          href={`/${language}`}
          className="flex shrink-0 items-center gap-3 text-[1.26rem] font-bold tracking-[-0.03em] text-[var(--color-text)] xl:justify-self-start"
        >
          <BrandLogoIcon />
          <span>{t('brand')}</span>
        </Link>

        <nav className="hidden items-center justify-center gap-1 md:flex md:flex-1 md:px-6 xl:flex-none xl:px-0 xl:justify-self-center">
          {navigation.map((item) => {
            const active = isItemActive(pathname, item.matchPrefix, item.href);
            const hasGroups = Boolean(item.groups?.length);
            const isDropdownOpen = openDropdown === item.id;

            return (
              <div
                key={item.id}
                className="relative"
                onMouseEnter={() => {
                  if (hasGroups) openMenu(item.id);
                }}
                onMouseLeave={() => {
                  if (hasGroups) scheduleCloseMenu();
                }}
              >
                <Link
                  href={item.href ?? '#'}
                  aria-haspopup={hasGroups ? 'menu' : undefined}
                  aria-expanded={hasGroups ? isDropdownOpen : undefined}
                  className={`flex items-center gap-1 rounded-full px-4 py-1.5 text-[0.92rem] transition-colors ${
                    active
                      ? 'bg-[var(--color-nav-item-active)] text-[var(--color-text)]'
                      : 'text-[var(--color-nav-item)] hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)]'
                  }`}
                  onFocus={() => {
                    if (hasGroups) openMenu(item.id);
                  }}
                >
                  <span>{item.label}</span>
                  {item.showChevron ? (
                    <span className={isDropdownOpen ? 'text-[var(--color-text)]' : 'text-[var(--color-nav-muted)]'}>
                      <ChevronDownIcon />
                    </span>
                  ) : null}
                </Link>

                {hasGroups ? (
                  <div
                    className={`absolute left-0 top-full z-50 mt-2 w-max min-w-[18rem] transition-opacity duration-150 ${
                      isDropdownOpen
                        ? 'pointer-events-auto visible opacity-100'
                        : 'pointer-events-none invisible opacity-0'
                    }`}
                    onMouseEnter={() => openMenu(item.id)}
                    onMouseLeave={scheduleCloseMenu}
                  >
                    <div className="overflow-hidden rounded-[15px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] p-1 shadow-[var(--shadow-nav-dropdown)]">
                      {item.groups?.flatMap((group) =>
                        group.items.map((navItem) => (
                          <Link
                            key={navItem.id}
                            href={navItem.href}
                            className="block rounded-[11px] px-2.5 py-2 transition-colors hover:bg-[var(--color-nav-item-hover)]"
                            onClick={() => setOpenDropdown(null)}
                          >
                            <div className="flex flex-col gap-1">
                              <div className="text-[0.9rem] font-medium text-[var(--color-text)]">
                                {navItem.label}
                              </div>
                              {navItem.description ? (
                                <div className="max-w-[20rem] text-[0.82rem] leading-5 text-[var(--color-nav-dropdown-description)]">
                                  {navItem.description}
                                </div>
                              ) : null}
                            </div>
                          </Link>
                        )),
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:gap-3 xl:ml-0 xl:justify-self-end">
          <button
            type="button"
            className="hidden w-[11.5rem] items-center justify-between gap-3 rounded-full border border-[var(--color-nav-search-border)] bg-[var(--color-nav-search-bg)] px-4.5 py-2 text-[0.9rem] text-[var(--color-nav-search-placeholder)] transition-colors hover:border-[var(--color-nav-search-hover-border)] hover:bg-[var(--color-nav-search-hover-bg)] hover:text-[var(--color-text)] lg:inline-flex xl:w-[12.75rem]"
            aria-label={t('actions.search')}
          >
            <span className="truncate">{t('actions.search')}</span>
            <span className="text-[var(--color-nav-muted)]">
              <SearchIcon className="size-[1.05rem]" />
            </span>
          </button>

          <Link
            href={settingsHref}
            aria-label={t('actions.settings')}
            className={`hidden p-1.5 transition-colors md:inline-flex ${
              isSettingsActive
                ? 'rounded-full bg-[var(--color-nav-item-active)] text-[var(--color-nav-item)]'
                : 'text-[var(--color-nav-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            <SettingsIcon />
          </Link>

          <button
            type="button"
            onClick={() => setColorScheme(nextTheme)}
            aria-label={t('actions.themeToggle')}
            className="hidden text-[var(--color-nav-muted)] transition-colors hover:text-[var(--color-text)] md:inline-flex"
          >
            {isDark ? <MoonIcon /> : <SunIcon />}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((value) => !value)}
            className="inline-flex items-center text-[var(--color-nav-muted)] transition-colors hover:text-[var(--color-text)] md:hidden"
          >
            {mobileOpen ? t('actions.close') : t('actions.menu')}
          </button>
        </div>
      </div>

      <MobileSiteHeader
        navigation={navigation}
        isOpen={mobileOpen}
        settingsHref={settingsHref}
        nextThemeLabel={mounted ? (isDark ? t('actions.light') : t('actions.dark')) : t('actions.dark')}
        searchLabel={t('actions.search')}
        settingsLabel={t('actions.settings')}
        onThemeChange={() => setColorScheme(nextTheme)}
      />
    </header>
  );
}
