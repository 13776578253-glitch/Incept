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
      className="fixed z-40 w-max min-w-[8.5rem] max-w-[15rem] rounded-[9px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] p-1 shadow-[var(--shadow-nav-dropdown)]"
    >
      <p className="truncate px-2.5 pb-0.5 pt-1 text-[0.68rem] leading-4 text-[var(--color-nav-muted)]">
        {target.title}
      </p>

      {isConfirming ? (
        <div className="space-y-1.5 px-2.5 pb-1.5 pt-0.5">
          <p className="text-[0.7rem] leading-4 text-[var(--color-nav-dropdown-description)]">
            {target.confirm}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onConfirm(target.id)}
              className="inline-flex h-6 items-center justify-center rounded-[7px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-item-active)] px-2 text-[0.72rem] leading-none text-[var(--color-text)] transition-colors hover:bg-[var(--color-nav-item-hover)] disabled:opacity-50"
            >
              {copy.actionDeleteConfirm}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-6 items-center justify-center rounded-[7px] px-2 text-[0.72rem] leading-none text-[var(--color-nav-dropdown-description)] transition-colors hover:bg-[var(--color-nav-item-hover)]"
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
          className="flex w-full items-center rounded-[6px] px-2.5 py-1.5 text-left text-[0.78rem] leading-none text-[var(--color-text)] transition-colors hover:bg-[var(--color-nav-item-hover)]"
        >
          {copy.deleteAction}
        </button>
      )}
    </div>
  );
}
