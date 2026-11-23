'use client';

import { NavigationLink as Link } from '@/components/layouts/navigation-link';
import type { PrimaryNavItem } from '@/components/layouts/navigation.types';

type MobileSiteHeaderProps = {
  id?: string;
  navigation: PrimaryNavItem[];
  isOpen: boolean;
  pathname: string;
  onClose: () => void;
};

function isRouteActive(pathname: string, href?: string, matchPrefix?: string) {
  if (!pathname) return false;
  if (href && pathname === href) return true;
  if (matchPrefix && matchPrefix !== '/' && pathname.startsWith(matchPrefix)) {
    return true;
  }
  return Boolean(href && href !== '/' && pathname.startsWith(`${href}/`));
}

// 移动端（<768px）轻盈下拉导航列表，与桌面顶栏下拉面板视觉同源
export function MobileSiteHeader({
  id,
  navigation,
  isOpen,
  pathname,
  onClose,
}: MobileSiteHeaderProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 top-[var(--navbar-height)] z-40 bg-black/15 md:hidden"
      />
      <div
        id={id}
        className="relative z-50 max-h-[calc(100dvh-var(--navbar-height))] overflow-y-auto border-t border-[var(--color-border-faint)] bg-[var(--color-nav-dropdown-bg)] px-4 py-3 shadow-[var(--shadow-nav-dropdown)] md:hidden"
      >
        <ul className="space-y-1">
          {navigation.map((item) => {
            const primaryActive = isRouteActive(pathname, item.href, item.matchPrefix);
            const subItems = item.groups?.flatMap((group) => group.items) ?? [];

            return (
              <li key={item.id}>
                <Link
                  href={item.href ?? '#'}
                  aria-current={primaryActive ? 'page' : undefined}
                  onClick={onClose}
                  className={`flex items-center justify-between rounded-[10px] px-3 py-2 text-[length:var(--text-sm)] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)] ${
                    primaryActive
                      ? 'bg-[var(--color-nav-item-active)] text-[var(--color-text)]'
                      : 'text-[var(--color-nav-item)] hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)]'
                  }`}
                >
                  <span>{item.label}</span>
                  {primaryActive ? (
                    <span
                      aria-hidden="true"
                      className="size-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
                    />
                  ) : null}
                </Link>

                {subItems.length > 0 ? (
                  <ul className="ml-3 mt-1 space-y-0.5 border-l border-[var(--color-border-faint)] pl-3">
                    {subItems.map((navItem) => {
                      const subActive = isRouteActive(pathname, navItem.href);

                      return (
                        <li key={navItem.id}>
                          <Link
                            href={navItem.href}
                            aria-current={subActive ? 'page' : undefined}
                            onClick={onClose}
                            className={`flex items-start justify-between gap-3 rounded-[9px] px-2.5 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)] ${
                              subActive
                                ? 'bg-[var(--color-nav-item-active)] text-[var(--color-text)]'
                                : 'text-[var(--color-nav-item)] hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)]'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-[length:var(--text-sm)] font-medium leading-5">
                                {navItem.label}
                              </div>
                              {navItem.description ? (
                                <p className="mt-0.5 text-[length:var(--text-xs)] leading-4 text-[var(--color-nav-dropdown-description)]">
                                  {navItem.description}
                                </p>
                              ) : null}
                            </div>
                            {subActive ? (
                              <span
                                aria-hidden="true"
                                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
                              />
                            ) : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
