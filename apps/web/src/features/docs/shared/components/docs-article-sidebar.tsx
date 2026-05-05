'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import type { AppLocale } from '@/i18n/config/locales';
import { withLocalePath } from '@/i18n/utils/locale-path';
import type { MockDocsNavGroup } from '@/lib/mock/shared/mock-types';

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
  groups: MockDocsNavGroup[];
};

export function DocsArticleSidebar({ groups }: DocsArticleSidebarProps) {
  const locale = useLocale() as AppLocale;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(groups.map((group) => [group.id, group.defaultOpen ?? true])),
  );

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
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={withLocalePath(locale, item.href)}
                        className={`block rounded-[10px] px-2.5 py-1.5 text-[0.84rem] leading-6 transition-colors ${
                          item.active
                            ? 'bg-[var(--color-nav-item-active)] text-[var(--color-text)]'
                            : 'text-[var(--color-text-soft)] hover:text-[var(--color-text-muted)]'
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>
    </nav>
  );
}
