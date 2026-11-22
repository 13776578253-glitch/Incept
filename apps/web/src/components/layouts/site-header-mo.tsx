'use client';

import { NavigationLink as Link } from '@/components/layouts/navigation-link';
import type { PrimaryNavItem } from '@/components/layouts/navigation.types';

type MobileSiteHeaderProps = {
  id?: string;
  navigation: PrimaryNavItem[];
  isOpen: boolean;
  settingsHref: string;
  nextThemeLabel: string;
  settingsLabel: string;
  onThemeChange: () => void;
};

export function MobileSiteHeader({
  id,
  navigation,
  isOpen,
  settingsHref,
  nextThemeLabel,
  settingsLabel,
  onThemeChange,
}: MobileSiteHeaderProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      id={id}
      className="max-h-[calc(100dvh-var(--navbar-height))] overflow-y-auto border-t border-[var(--color-navbar-border)] bg-[var(--color-navbar-bg)] px-5 py-4 md:hidden"
    >
      <div className="space-y-4">
        <Link
          href={settingsHref}
          className="flex w-full items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-card)] px-4 py-2 text-sm font-medium text-[var(--color-text)] shadow-[var(--shadow-card-sm)]"
        >
          {settingsLabel}
        </Link>

        {navigation.map((item) => (
          <div
            key={item.id}
            className="rounded-[var(--radius-lg,18px)] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] p-3"
          >
            <Link
              href={item.href ?? '#'}
              className="text-sm font-medium text-[var(--color-text)]"
            >
              {item.label}
            </Link>
            {item.groups?.length ? (
              <div className="mt-3 space-y-2 border-t border-[var(--color-navbar-border)] pt-3">
                {item.groups.flatMap((group) =>
                  group.items.map((navItem) => (
                    <Link
                      key={navItem.id}
                      href={navItem.href}
                      className="block rounded-[var(--radius-md,10px)] p-2 hover:bg-[var(--color-nav-item-hover)]"
                    >
                      <p className="text-sm text-[var(--color-text)]">
                        {navItem.label}
                      </p>
                      {navItem.description ? (
                        <p className="mt-1 text-xs leading-5 text-[var(--color-nav-dropdown-description)]">
                          {navItem.description}
                        </p>
                      ) : null}
                    </Link>
                  )),
                )}
              </div>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          onClick={onThemeChange}
          className="w-full cursor-pointer rounded-full border border-[var(--color-border)] bg-[var(--color-surface-card)] px-3 py-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-nav-item)]"
        >
          {nextThemeLabel}
        </button>
      </div>
    </div>
  );
}
