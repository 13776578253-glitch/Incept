'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

type DashboardTableFrameProps = {
  children: ReactNode;
  maxHeight?: number;
  rowLimit?: number;
  expanded?: boolean;
};

export function DashboardTableFrame({ children, maxHeight, rowLimit, expanded = false }: DashboardTableFrameProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const measuredWidth = useRef<number | undefined>(undefined);
  const [edges, setEdges] = useState({ left: false, right: false });
  const [viewportHeight, setViewportHeight] = useState<number>();

  const updateEdges = () => {
    const element = scrollRef.current;
    if (!element) return;
    const left = element.scrollLeft > 1;
    const right = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
    setEdges(previous => previous.left === left && previous.right === right ? previous : { left, right });
  };

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const table = element.querySelector('table');
    const measure = () => {
      if (rowLimit && table && (!expanded || measuredWidth.current !== element.offsetWidth)) {
        measuredWidth.current = element.offsetWidth;
        const rows = table.tBodies[0]?.rows;
        const lastRow = rows?.[Math.min(rows.length, rowLimit) - 1];
        // Keep the first page's actual height, including wrapped cells and the horizontal scrollbar.
        // Expanded rows can change automatic column widths, so only remeasure on a viewport resize.
        const height = lastRow
          ? Math.ceil(lastRow.getBoundingClientRect().bottom - table.getBoundingClientRect().top
            + element.offsetHeight - element.clientHeight)
          : undefined;
        setViewportHeight(height && height > 0 ? height : undefined);
      }
      updateEdges();
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, [children, rowLimit, expanded]);

  useLayoutEffect(() => {
    if (rowLimit && !expanded && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [expanded, rowLimit]);

  return (
    <div className="dashboard-table-frame" data-expandable={Boolean(rowLimit)} data-expanded={expanded}
      data-scroll-left={edges.left} data-scroll-right={edges.right}>
      <div ref={scrollRef} className="dashboard-table-scroll dashboard-subtle-scrollbar"
        style={{ maxHeight, height: rowLimit ? viewportHeight : undefined,
          overflowY: rowLimit && !expanded ? 'hidden' : 'auto' }} onScroll={updateEdges}>
        {children}
      </div>
    </div>
  );
}
