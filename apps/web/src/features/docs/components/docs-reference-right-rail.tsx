'use client';

import { useEffect, useMemo, useState } from 'react';
import type { MockDocsOutlineItem } from '@/lib/mock/shared/mock-types';

type DocsReferenceRightRailProps = {
  items: MockDocsOutlineItem[];
  label: string;
};

export function DocsReferenceRightRail({
  items,
  label,
}: DocsReferenceRightRailProps) {
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const [activeId, setActiveId] = useState(items[0]?.id ?? '');

  useEffect(() => {
    if (!itemIds.length) return;

    const syncActiveSection = () => {
      const offset = 132;
      const scrollPosition = window.scrollY + offset;
      const sections = itemIds
        .map((id) => {
          const element = document.getElementById(id);
          if (!element) return null;

          return {
            id,
            top: element.getBoundingClientRect().top + window.scrollY,
          };
        })
        .filter((section): section is { id: string; top: number } => section !== null);

      if (!sections.length) {
        setActiveId(itemIds[0]);
        return;
      }

      const pageBottom = window.scrollY + window.innerHeight;
      const documentBottom = document.documentElement.scrollHeight;

      if (pageBottom >= documentBottom - 4) {
        setActiveId(sections[sections.length - 1].id);
        return;
      }

      if (scrollPosition < sections[0].top) {
        setActiveId(sections[0].id);
        return;
      }

      const currentSection =
        [...sections].reverse().find((section) => scrollPosition >= section.top) ??
        sections[0];

      setActiveId(currentSection.id);
    };

    syncActiveSection();
    window.addEventListener('scroll', syncActiveSection, { passive: true });
    window.addEventListener('resize', syncActiveSection);

    return () => {
      window.removeEventListener('scroll', syncActiveSection);
      window.removeEventListener('resize', syncActiveSection);
    };
  }, [itemIds]);

  if (!items.length) {
    return null;
  }

  return (
    <nav
      aria-label={label}
      className="block max-h-[calc(100vh-var(--navbar-height)-3rem)] overflow-y-auto pr-2"
    >
      <p className="mb-4 pl-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-soft)]">
        {label}
      </p>
      <div className="relative">
        <div
          className="pointer-events-none absolute bottom-0 left-0 top-0 w-px"
          style={{ background: 'color-mix(in srgb, var(--color-border) 94%, transparent)' }}
        />
        <ul className="space-y-1 pl-6">
          {items.map((item) => {
            const active = item.id === activeId;

            return (
              <li key={item.id} className="relative">
                <span
                  aria-hidden="true"
                  className={`absolute -left-6 top-1 h-4 w-px bg-[var(--color-text)] transition-opacity duration-200 ${
                    active ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                <a
                  href={`#${item.id}`}
                  className={`block text-[13px] leading-6 transition-colors ${
                    active
                      ? 'font-medium text-[var(--color-text)]'
                      : 'text-[var(--color-text-soft)] hover:text-[var(--color-text-muted)]'
                  }`}
                >
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
