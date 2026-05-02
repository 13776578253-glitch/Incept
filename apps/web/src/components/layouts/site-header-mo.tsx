'use client';

import Link from 'next/link';
import type { PrimaryNavItem } from '@/components/layouts/navigation.types';
import type { AppLocale } from '@/i18n/config/locales';

type MobileSiteHeaderProps = {
  navigation: PrimaryNavItem[];
  isOpen: boolean;
  createHref: string;
  nextLocale: AppLocale;
  nextThemeLabel: string;
  searchLabel: string;
  createLabel: string;
  onLanguageChange: (locale: AppLocale) => void;
  onThemeChange: () => void;
};

export function MobileSiteHeader({
  navigation,
  isOpen,
  createHref,
  nextLocale,
  nextThemeLabel,
  searchLabel,
  createLabel,
  onLanguageChange,
  onThemeChange,
}: MobileSiteHeaderProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="border-t border-[var(--color-navbar-border)] bg-[var(--color-navbar-bg)] px-5 py-4 md:hidden">
      <div className="space-y-4">
        <div className="space-y-3">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-[var(--radius-lg)] border border-[var(--color-nav-search-border)] bg-[var(--color-nav-search-bg)] px-4 py-2 text-sm text-[var(--color-nav-search-placeholder)]"
          >
            <span>{searchLabel}</span>
          </button>
          <Link
            href={createHref}
            className="flex items-center justify-center rounded-full bg-[var(--color-nav-create-bg)] px-4 py-2 text-sm font-medium text-[var(--color-nav-create-text)]"
          >
            {createLabel}
          </Link>
        </div>

        {navigation.map((item) => (
          <div
            key={item.id}
            className="rounded-[var(--radius-lg)] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] p-3"
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
                      className="block rounded-[var(--radius-md)] p-2"
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

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onLanguageChange(nextLocale)}
            className="flex-1 rounded-full border border-[var(--color-nav-search-border)] px-3 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-nav-item)]"
          >
            {nextLocale}
          </button>
          <button
            type="button"
            onClick={onThemeChange}
            className="flex-1 rounded-full border border-[var(--color-nav-search-border)] px-3 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-nav-item)]"
          >
            {nextThemeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
