'use client';

import { ArrowRight, ChevronDown, Moon, Settings, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { NavigationLink as Link } from '@/components/layouts/navigation-link';
import type { PrimaryNavItem } from '@/components/layouts/navigation.types';
import { MobileSiteHeader } from '@/components/layouts/site-header-mo';
import { createSiteNavigation } from '@/components/layouts/site-navigation';
import { useAppearance } from '@/hooks/use-appearance';
import { useLanguage } from '@/hooks/use-language';
import { useMounted } from '@/hooks/use-mounted';

function isItemActive(
  pathname: string,
  matchPrefix?: string,
  href?: string,
  groups?: PrimaryNavItem['groups'],
) {
  if (!pathname) return false;
  if (href && pathname === href) return true;
  if (matchPrefix && matchPrefix !== '/' && pathname.startsWith(matchPrefix)) {
    return true;
  }
  if (groups?.length) {
    for (const group of groups) {
      for (const sub of group.items) {
        if (sub.href === pathname || (sub.href !== '/' && pathname.startsWith(`${sub.href}/`))) {
          return true;
        }
      }
    }
  }
  return false;
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
  const searchParams = useSearchParams();
  const { language } = useLanguage();
  const { resolvedPolarity, toggleSmartTheme } = useAppearance();
  const mounted = useMounted();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [previousPathname, setPreviousPathname] = useState(pathname);
  if (previousPathname !== pathname) {
    setPreviousPathname(pathname);
    setOpenDropdown(null);
    setMobileOpen(false);
  }

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
  const isDark = mounted && resolvedPolarity === 'dark';
  const settingsPath = `/${language}/settings`;
  const isSettingsActive = pathname === settingsPath;
  const currentQuery = searchParams.toString();
  const currentHref = currentQuery ? `${pathname}?${currentQuery}` : pathname;
  const settingsHref = isSettingsActive
    ? currentQuery
      ? `${settingsPath}?${currentQuery}`
      : settingsPath
    : `${settingsPath}?${new URLSearchParams({ returnTo: currentHref }).toString()}`;

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
    <header className="fixed inset-x-0 top-0 z-[var(--z-header,50)] border-b border-[var(--color-navbar-border)] bg-[var(--color-navbar-bg)] backdrop-blur-md">
      <div className="flex h-[var(--navbar-height)] w-full items-center px-4 md:px-6 xl:grid xl:grid-cols-[1fr_auto_1fr] xl:gap-8 xl:px-10 2xl:px-12">
        <Link
          href={`/${language}`}
          className="flex shrink-0 items-center gap-3 text-[1.26rem] font-bold tracking-[-0.03em] text-[var(--color-text)] xl:justify-self-start"
        >
          <BrandLogoIcon />
          <span>{t('brand')}</span>
        </Link>

        <nav className="hidden items-center justify-center gap-1 md:flex md:flex-1 md:px-6 xl:flex-none xl:px-0 xl:justify-self-center">
          {navigation.map((item) => {
            const active = isItemActive(pathname, item.matchPrefix, item.href, item.groups);
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
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-1 rounded-full px-4 py-1.5 text-[0.92rem] transition-colors ${
                    active
                      ? 'bg-[var(--color-nav-item-hover)] font-medium text-[var(--color-text)]'
                      : 'text-[var(--color-nav-item)] hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)]'
                  }`}
                  onFocus={() => {
                    if (hasGroups) openMenu(item.id);
                  }}
                >
                  <span>{item.label}</span>
                  {item.showChevron ? (
                    <ChevronDown
                      aria-hidden="true"
                      className={`size-3.5 transition-transform duration-150 ${
                        isDropdownOpen ? 'rotate-180 text-[var(--color-text)]' : active ? 'text-[var(--color-text)]' : 'text-[var(--color-nav-muted)]'
                      }`}
                      strokeWidth={1.8}
                    />
                  ) : null}
                </Link>

                {hasGroups ? (
                  <div
                    className={`absolute left-0 top-full z-[var(--z-header,50)] mt-1.5 w-[min(20rem,calc(100vw-2rem))] transition-[opacity,transform] duration-150 ${
                      isDropdownOpen
                        ? 'pointer-events-auto visible translate-y-0 opacity-100'
                        : 'pointer-events-none invisible -translate-y-1 opacity-0'
                    }`}
                    onMouseEnter={() => openMenu(item.id)}
                    onMouseLeave={scheduleCloseMenu}
                  >
                    <div className="space-y-0.5 overflow-hidden rounded-[var(--radius-lg,18px)] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-popover-bg,var(--color-nav-dropdown-bg))] p-1.5 shadow-[var(--shadow-nav-dropdown)] backdrop-blur-xl">
                      {item.groups?.flatMap((group) =>
                        group.items.map((navItem) => {
                          const subActive =
                            pathname === navItem.href ||
                            (navItem.href !== '/' && pathname.startsWith(`${navItem.href}/`));

                          return (
                            <Link
                              key={navItem.id}
                              href={navItem.href}
                              className={`group block rounded-[11px] px-3 py-2 transition-all duration-[var(--duration-fast)] ${
                                subActive
                                  ? 'bg-[var(--color-pill-active-bg)] shadow-[var(--shadow-pill-active)]'
                                  : 'hover:bg-[var(--color-nav-item-hover)]'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-[0.82rem] font-medium leading-[1.15rem] text-[var(--color-text)]">
                                    {navItem.label}
                                  </div>
                                  {navItem.description ? (
                                    <div className="mt-0.5 text-[0.7rem] leading-[1.2rem] text-[var(--color-nav-dropdown-description)]">
                                      {navItem.description}
                                    </div>
                                  ) : null}
                                </div>
                                <ArrowRight
                                  aria-hidden="true"
                                  className="mt-0.5 size-3.5 shrink-0 text-[var(--color-nav-muted)] opacity-0 transition-opacity group-hover:opacity-100"
                                  strokeWidth={1.75}
                                />
                              </div>
                            </Link>
                          );
                        }),
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 md:gap-2 xl:ml-0 xl:justify-self-end">
          <Link
            href={settingsHref}
            aria-label={t('actions.settings')}
            className={`hidden size-9 items-center justify-center rounded-full transition-colors md:inline-flex ${
              isSettingsActive
                ? 'bg-[var(--color-nav-item-active)] text-[var(--color-text)]'
                : 'text-[var(--color-nav-muted)] hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)]'
            }`}
          >
            <Settings aria-hidden="true" className="size-[1.08rem]" strokeWidth={1.75} />
          </Link>

          <button
            type="button"
            onClick={toggleSmartTheme}
            aria-label={t('actions.themeToggle')}
            className="hidden size-9 cursor-pointer items-center justify-center rounded-full text-[var(--color-nav-muted)] transition-colors hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)] md:inline-flex"
          >
            {isDark ? (
              <Moon aria-hidden="true" className="size-4" strokeWidth={1.75} />
            ) : (
              <Sun aria-hidden="true" className="size-4" strokeWidth={1.75} />
            )}
          </button>

          <button
            type="button"
            aria-expanded={mobileOpen}
            aria-controls="mobile-site-navigation"
            onClick={() => setMobileOpen((value) => !value)}
            className="inline-flex min-h-9 cursor-pointer items-center rounded-full px-2.5 text-[0.875rem] font-medium text-[var(--color-nav-muted)] transition-colors hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)] md:hidden"
          >
            {mobileOpen ? t('actions.close') : t('actions.menu')}
          </button>
        </div>
      </div>

      <MobileSiteHeader
        id="mobile-site-navigation"
        navigation={navigation}
        isOpen={mobileOpen}
        settingsHref={settingsHref}
        nextThemeLabel={mounted ? (isDark ? t('actions.light') : t('actions.dark')) : t('actions.dark')}
        settingsLabel={t('actions.settings')}
        onThemeChange={toggleSmartTheme}
      />
    </header>
  );
}
