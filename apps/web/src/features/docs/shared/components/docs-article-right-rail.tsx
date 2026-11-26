'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { DocsOutlineItemModel } from '@/features/docs/shared/types';

type DocsArticleRightRailProps = {
  items: DocsOutlineItemModel[];
  label: string;
  onSelect?: () => void;
  variant?: 'rail' | 'drawer';
};

function flattenOutline(items: DocsOutlineItemModel[]): DocsOutlineItemModel[] {
  return items.flatMap((item) => [item, ...(item.children ? flattenOutline(item.children) : [])]);
}

export function DocsArticleRightRail({
  items,
  label,
  onSelect,
  variant = 'rail',
}: DocsArticleRightRailProps) {
  const flatItems = useMemo(() => flattenOutline(items), [items]);
  const itemIds = useMemo(() => flatItems.map((item) => item.id), [flatItems]);
  const [activeId, setActiveId] = useState(items[0]?.id ?? '');
  const [hasHiddenOutlineItems, setHasHiddenOutlineItems] = useState(false);
  const outlineScrollRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const element = outlineScrollRef.current;

    if (!element) return;

    const syncHiddenOutlineItems = () => {
      setHasHiddenOutlineItems(
        element.scrollTop + element.clientHeight < element.scrollHeight - 1,
      );
    };

    syncHiddenOutlineItems();
    element.addEventListener('scroll', syncHiddenOutlineItems, { passive: true });
    const resizeObserver = new ResizeObserver(syncHiddenOutlineItems);
    resizeObserver.observe(element);

    return () => {
      element.removeEventListener('scroll', syncHiddenOutlineItems);
      resizeObserver.disconnect();
    };
  }, [itemIds]);

  useEffect(() => {
    const scrollContainer = outlineScrollRef.current;

    if (!scrollContainer || !activeId) return;

    const activeLink = [...scrollContainer.querySelectorAll<HTMLAnchorElement>('[data-outline-id]')]
      .find((link) => link.dataset.outlineId === activeId);

    if (!activeLink) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const activeRect = activeLink.getBoundingClientRect();
    // Keep the active row clear of the bottom fade, rather than merely in view.
    const visibleBottom = containerRect.bottom - 32;

    if (activeRect.top >= containerRect.top && activeRect.bottom <= visibleBottom) {
      return;
    }

    const nextTop = scrollContainer.scrollTop + activeRect.top - containerRect.top -
      (scrollContainer.clientHeight - activeRect.height) / 2;

    scrollContainer.scrollTo({
      top: Math.max(0, nextTop),
      behavior: 'smooth',
    });
  }, [activeId]);

  if (!items.length) {
    return null;
  }

  return (
    <nav aria-label={label} className={variant === 'rail' ? 'block pr-2' : 'block'}>
      {variant === 'rail' ? (
        <p className="mb-3.5 pl-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-soft)]">
          {label}
        </p>
      ) : null}
      <div className="relative">
        <div
          ref={outlineScrollRef}
          className={
            variant === 'rail'
              ? 'docs-right-rail-scroll max-h-[min(68vh,calc(100vh-var(--navbar-height)-9rem))] overflow-y-auto pr-2'
              : 'block'
          }
        >
          <div className="relative">
            <div
              className="pointer-events-none absolute bottom-0 left-0 top-0 w-px"
              style={{ background: 'color-mix(in srgb, var(--color-border) 94%, transparent)' }}
            />
            <ul className="space-y-1 pl-5">
              {renderOutlineItems(items, activeId, 0, onSelect)}
            </ul>
          </div>
        </div>
        {variant === 'rail' && hasHiddenOutlineItems ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-[var(--color-bg)]"
          />
        ) : null}
      </div>
    </nav>
  );
}

function renderOutlineItems(
  items: DocsOutlineItemModel[],
  activeId: string,
  depth = 0,
  onSelect?: () => void,
) {
  return items.map((item) => {
    const active = item.id === activeId;

    return (
      <li key={item.id} className="relative" style={depth ? { marginLeft: `${depth * 0.75}rem` } : undefined}>
        <span
          aria-hidden="true"
          className={`absolute top-1.5 h-3.5 w-[2px] rounded-full bg-[var(--color-accent)] transition-opacity duration-200 ${
            active ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ left: depth ? '-0.75rem' : '-1.25rem' }}
        />
        <a
          href={`#${item.id}`}
          data-outline-id={item.id}
          aria-current={active ? 'location' : undefined}
          onClick={onSelect}
          className={`block rounded-[6px] px-1.5 py-0.5 text-[13px] leading-[1.45] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)] ${
            depth === 0 ? '' : 'text-[12px]'
          } ${
            active
              ? 'font-medium text-[var(--color-text)]'
              : 'text-[var(--color-text-soft)] hover:text-[var(--color-text-muted)]'
          }`}
        >
          {item.label}
        </a>
        {item.children?.length ? (
          <ul className="space-y-1">{renderOutlineItems(item.children, activeId, depth + 1, onSelect)}</ul>
        ) : null}
      </li>
    );
  });
}
