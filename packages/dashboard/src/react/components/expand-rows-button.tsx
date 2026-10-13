'use client';

import { useLayoutEffect, useRef } from 'react';

type ExpandRowsButtonProps = {
  expanded: boolean;
  count: number;
  limit: number;
  expandLabel: string;
  collapseLabel: string;
  onToggle: () => void;
  preservePagePosition?: boolean;
};

export function ExpandRowsButton({ expanded, count, limit, expandLabel, collapseLabel, onToggle, preservePagePosition = false }: ExpandRowsButtonProps) {
  const footerRef = useRef<HTMLDivElement>(null);
  const collapseTarget = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (expanded || collapseTarget.current === null) return;
    window.scrollTo({ top: collapseTarget.current, behavior: 'instant' });
    collapseTarget.current = null;
    const heading = footerRef.current?.parentElement?.querySelector('h3');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [expanded]);

  const toggle = () => {
    if (expanded && !preservePagePosition) {
      const card = footerRef.current?.parentElement;
      const bounds = card?.getBoundingClientRect();
      if (bounds && bounds.height > 0 && bounds.top < 96) {
        collapseTarget.current = Math.max(0, window.scrollY + bounds.top - 96);
      }
    }
    onToggle();
  };

  if (count <= limit) return null;
  return (
    <div ref={footerRef} className="dashboard-expand-footer">
      <button type="button" className="dashboard-expand-button" aria-expanded={expanded} onClick={toggle}>
        {expanded ? collapseLabel : expandLabel}
      </button>
    </div>
  );
}
