'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import type { DocsNavGroupModel, DocsNavItemModel } from '@/features/docs/shared/types';
import type { AppLocale } from '@/i18n/config/locales';
import { withLocalePath } from '@/i18n/utils/locale-path';

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
    >
      <path
        d="M7.5 4.5 12.5 10l-5 5.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </svg>
  );
}

type DocsArticleSidebarProps = {
  groups: DocsNavGroupModel[];
};

export function DocsArticleSidebar({ groups }: DocsArticleSidebarProps) {
  const locale = useLocale() as AppLocale;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(groups.map((group) => [group.id, group.defaultOpen ?? true])),
  );

  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  function renderItems(items: DocsNavItemModel[], depth = 0) {
    return items.map((item) => {
      const hasChildren = Boolean(item.children?.length);
      const isOpen = openItems[item.id] ?? true;
      const itemContent = item.href ? (
        <Link
          href={withLocalePath(locale, item.href)}
          className={`block rounded-[10px] px-2.5 py-1.5 text-[0.84rem] leading-6 transition-colors ${
            item.active
              ? 'font-medium text-[var(--color-text)]'
              : 'text-[var(--color-text-soft)] hover:text-[var(--color-text-muted)]'
          }`}
        >
          {item.label}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() =>
            setOpenItems((current) => ({
              ...current,
              [item.id]: !isOpen,
            }))
          }
          className="flex w-full items-center justify-between gap-3 px-2.5 py-1.5 text-left text-[0.84rem] leading-6 text-[var(--color-text-soft)] transition-colors hover:text-[var(--color-text)]"
        >
          <span>{item.label}</span>
          {hasChildren ? <ChevronIcon open={isOpen} /> : null}
        </button>
      );

      return (
        <li key={item.id} className="relative">
          {itemContent}
          {hasChildren && isOpen ? (
            <ul className="ml-1.5 space-y-1 pl-2">
              {renderItems(item.children ?? [], depth + 1)}
            </ul>
          ) : null}
        </li>
      );
    });
  }

  return (
    <nav
      aria-label="Docs sidebar"
      className="max-h-[calc(100vh-var(--navbar-height)-3rem)] w-full overflow-y-auto pr-2"
    >
      <div className="space-y-5 pr-4">
        {groups.map((group) => {
          const isOpen = openGroups[group.id] ?? true;

          return (
            <section key={group.id} className="space-y-2">
              <button
                type="button"
                onClick={() =>
                  setOpenGroups((current) => ({
                    ...current,
                    [group.id]: !isOpen,
                  }))
                }
                className="flex w-full items-center justify-between gap-3 text-left text-[0.84rem] font-medium text-[var(--color-text)]"
              >
                <span>{group.label}</span>
                <span className="text-[var(--color-text-soft)]">
                  <ChevronIcon open={isOpen} />
                </span>
              </button>

              {isOpen ? (
                <ul className="space-y-1 border-l border-[var(--color-border)] pl-3">
                  {renderItems(group.items)}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>
    </nav>
  );
}
