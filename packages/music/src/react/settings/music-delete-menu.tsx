'use client';

import { useEffect, useRef, useState } from 'react';

import type { MusicAdminCopy } from './music-admin-copy';

// 右键菜单的删除目标：坐标 + 两种提示文案
export type MusicDeleteTarget = {
  id: string;
  // 菜单顶部显示
  title: string;
  // 二次确认时显示
  confirm: string;
  x: number;
  y: number;
};

const menuMinWidth = 136;
const menuMaxWidth = 240;
const menuMaxHeight = 168;

export function musicDeleteTargetFromEvent(
  event: { clientX: number; clientY: number },
  target: { id: string; title: string; confirm: string },
): MusicDeleteTarget {
  return {
    ...target,
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuMaxWidth - 8)),
    y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuMaxHeight - 8)),
  };
}

export function MusicDeleteMenu({
  target,
  copy,
  isBusy,
  onClose,
  onConfirm,
}: {
  target: MusicDeleteTarget | null;
  copy: MusicAdminCopy;
  isBusy: boolean;
  onClose: () => void;
  onConfirm: (id: string) => void;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsConfirming(false);
  }, [target]);

  useEffect(() => {
    if (!target) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    // 页面滚动后菜单会与行脱节，收起
    const closeOnScroll = () => onClose();

    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('scroll', closeOnScroll, true);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('scroll', closeOnScroll, true);
    };
  }, [target, onClose]);

  if (target === null) {
    return null;
  }

  return (
    <div
      ref={rootRef}
      role="menu"
      aria-label={copy.deleteAction}
      style={{ left: target.x, top: target.y }}
      className="fixed z-40 w-max min-w-[9rem] max-w-[16rem] rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg)] p-2 shadow-[var(--shadow-nav-dropdown)] backdrop-blur-md"
    >
      <p className="truncate px-2 pb-1 pt-0.5 text-[0.7rem] font-medium leading-4 text-[var(--color-nav-muted)]">
        {target.title}
      </p>

      {isConfirming ? (
        <div className="space-y-2 px-1 pb-1 pt-1">
          <p className="text-xs leading-4.5 text-[var(--color-nav-dropdown-description)]">
            {target.confirm}
          </p>
          <div className="flex items-center gap-1.5 pt-0.5">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onConfirm(target.id)}
              className="inline-flex min-h-7 items-center justify-center rounded-full border border-[var(--badge-rose-border)] bg-[var(--badge-rose-bg)] px-3 text-[0.75rem] font-medium text-[var(--badge-rose-fg)] shadow-[var(--shadow-card-sm)] transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
            >
              {copy.actionDeleteConfirm}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-7 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-[0.75rem] font-medium text-[var(--color-nav-dropdown-description)] shadow-[var(--shadow-card-sm)] transition-all hover:bg-[color:var(--color-row-hover-bg)] hover:text-[var(--color-text)]"
            >
              {copy.actionCancel}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          role="menuitem"
          onClick={() => setIsConfirming(true)}
          className="flex w-full items-center rounded-[9px] px-2.5 py-1.5 text-left text-[0.8125rem] font-medium text-[var(--badge-rose-fg)] transition-colors hover:bg-[var(--badge-rose-bg)]"
        >
          {copy.deleteAction}
        </button>
      )}
    </div>
  );
}
