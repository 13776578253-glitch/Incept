'use client';

import { useState } from 'react';
import { NavigationLink as Link } from '@/components/layouts/navigation-link';
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
  onNavigate?: () => void;
  variant?: 'rail' | 'drawer';
};

export function DocsArticleSidebar({
  groups,
  onNavigate,
  variant = 'rail',
}: DocsArticleSidebarProps) {
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
          aria-current={item.active ? 'page' : undefined}
          onClick={onNavigate}
          className={`relative block rounded-[8px] px-2.5 py-1.5 text-[0.835rem] leading-[1.45] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)] ${
            item.active
              ? 'bg-[color-mix(in_srgb,var(--color-accent)_9%,transparent)] font-medium text-[var(--color-text)]'
              : 'text-[var(--color-text-soft)] hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)]'
          }`}
        >
          {item.active ? (
            <span
              aria-hidden="true"
              className="absolute bottom-1.5 left-0 top-1.5 w-[2px] rounded-full bg-[var(--color-accent)]"
            />
          ) : null}
          {item.label}
        </Link>
      ) : (
        <button
          type="button"
          aria-expanded={hasChildren ? isOpen : undefined}
          onClick={() =>
            setOpenItems((current) => ({
              ...current,
              [item.id]: !isOpen,
            }))
          }
          className="flex w-full items-center justify-between gap-3 rounded-[8px] px-2.5 py-1.5 text-left text-[0.835rem] leading-[1.45] text-[var(--color-text-soft)] transition-colors hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)]"
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
      className={
        variant === 'rail'
          ? 'no-scrollbar max-h-[calc(100vh-var(--navbar-height)-4.5rem)] w-full overflow-y-auto pr-2'
          : 'w-full'
      }
    >
      <div className={variant === 'rail' ? 'space-y-5 pr-2' : 'space-y-5'}>
        {groups.map((group) => {
          const isOpen = openGroups[group.id] ?? true;

          return (
            <section key={group.id} className="space-y-2">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() =>
                  setOpenGroups((current) => ({
                    ...current,
                    [group.id]: !isOpen,
                  }))
                }
                className="flex w-full items-center justify-between gap-3 rounded-[8px] px-1 py-0.5 text-left text-[0.8125rem] font-semibold text-[var(--color-text)] transition-colors hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)]"
              >
                <span>{group.label}</span>
                <span className="text-[var(--color-text-soft)]">
                  <ChevronIcon open={isOpen} />
                </span>
              </button>

              {isOpen ? (
                <ul className="space-y-1 border-l border-[var(--color-border)] pl-2.5">
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
