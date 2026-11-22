'use client';

import { ArrowRight, ChevronDown, Moon, Settings, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { NavigationLink as Link } from '@/components/layouts/navigation-link';
import type { PrimaryNavItem } from '@/components/layouts/navigation.types';
import { MobileSiteHeader } from '@/components/layouts/site-header-mo';
import { createSiteNavigation } from '@/components/layouts/site-navigation';
import { useAppearance } from '@/hooks/use-appearance';
import { useLanguage } from '@/hooks/use-language';
import { useMounted } from '@/hooks/use-mounted';

type DropdownState = {
  id: string;
  mode: 'hover' | 'pinned';
} | null;

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
    <svg viewBox="0 0 24 24" className="size-[1.35rem] shrink-0" fill="none" aria-hidden="true">
      <path
        d="M7 4.7A1.2 1.2 0 0 1 8.2 3.5h5.1a1.2 1.2 0 0 1 1.2 1.2v3.15a1.2 1.2 0 0 1-.53 1L8.87 12.25A1.2 1.2 0 0 1 7 11.25V4.7Z"
        fill="currentColor"
      />
      <path
        d="M17 19.3a1.2 1.2 0 0 1-1.2 1.2h-5.1a1.2 1.2 0 0 1-1.2-1.2v-3.15a1.2 1.2 0 0 1 .53-1l5.1-3.4a1.2 1.2 0 0 1 1.87 1v6.55Z"
        fill="currentColor"
      />
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
  const baseId = useId();
  const navRef = useRef<HTMLElement>(null);
  const toggleRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownState, setDropdownState] = useState<DropdownState>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [previousPathname, setPreviousPathname] = useState(pathname);
  if (previousPathname !== pathname) {
    setPreviousPathname(pathname);
    setDropdownState(null);
    setMobileOpen(false);
  }

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const hasOpenDropdown = dropdownState !== null;

  useEffect(() => {
    if (!hasOpenDropdown) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) {
        setDropdownState(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [hasOpenDropdown]);

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

  const themeButtonLabel = mounted
    ? `${t('actions.themeToggle')} (${isDark ? t('actions.light') : t('actions.dark')})`
    : t('actions.themeToggle');

  const openHoverMenu = (id: string) => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }

    setDropdownState((current) =>
      current?.id === id ? current : { id, mode: 'hover' },
    );
  };

  const scheduleCloseMenu = (id: string) => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }

    closeTimeoutRef.current = setTimeout(() => {
      setDropdownState((current) =>
        current?.id === id && current.mode === 'hover' ? null : current,
      );
    }, 80);
  };

  const closeHoverMenuImmediately = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }

    setDropdownState((current) => (current?.mode === 'hover' ? null : current));
  };

  return (
    <header className="fixed inset-x-0 top-0 z-[var(--z-header,50)] bg-[var(--color-navbar-bg)] backdrop-blur-md">
      <div className="flex h-[var(--navbar-height)] w-full items-center px-4 md:grid md:grid-cols-[1fr_auto_1fr] md:gap-6 md:px-6 xl:px-10 2xl:px-12">
        <Link
          href={`/${language}`}
          className="flex shrink-0 items-center gap-2.5 rounded-full px-1.5 py-0.5 text-[1.05rem] font-semibold tracking-[-0.03em] text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)] md:justify-self-start"
        >
          <BrandLogoIcon />
          <span>{t('brand')}</span>
        </Link>

        <nav
          ref={navRef}
          aria-label={language === 'zh' ? '主导航' : 'Primary navigation'}
          className="hidden items-center justify-center md:flex md:justify-self-center"
        >
          <ul className="flex items-center gap-1">
            {navigation.map((item) => {
              const active = isItemActive(pathname, item.matchPrefix, item.href, item.groups);
              const hasGroups = Boolean(item.groups?.length);
              const isDropdownOpen = dropdownState?.id === item.id;
              const submenuId = `${baseId}-${item.id}-submenu`;
              const activePillClass =
                'bg-[var(--color-nav-item-active)] font-medium text-[var(--color-text)] ring-1 ring-[var(--color-border-faint)]';
              const inactivePillClass =
                'text-[var(--color-nav-item)] hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)]';

              if (!hasGroups) {
                return (
                  <li
                    key={item.id}
                    className="relative"
                    onPointerEnter={closeHoverMenuImmediately}
                  >
                    <Link
                      href={item.href ?? '#'}
                      aria-current={active ? 'page' : undefined}
                      className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-[length:var(--text-sm)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)] ${
                        active ? activePillClass : inactivePillClass
                      }`}
                    >
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              }

              return (
                <li
                  key={item.id}
                  className="relative flex items-center"
                  onPointerEnter={(event) => {
                    if (
                      event.pointerType !== 'touch' &&
                      typeof window !== 'undefined' &&
                      typeof window.matchMedia === 'function' &&
                      window.matchMedia('(hover: hover)').matches
                    ) {
                      openHoverMenu(item.id);
                    }
                  }}
                  onPointerLeave={() => {
                    scheduleCloseMenu(item.id);
                  }}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setDropdownState((current) => (current?.id === item.id ? null : current));
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && isDropdownOpen) {
                      event.preventDefault();
                      setDropdownState(null);
                      toggleRefs.current[item.id]?.focus();
                    }
                  }}
                >
                  <div
                    className={`flex items-center rounded-full transition-colors ${
                      active ? activePillClass : inactivePillClass
                    } has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--color-ring-focus)]`}
                  >
                    <Link
                      href={item.href ?? '#'}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => {
                        if (closeTimeoutRef.current) {
                          clearTimeout(closeTimeoutRef.current);
                        }
                        setDropdownState(null);
                      }}
                      className={`rounded-l-full py-1.5 pl-3.5 pr-0.5 text-[length:var(--text-sm)] transition-colors focus-visible:text-[var(--color-text)] focus-visible:outline-none ${
                        active ? 'text-[var(--color-text)]' : 'text-inherit hover:text-[var(--color-text)]'
                      }`}
                    >
                      <span>{item.label}</span>
                    </Link>
                    <button
                      ref={(node) => {
                        toggleRefs.current[item.id] = node;
                      }}
                      type="button"
                      aria-expanded={isDropdownOpen}
                      aria-controls={submenuId}
                      aria-label={language === 'zh' ? `展开${item.label}子菜单` : `Toggle ${item.label} submenu`}
                      onClick={() => {
                        if (closeTimeoutRef.current) {
                          clearTimeout(closeTimeoutRef.current);
                        }
                        setDropdownState((current) =>
                          current?.id === item.id && current.mode === 'pinned'
                            ? null
                            : { id: item.id, mode: 'pinned' },
                        );
                      }}
                      className="inline-flex cursor-pointer items-center justify-center rounded-r-full py-1.5 pl-0.5 pr-2.5 text-[var(--color-nav-muted)] transition-colors hover:text-[var(--color-text)] focus-visible:bg-[var(--color-nav-item-hover)] focus-visible:text-[var(--color-text)] focus-visible:outline-none"
                    >
                      <ChevronDown
                        aria-hidden="true"
                        className={`size-3.5 transition-transform duration-150 motion-reduce:transition-none ${
                          isDropdownOpen ? 'rotate-180 text-[var(--color-text)]' : active ? 'text-[var(--color-text)]' : ''
                        }`}
                        strokeWidth={1.75}
                      />
                    </button>
                  </div>

                  <div
                    id={submenuId}
                    aria-hidden={!isDropdownOpen}
                    inert={!isDropdownOpen}
                    className={`absolute left-0 top-full z-[var(--z-header,50)] pt-2 transition-[opacity,transform,visibility] duration-150 ease-out will-change-[opacity,transform] motion-reduce:transition-none ${
                      isDropdownOpen
                        ? 'pointer-events-auto visible translate-y-0 opacity-100'
                        : 'pointer-events-none invisible -translate-y-1 opacity-0'
                    }`}
                  >
                    <div className="w-[min(19rem,calc(100vw-2rem))] space-y-0.5 overflow-hidden rounded-[var(--radius-card,14px)] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] p-1.5 shadow-[var(--shadow-nav-dropdown)]">
                      {item.groups?.flatMap((group) =>
                        group.items.map((navItem) => {
                          const subActive =
                            pathname === navItem.href ||
                            (navItem.href !== '/' && pathname.startsWith(`${navItem.href}/`));

                          return (
                            <Link
                              key={navItem.id}
                              href={navItem.href}
                              aria-current={subActive ? 'page' : undefined}
                              onClick={() => setDropdownState(null)}
                              className={`group flex items-start justify-between gap-3 rounded-[10px] px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)] ${
                                subActive
                                  ? 'bg-[var(--color-nav-item-active)] ring-1 ring-[var(--color-border-faint)]'
                                  : 'hover:bg-[var(--color-nav-item-hover)]'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 text-[length:var(--text-sm)] font-medium leading-5 text-[var(--color-text)]">
                                  <span>{navItem.label}</span>
                                  {subActive ? (
                                    <span
                                      aria-hidden="true"
                                      className="size-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
                                    />
                                  ) : null}
                                </div>
                                {navItem.description ? (
                                  <div className="mt-0.5 text-[length:var(--text-xs)] leading-4.5 text-[var(--color-nav-dropdown-description)]">
                                    {navItem.description}
                                  </div>
                                ) : null}
                              </div>
                              <ArrowRight
                                aria-hidden="true"
                                className="mt-1 size-3.5 shrink-0 text-[var(--color-nav-muted)] opacity-0 transition-opacity group-hover:opacity-100 motion-reduce:transition-none"
                                strokeWidth={1.75}
                              />
                            </Link>
                          );
                        }),
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1 md:ml-0 md:justify-self-end">
          <Link
            href={settingsHref}
            title={t('actions.settings')}
            aria-label={t('actions.settings')}
            aria-current={isSettingsActive ? 'page' : undefined}
            className={`hidden size-8.5 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)] md:inline-flex ${
              isSettingsActive
                ? 'bg-[var(--color-nav-item-active)] text-[var(--color-text)] ring-1 ring-[var(--color-border-faint)]'
                : 'text-[var(--color-nav-muted)] hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)]'
            }`}
          >
            <Settings aria-hidden="true" className="size-[1.02rem]" strokeWidth={1.75} />
          </Link>

          <button
            type="button"
            onClick={toggleSmartTheme}
            title={themeButtonLabel}
            aria-label={themeButtonLabel}
            className="hidden size-8.5 cursor-pointer items-center justify-center rounded-full text-[var(--color-nav-muted)] transition-colors hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)] md:inline-flex"
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
