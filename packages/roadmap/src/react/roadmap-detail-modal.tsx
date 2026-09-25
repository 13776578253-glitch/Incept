'use client';

import { useEffect, useState } from 'react';

import type {
  RoadmapEntry,
  RoadmapEntryPriority,
  RoadmapEntryType,
  RoadmapLocale,
  RoadmapStatus,
} from '../domain';

import type { RoadmapChrome } from './copy';
import { IconChevronDown, IconLink, IconSparkle, typeIcons } from './icons';

type RoadmapDetailModalProps = {
  entry: RoadmapEntry;
  allEntries: readonly RoadmapEntry[];
  columnLabels: Partial<Record<RoadmapStatus, string>>;
  locale: RoadmapLocale;
  chrome: RoadmapChrome;
  onClose: () => void;
  onSelectEntry: (entry: RoadmapEntry) => void;
};

const statusPillStyles: Record<RoadmapStatus, { bg: string; fg: string; border: string }> = {
  completed: {
    bg: 'rgba(16, 185, 129, 0.12)',
    fg: '#059669',
    border: 'rgba(16, 185, 129, 0.28)',
  },
  active: {
    bg: 'rgba(37, 99, 235, 0.1)',
    fg: '#2563eb',
    border: 'rgba(37, 99, 235, 0.25)',
  },
  unstarted: {
    bg: 'rgba(124, 58, 237, 0.1)',
    fg: '#7c3aed',
    border: 'rgba(124, 58, 237, 0.25)',
  },
  reviewing: {
    bg: 'rgba(71, 85, 105, 0.1)',
    fg: '#475569',
    border: 'rgba(71, 85, 105, 0.22)',
  },
  canceled: {
    bg: 'rgba(225, 29, 72, 0.1)',
    fg: '#e11d48',
    border: 'rgba(225, 29, 72, 0.24)',
  },
};

const typeSelectorStyles: Record<
  RoadmapEntryType,
  { icon: string; fg: string; bg: string; border: string }
> = {
  feature: {
    icon: 'var(--roadmap-type-feature-icon, #f59e0b)',
    fg: 'var(--roadmap-type-feature-fg, var(--color-text))',
    bg: 'var(--roadmap-type-feature-bg, rgba(245, 158, 11, 0.08))',
    border: 'var(--roadmap-type-feature-border, rgba(245, 158, 11, 0.22))',
  },
  improvement: {
    icon: 'var(--roadmap-type-improvement-icon, #0ea5e9)',
    fg: 'var(--roadmap-type-improvement-fg, var(--color-text))',
    bg: 'var(--roadmap-type-improvement-bg, rgba(14, 165, 233, 0.08))',
    border: 'var(--roadmap-type-improvement-border, rgba(14, 165, 233, 0.2))',
  },
  maintenance: {
    icon: 'var(--roadmap-type-maintenance-icon, #6366f1)',
    fg: 'var(--roadmap-type-maintenance-fg, var(--color-text))',
    bg: 'var(--roadmap-type-maintenance-bg, rgba(99, 102, 241, 0.07))',
    border: 'var(--roadmap-type-maintenance-border, rgba(99, 102, 241, 0.18))',
  },
};

const prioritySelectorStyles: Record<
  RoadmapEntryPriority,
  { dot: string; fg: string; bg: string; border: string }
> = {
  high: {
    dot: 'var(--roadmap-priority-high-dot, #ef4444)',
    fg: 'var(--roadmap-priority-high-fg, #b91c1c)',
    bg: 'var(--roadmap-priority-high-bg, rgba(239, 68, 68, 0.08))',
    border: 'var(--roadmap-priority-high-border, rgba(239, 68, 68, 0.2))',
  },
  middle: {
    dot: 'var(--roadmap-priority-middle-dot, #6366f1)',
    fg: 'var(--roadmap-priority-middle-fg, #4338ca)',
    bg: 'var(--roadmap-priority-middle-bg, rgba(99, 102, 241, 0.08))',
    border: 'var(--roadmap-priority-middle-border, rgba(99, 102, 241, 0.2))',
  },
  low: {
    dot: 'var(--roadmap-priority-low-dot, #3b82f6)',
    fg: 'var(--roadmap-priority-low-fg, #1d4ed8)',
    bg: 'var(--roadmap-priority-low-bg, rgba(59, 130, 246, 0.08))',
    border: 'var(--roadmap-priority-low-border, rgba(59, 130, 246, 0.18))',
  },
  none: {
    dot: 'var(--color-text-soft)',
    fg: 'var(--color-text-muted)',
    bg: 'var(--roadmap-chip-bg)',
    border: 'var(--roadmap-chip-border, rgba(15, 23, 42, 0.08))',
  },
};

const statusDefaultNames: Record<RoadmapStatus, string> = {
  reviewing: 'Backlog',
  unstarted: 'Next up',
  active: 'In Progress',
  completed: 'Completed',
  canceled: 'Canceled',
};

const boardTypeOptions: readonly RoadmapEntryType[] = ['feature', 'improvement', 'maintenance'];
const priorityTagOptions: readonly RoadmapEntryPriority[] = ['high', 'middle', 'low', 'none'];

// 条目详情弹窗（第 1 轮微调：弹窗上移至导航栏下方、右侧切换条下方仅在 Backlog 显示 + 按钮、移除 Comments 改为英文预留空白栏目、移除右侧 Upvoters 行）。
export function RoadmapDetailModal({
  entry,
  allEntries,
  columnLabels,
  locale,
  chrome,
  onClose,
  onSelectEntry,
}: RoadmapDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'activity' | 'editor'>('activity');

  const defaultBilingualTitle =
    entry.title.en === entry.title.zh
      ? entry.title.en
      : `${entry.title.en} / ${entry.title.zh}`;

  const [editedTitle, setEditedTitle] = useState(defaultBilingualTitle);
  const [editedSummary, setEditedSummary] = useState(entry.summary[locale]);
  const [editedDetail, setEditedDetail] = useState('');
  const [savedToast, setSavedToast] = useState(false);

  const [selectedType, setSelectedType] = useState<RoadmapEntryType>(entry.type ?? 'feature');
  const [selectedPriority, setSelectedPriority] = useState<RoadmapEntryPriority>(entry.priority);
  const [openSelector, setOpenSelector] = useState<'board' | 'tags' | null>(null);

  useEffect(() => {
    const nextTitle =
      entry.title.en === entry.title.zh
        ? entry.title.en
        : `${entry.title.en} / ${entry.title.zh}`;
    setEditedTitle(nextTitle);
    setEditedSummary(entry.summary[locale]);
    setEditedDetail('');
    setSavedToast(false);
    setSelectedType(entry.type ?? 'feature');
    setSelectedPriority(entry.priority);
    setOpenSelector(null);
  }, [entry, locale]);

  const currentIndex = allEntries.findIndex((item) => item.key === entry.key);
  const prevEntry = currentIndex > 0 ? allEntries[currentIndex - 1] : undefined;
  const nextEntry =
    currentIndex >= 0 && currentIndex < allEntries.length - 1
      ? allEntries[currentIndex + 1]
      : undefined;

  const similarEntry =
    allEntries.find((item) => item.key !== entry.key && item.type === entry.type) ??
    allEntries.find((item) => item.key !== entry.key);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditingField =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if (event.key === 'Escape') {
        if (openSelector) {
          setOpenSelector(null);
          return;
        }
        onClose();
      } else if (!isEditingField && event.key === 'ArrowUp' && prevEntry) {
        event.preventDefault();
        onSelectEntry(prevEntry);
      } else if (!isEditingField && event.key === 'ArrowDown' && nextEntry) {
        event.preventDefault();
        onSelectEntry(nextEntry);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onSelectEntry, prevEntry, nextEntry, openSelector]);

  const similarBilingualTitle = similarEntry
    ? similarEntry.title.en === similarEntry.title.zh
      ? similarEntry.title.en
      : `${similarEntry.title.en} / ${similarEntry.title.zh}`
    : '';

  const statusLabel =
    entry.status === 'completed'
      ? 'Completed'
      : (columnLabels[entry.status] ?? statusDefaultNames[entry.status]);
  const statusStyle = statusPillStyles[entry.status];
  const currentTypeStyle = typeSelectorStyles[selectedType];
  const CurrentTypeIcon = typeIcons[selectedType];
  const currentPriorityStyle = prioritySelectorStyles[selectedPriority];
  const isBacklog = entry.status === 'reviewing';
  const isDirty =
    editedTitle !== defaultBilingualTitle ||
    editedSummary !== entry.summary[locale] ||
    editedDetail.trim().length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={editedTitle}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/35 px-4 pt-[calc(var(--navbar-height,64px)+24px)] pb-12 backdrop-blur-[3px] sm:px-6 sm:pt-[calc(var(--navbar-height,64px)+32px)]"
    >
      <div
        onClick={(event) => {
          event.stopPropagation();
          if (openSelector) {
            setOpenSelector(null);
          }
        }}
        className="relative flex w-full max-w-[920px] flex-col overflow-visible rounded-[16px] border border-[var(--color-border)] bg-[var(--color-bg)] shadow-[0_24px_64px_rgba(15,23,42,0.22)] md:flex-row"
      >
        {/* 右侧外部上下条目切换浮动按钮 + 仅在展开弹窗且处于 Backlog 时显示的「+」新增条目按钮 */}
        <div className="-right-11 top-0 hidden flex-col gap-2 lg:absolute lg:flex">
          <div className="flex flex-col overflow-hidden rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] shadow-md">
            <button
              type="button"
              aria-label="Previous entry"
              disabled={!prevEntry}
              onClick={() => prevEntry && onSelectEntry(prevEntry)}
              className="flex size-8 items-center justify-center border-b border-[var(--color-border)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--roadmap-lane-bg)] hover:text-[var(--color-text)] disabled:opacity-35"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                <path d="M6 3.5 2.5 7.5h7z" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Next entry"
              disabled={!nextEntry}
              onClick={() => nextEntry && onSelectEntry(nextEntry)}
              className="flex size-8 items-center justify-center text-[var(--color-text-muted)] transition-colors hover:bg-[var(--roadmap-lane-bg)] hover:text-[var(--color-text)] disabled:opacity-35"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                <path d="M6 8.5 2.5 4.5h7z" />
              </svg>
            </button>
          </div>

          {isBacklog && (
            <button
              type="button"
              aria-label="Add Backlog entry"
              title="Add entry to Backlog"
              className="flex size-8 items-center justify-center rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-muted)] shadow-md transition-colors hover:border-[var(--roadmap-status-active,#2563eb)] hover:bg-[var(--roadmap-lane-bg)] hover:text-[var(--roadmap-status-active,#2563eb)]"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M7 2.75v8.5M2.75 7h8.5" />
              </svg>
            </button>
          )}
        </div>

        {/* 左侧主内容列 */}
        <div className="flex min-w-0 flex-1 flex-col gap-5 p-6 sm:p-7">
          <div className="space-y-2">
            <h2 className="text-[1.15rem] font-semibold leading-snug tracking-[-0.01em] text-[var(--color-text)] sm:text-[1.22rem]">
              {editedTitle}
            </h2>
            <p className="text-[0.84rem] leading-6 text-[var(--color-text-muted)]">
              {editedSummary}
            </p>
          </div>

          {/* View all similar requests 折叠卡片盒 */}
          {similarEntry && (
            <div className="overflow-hidden rounded-[10px] border border-[var(--color-border)] bg-[var(--color-bg)]">
              <button
                type="button"
                onClick={() => onSelectEntry(similarEntry)}
                className="flex w-full items-center justify-between border-b border-[var(--color-border)] bg-[var(--roadmap-lane-bg)] px-3.5 py-2 text-left text-[0.78rem] font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
              >
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="text-[#64748b]">
                    <IconSparkle />
                  </span>
                  View all similar requests
                </span>
                <span aria-hidden="true" className="text-[0.85rem] text-[var(--color-text-soft)]">
                  →
                </span>
              </button>
              <button
                type="button"
                onClick={() => onSelectEntry(similarEntry)}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[0.82rem] text-[var(--color-text)] transition-colors hover:bg-[var(--roadmap-lane-bg)]"
              >
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full bg-[#3b82f6]"
                />
                <span className="truncate">{similarBilingualTitle}</span>
              </button>
            </div>
          )}

          {/* Details / Activity feed / Editor 分段标签页 */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-5 border-b border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setActiveTab('details')}
                className={`inline-flex items-center gap-1.5 border-b-2 pb-2.5 text-[0.82rem] font-medium transition-colors ${
                  activeTab === 'details'
                    ? 'border-[var(--color-text)] text-[var(--color-text)]'
                    : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                Details
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('activity')}
                className={`inline-flex items-center gap-1.5 border-b-2 pb-2.5 text-[0.82rem] font-medium transition-colors ${
                  activeTab === 'activity'
                    ? 'border-[var(--color-text)] text-[var(--color-text)]'
                    : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                Activity feed
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('editor')}
                className={`inline-flex items-center gap-1.5 border-b-2 pb-2.5 text-[0.82rem] font-medium transition-colors ${
                  activeTab === 'editor'
                    ? 'border-[var(--color-text)] text-[var(--color-text)]'
                    : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                Editor
              </button>
            </div>

            {activeTab === 'activity' && (
              <div className="relative flex flex-col gap-0">
                {/* 第一条状态变更记录 */}
                <div className="flex items-center justify-between rounded-[10px] border border-[var(--color-border)] bg-[var(--roadmap-lane-bg)] px-3.5 py-2.5 text-[0.8rem]">
                  <span className="inline-flex items-center gap-2">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <circle cx="8" cy="8" r="6.5" fill="#10b981" />
                      <path
                        d="m5.3 8.1 1.85 1.85L10.8 6.2"
                        stroke="#ffffff"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="font-medium text-[var(--color-text)]">Soulter</span>
                    <span className="text-[var(--color-text-muted)]">changed status to</span>
                    <span className="font-medium" style={{ color: statusStyle.fg }}>
                      {statusLabel}
                    </span>
                  </span>
                  <span className="text-[0.75rem] text-[var(--color-text-soft)]">8 months ago</span>
                </div>

                {/* 时间轴连接竖线 */}
                <div className="ml-5 h-3.5 w-px bg-[var(--color-border)]" />

                {/* 第二条状态变更记录 */}
                <div className="flex items-center justify-between rounded-[10px] border border-[var(--color-border)] bg-[var(--roadmap-lane-bg)] px-3.5 py-2.5 text-[0.8rem]">
                  <span className="inline-flex items-center gap-2">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <circle cx="8" cy="8" r="6" stroke="#3b82f6" strokeWidth="1.6" />
                      <path d="M8 2a6 6 0 0 0 0 12V2Z" fill="#3b82f6" />
                    </svg>
                    <span className="font-medium text-[var(--color-text)]">Soulter</span>
                    <span className="text-[var(--color-text-muted)]">changed status to</span>
                    <span className="font-medium text-[#2563eb]">In Progress</span>
                  </span>
                  <span className="text-[0.75rem] text-[var(--color-text-soft)]">9 months ago</span>
                </div>
              </div>
            )}

            {activeTab === 'details' && (
              <div className="flex min-h-[104px] items-center justify-center rounded-[10px] border border-dashed border-[var(--color-border)] bg-[var(--roadmap-lane-bg)]/50 px-4 py-6 text-[0.78rem] text-[var(--color-text-soft)]">
                {editedDetail.trim() ? (
                  <p className="w-full whitespace-pre-wrap text-left text-[0.82rem] leading-relaxed text-[var(--color-text)]">
                    {editedDetail}
                  </p>
                ) : (
                  'Pending specification'
                )}
              </div>
            )}

            {activeTab === 'editor' && (
              <div className="overflow-hidden rounded-[10px] border border-[var(--color-border)] bg-[var(--color-bg)] shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
                {/* 编辑器顶栏状态与重置操作 */}
                <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--roadmap-lane-bg)]/80 px-3.5 py-2">
                  <div className="inline-flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-[#3b82f6]" />
                    <span className="text-[0.74rem] font-semibold tracking-wide text-[var(--color-text)]">
                      Proposal Editor
                    </span>
                    <span className="rounded-[5px] border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-[0.68rem] text-[var(--color-text-soft)]">
                      Live sync
                    </span>
                  </div>
                  {isDirty && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditedTitle(defaultBilingualTitle);
                        setEditedSummary(entry.summary[locale]);
                        setEditedDetail('');
                        setSavedToast(false);
                      }}
                      className="text-[0.72rem] font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* 分栏紧凑表单字段 */}
                <div className="divide-y divide-[var(--color-border)]">
                  <label className="flex flex-col gap-1.5 p-3.5 transition-colors focus-within:bg-[var(--roadmap-lane-bg)]/30">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-[0.74rem] font-semibold text-[var(--color-text)]">
                        <span className="rounded-[4px] bg-slate-200/70 px-1.5 py-0.5 font-mono text-[0.66rem] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          01
                        </span>
                        标题 · Title
                      </span>
                      <span className="text-[0.68rem] text-[var(--color-text-soft)]">
                        EN / ZH 双语标题
                      </span>
                    </div>
                    <input
                      type="text"
                      aria-label="Title"
                      value={editedTitle}
                      onChange={(event) => {
                        setEditedTitle(event.target.value);
                        setSavedToast(false);
                      }}
                      className="w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--roadmap-lane-bg)]/45 px-3 py-1.5 text-[0.82rem] font-medium text-[var(--color-text)] outline-none transition-all focus:border-[#3b82f6] focus:bg-[var(--color-bg)] focus:ring-2 focus:ring-[#3b82f6]/12"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5 p-3.5 transition-colors focus-within:bg-[var(--roadmap-lane-bg)]/30">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-[0.74rem] font-semibold text-[var(--color-text)]">
                        <span className="rounded-[4px] bg-slate-200/70 px-1.5 py-0.5 font-mono text-[0.66rem] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          02
                        </span>
                        小结 · Summary
                      </span>
                      <span className="font-mono text-[0.68rem] text-[var(--color-text-soft)]">
                        {editedSummary.length} chars
                      </span>
                    </div>
                    <textarea
                      rows={2}
                      aria-label="Summary"
                      value={editedSummary}
                      onChange={(event) => {
                        setEditedSummary(event.target.value);
                        setSavedToast(false);
                      }}
                      className="w-full resize-none rounded-[7px] border border-[var(--color-border)] bg-[var(--roadmap-lane-bg)]/45 px-3 py-1.5 text-[0.81rem] leading-relaxed text-[var(--color-text)] outline-none transition-all focus:border-[#3b82f6] focus:bg-[var(--color-bg)] focus:ring-2 focus:ring-[#3b82f6]/12"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5 p-3.5 transition-colors focus-within:bg-[var(--roadmap-lane-bg)]/30">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-[0.74rem] font-semibold text-[var(--color-text)]">
                        <span className="rounded-[4px] bg-slate-200/70 px-1.5 py-0.5 font-mono text-[0.66rem] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          03
                        </span>
                        Detail · 具体内容
                      </span>
                      <span className="text-[0.68rem] text-[var(--color-text-soft)]">
                        同步展示于 Details 栏
                      </span>
                    </div>
                    <textarea
                      rows={3}
                      aria-label="Detail"
                      value={editedDetail}
                      onChange={(event) => {
                        setEditedDetail(event.target.value);
                        setSavedToast(false);
                      }}
                      placeholder="输入具体内容与方案说明..."
                      className="w-full resize-none rounded-[7px] border border-[var(--color-border)] bg-[var(--roadmap-lane-bg)]/45 px-3 py-2 text-[0.81rem] leading-relaxed text-[var(--color-text)] outline-none transition-all focus:border-[#3b82f6] focus:bg-[var(--color-bg)] focus:ring-2 focus:ring-[#3b82f6]/12"
                    />
                  </label>
                </div>

                {/* 底部保存与预览操作条 */}
                <div className="flex items-center justify-between border-t border-[var(--color-border)] bg-[var(--roadmap-lane-bg)]/50 px-3.5 py-2">
                  <span className="text-[0.72rem] text-[var(--color-text-soft)]">
                    {savedToast ? '✓ Draft updated in current view' : 'Changes reflect immediately in header'}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('details')}
                      className="rounded-[6px] border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1 text-[0.73rem] font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
                    >
                      Preview Details
                    </button>
                    <button
                      type="button"
                      onClick={() => setSavedToast(true)}
                      className="rounded-[6px] bg-[#5ba4cf] px-3 py-1 text-[0.73rem] font-medium text-white shadow-2xs transition-colors hover:bg-[#4a93be]"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右侧元数据与回退/删除侧栏 */}
        <aside className="flex w-full shrink-0 flex-col justify-between border-t border-[var(--color-border)] bg-[var(--roadmap-lane-bg)]/45 md:w-[288px] md:border-t-0 md:border-l">
          <div className="space-y-3.5 p-6 text-[0.8rem]">
            <div className="grid grid-cols-[84px_1fr] items-center">
              <span className="text-[var(--color-text-muted)]">Status</span>
              <div>
                <span
                  className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.74rem] font-medium"
                  style={{
                    backgroundColor: statusStyle.bg,
                    color: statusStyle.fg,
                    borderColor: statusStyle.border,
                  }}
                >
                  {statusLabel}
                </span>
              </div>
            </div>

            {/* Board 扁平化下拉选择（箭头内嵌，展开项去除胶囊套娃边框） */}
            <div className="grid grid-cols-[84px_1fr] items-center">
              <span className="text-[var(--color-text-muted)]">Board</span>
              <div className="relative">
                <button
                  type="button"
                  aria-label="Select Board"
                  aria-haspopup="listbox"
                  aria-expanded={openSelector === 'board'}
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenSelector((prev) => (prev === 'board' ? null : 'board'));
                  }}
                  style={{
                    color: currentTypeStyle.fg,
                    background: currentTypeStyle.bg,
                    borderColor: currentTypeStyle.border,
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.74rem] font-medium leading-5 whitespace-nowrap transition-opacity hover:opacity-85 focus:outline-none"
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex shrink-0"
                    style={{ color: currentTypeStyle.icon }}
                  >
                    <CurrentTypeIcon />
                  </span>
                  <span>{chrome.typeLabels[selectedType]}</span>
                  <span
                    aria-hidden="true"
                    className={`ml-0.5 inline-flex text-[var(--color-text-soft)] transition-transform ${
                      openSelector === 'board' ? 'rotate-180' : ''
                    }`}
                  >
                    <IconChevronDown />
                  </span>
                </button>

                {openSelector === 'board' && (
                  <ul
                    role="listbox"
                    aria-label="Board options"
                    onClick={(event) => event.stopPropagation()}
                    className="absolute left-0 z-30 mt-1.5 w-[164px] rounded-[9px] border border-[var(--color-border)] bg-[var(--color-bg)] p-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
                  >
                    {boardTypeOptions.map((typeOption) => {
                      const active = selectedType === typeOption;
                      const OptionIcon = typeIcons[typeOption];
                      const optionStyle = typeSelectorStyles[typeOption];
                      return (
                        <li key={typeOption} role="option" aria-selected={active}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedType(typeOption);
                              setOpenSelector(null);
                            }}
                            className={`flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-left text-[0.75rem] font-medium transition-colors ${
                              active
                                ? 'bg-[var(--roadmap-lane-bg)] text-[var(--color-text)]'
                                : 'text-[var(--color-text-muted)] hover:bg-[var(--roadmap-lane-bg)]/65 hover:text-[var(--color-text)]'
                            }`}
                          >
                            <span className="inline-flex items-center gap-2 truncate">
                              <span
                                aria-hidden="true"
                                className="inline-flex shrink-0"
                                style={{ color: optionStyle.icon }}
                              >
                                <OptionIcon />
                              </span>
                              <span className="truncate">{chrome.typeLabels[typeOption]}</span>
                            </span>
                            {active && (
                              <span
                                aria-hidden="true"
                                className="ml-1.5 shrink-0 text-[0.72rem] font-semibold text-[#2563eb]"
                              >
                                ✓
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* Tags 扁平化下拉选择（箭头内嵌，展开项去除胶囊套娃边框） */}
            <div className="grid grid-cols-[84px_1fr] items-center">
              <span className="text-[var(--color-text-muted)]">Tags</span>
              <div className="relative">
                <button
                  type="button"
                  aria-label="Select Tags"
                  aria-haspopup="listbox"
                  aria-expanded={openSelector === 'tags'}
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenSelector((prev) => (prev === 'tags' ? null : 'tags'));
                  }}
                  style={{
                    color: currentPriorityStyle.fg,
                    background: currentPriorityStyle.bg,
                    borderColor: currentPriorityStyle.border,
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.74rem] font-medium leading-5 whitespace-nowrap transition-opacity hover:opacity-85 focus:outline-none"
                >
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: currentPriorityStyle.dot }}
                  />
                  <span>{chrome.priorityLabels[selectedPriority]}</span>
                  <span
                    aria-hidden="true"
                    className={`ml-0.5 inline-flex text-[var(--color-text-soft)] transition-transform ${
                      openSelector === 'tags' ? 'rotate-180' : ''
                    }`}
                  >
                    <IconChevronDown />
                  </span>
                </button>

                {openSelector === 'tags' && (
                  <ul
                    role="listbox"
                    aria-label="Tags options"
                    onClick={(event) => event.stopPropagation()}
                    className="absolute left-0 z-30 mt-1.5 w-[164px] rounded-[9px] border border-[var(--color-border)] bg-[var(--color-bg)] p-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
                  >
                    {priorityTagOptions.map((priorityOption) => {
                      const active = selectedPriority === priorityOption;
                      const optionStyle = prioritySelectorStyles[priorityOption];
                      return (
                        <li key={priorityOption} role="option" aria-selected={active}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPriority(priorityOption);
                              setOpenSelector(null);
                            }}
                            className={`flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-left text-[0.75rem] font-medium transition-colors ${
                              active
                                ? 'bg-[var(--roadmap-lane-bg)] text-[var(--color-text)]'
                                : 'text-[var(--color-text-muted)] hover:bg-[var(--roadmap-lane-bg)]/65 hover:text-[var(--color-text)]'
                            }`}
                          >
                            <span className="inline-flex items-center gap-2 truncate">
                              <span
                                aria-hidden="true"
                                className="size-2 shrink-0 rounded-full"
                                style={{ background: optionStyle.dot }}
                              />
                              <span className="truncate">
                                {chrome.priorityLabels[priorityOption]}
                              </span>
                            </span>
                            {active && (
                              <span
                                aria-hidden="true"
                                className="ml-1.5 shrink-0 text-[0.72rem] font-semibold text-[#2563eb]"
                              >
                                ✓
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="grid grid-cols-[84px_1fr] items-center pt-1">
              <span className="text-[var(--color-text-muted)]">Date</span>
              <span className="text-[var(--color-text)]">12 months ago</span>
            </div>

            <div className="grid grid-cols-[84px_1fr] items-center">
              <span className="text-[var(--color-text-muted)]">Author</span>
              <div className="inline-flex items-center gap-2">
                <span className="relative inline-flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-amber-500 text-[0.7rem] font-semibold text-white">
                  S
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 flex size-2.5 items-center justify-center rounded-full bg-[#3b82f6] text-[7px] text-white ring-1 ring-white"
                  >
                    ✓
                  </span>
                </span>
                <span className="font-medium text-[var(--color-text)]">Soulter</span>
              </div>
            </div>

            {(entry.links ?? []).length > 0 && (
              <div className="grid grid-cols-[84px_1fr] items-center">
                <span className="text-[var(--color-text-muted)]">Links</span>
                <div className="flex flex-wrap gap-1.5">
                  {(entry.links ?? []).map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 text-[0.71rem] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                    >
                      <IconLink />
                      {link.label[locale]}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 右下角回退/删除提议操作区（参考图二排版：删除或者回退此提议；白色 Undo + 蓝色 Delete，Backlog 仅显示蓝色 Delete） */}
          <div className="border-t border-[var(--color-border)] p-6">
            <h3 className="text-[0.86rem] font-semibold text-[var(--color-text)]">
              Revert or delete
            </h3>
            <p className="mt-1 text-[0.76rem] leading-relaxed text-[var(--color-text-muted)]">
              删除或者回退此提议
            </p>
            <div className="mt-3.5 flex items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                {!isBacklog && (
                  <button
                    type="button"
                    aria-label="Undo"
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-white px-3.5 py-1.5 text-[0.78rem] font-medium text-[var(--color-text)] shadow-xs transition-colors hover:bg-[var(--roadmap-lane-bg)] dark:bg-[var(--color-bg)]"
                  >
                    Undo
                  </button>
                )}

                <button
                  type="button"
                  aria-label="Delete"
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#5ba4cf] px-3.5 py-1.5 text-[0.78rem] font-medium text-white shadow-xs transition-colors hover:bg-[#4a93be]"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
