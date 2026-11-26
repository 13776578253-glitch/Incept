'use client';

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type {
  DocsLayoutMode,
  DocsNavGroupModel,
  DocsOutlineItemModel,
} from '@/features/docs/shared/types';
import { DocsArticleRightRail } from './docs-article-right-rail';
import { DocsArticleSidebar } from './docs-article-sidebar';

type DrawerKind = 'chapters' | 'outline' | null;

// 极简合集目录图标（区别于本页大纲图标，也避免与音乐浮球混淆）
function ChaptersIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4 shrink-0">
      <path
        d="M4 5.25h4.2c1 0 1.8.8 1.8 1.8v8.2c-.55-.45-1.2-.7-1.9-.7H4V5.25Zm12 0h-4.2c-1 0-1.8.8-1.8 1.8v8.2c.55-.45 1.2-.7 1.9-.7H16V5.25Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

// 极简本页大纲图标
function OutlineIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4 shrink-0">
      <path
        d="M4.5 5.5h11M4.5 10h8M4.5 14.5h9.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4">
      <path
        d="m5.5 5.5 9 9m0-9-9 9"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

type DocsArticleNavProviderProps = {
  layoutMode: DocsLayoutMode;
  sidebarGroups: DocsNavGroupModel[];
  outline: DocsOutlineItemModel[];
  chaptersLabel: string;
  outlineLabel: string;
  closeLabel: string;
  children: ReactNode;
};

// 窄屏（<1280px）下的右侧贴边书签耳标与内容自适应目录浮层
export function DocsArticleNavProvider({
  layoutMode,
  sidebarGroups,
  outline,
  chaptersLabel,
  outlineLabel,
  closeLabel,
  children,
}: DocsArticleNavProviderProps) {
  const [activeDrawer, setActiveDrawer] = useState<DrawerKind>(null);

  const hasSidebar = layoutMode === 'sidebar' && sidebarGroups.length > 0;
  const hasOutline = outline.length > 0;

  const toggleDrawer = useCallback((kind: Exclude<DrawerKind, null>) => {
    setActiveDrawer((current) => (current === kind ? null : kind));
  }, []);

  const closeDrawer = useCallback(() => {
    setActiveDrawer(null);
  }, []);

  useEffect(() => {
    if (!activeDrawer) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveDrawer(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeDrawer]);

  if (!hasSidebar && !hasOutline) {
    return <>{children}</>;
  }

  const drawerTitle = activeDrawer === 'chapters' ? chaptersLabel : outlineLabel;
  // 1024px–1279px 时左侧合集内联可见：仅当存在本页大纲时在右侧展示大纲耳标；<1024px 时按需展示合集/大纲
  const dockVisibilityClassName = hasOutline ? 'xl:hidden' : 'lg:hidden';

  return (
    <>
      {children}

      <div
        className={`fixed right-0 top-[clamp(88px,24vh,200px)] z-[var(--z-sticky,10)] flex flex-col items-center overflow-hidden rounded-l-[12px] border border-r-0 border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-card)_92%,transparent)] shadow-[var(--shadow-card-sm)] backdrop-blur-sm ${dockVisibilityClassName}`}
      >
        {hasSidebar ? (
          <button
            type="button"
            title={chaptersLabel}
            aria-label={chaptersLabel}
            aria-expanded={activeDrawer === 'chapters'}
            aria-controls="docs-responsive-nav-popover"
            onClick={() => toggleDrawer('chapters')}
            className={`inline-flex size-8.5 cursor-pointer items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring-focus)] lg:hidden ${
              activeDrawer === 'chapters'
                ? 'bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)]'
                : 'text-[var(--color-text-soft)] hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)]'
            }`}
          >
            <ChaptersIcon />
          </button>
        ) : null}

        {hasSidebar && hasOutline ? (
          <span
            aria-hidden="true"
            className="h-px w-4 bg-[var(--color-border-faint)] lg:hidden"
          />
        ) : null}

        {hasOutline ? (
          <button
            type="button"
            title={outlineLabel}
            aria-label={outlineLabel}
            aria-expanded={activeDrawer === 'outline'}
            aria-controls="docs-responsive-nav-popover"
            onClick={() => toggleDrawer('outline')}
            className={`inline-flex size-8.5 cursor-pointer items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring-focus)] ${
              activeDrawer === 'outline'
                ? 'bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)]'
                : 'text-[var(--color-text-soft)] hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)]'
            }`}
          >
            <OutlineIcon />
          </button>
        ) : null}
      </div>

      {activeDrawer ? (
        <div
          className="fixed inset-0 z-[var(--z-modal,60)] xl:hidden"
          role="presentation"
        >
          <div
            aria-hidden="true"
            className="fixed inset-0 bg-black/15"
            onClick={closeDrawer}
          />
          <div
            id="docs-responsive-nav-popover"
            role="dialog"
            aria-modal="true"
            aria-label={drawerTitle}
            className="fixed right-3 top-[clamp(76px,18vh,160px)] flex max-h-[min(65vh,calc(100dvh-7rem))] w-[min(18.5rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[14px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] shadow-[var(--shadow-nav-dropdown)] sm:right-11"
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border-faint)] px-4 py-2.5">
              <span className="text-[0.8125rem] font-semibold text-[var(--color-text)]">
                {drawerTitle}
              </span>
              <button
                type="button"
                aria-label={closeLabel}
                onClick={closeDrawer}
                className="inline-flex size-7 cursor-pointer items-center justify-center rounded-[8px] text-[var(--color-text-soft)] transition-colors hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)]"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-3">
              {activeDrawer === 'chapters' ? (
                <DocsArticleSidebar
                  groups={sidebarGroups}
                  variant="drawer"
                  onNavigate={closeDrawer}
                />
              ) : (
                <DocsArticleRightRail
                  items={outline}
                  label={outlineLabel}
                  variant="drawer"
                  onSelect={closeDrawer}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
