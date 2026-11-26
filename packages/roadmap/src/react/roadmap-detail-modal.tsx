'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  findSimilarEntry,
  type LocalizedText,
  type RoadmapEntry,
  type RoadmapEntryPriority,
  type RoadmapEntryType,
  type RoadmapLocale,
  type RoadmapStatus,
} from '../domain';

import { roadmapEndpoints } from '../endpoints';
import type { RoadmapChrome } from './copy';
import { isDraftEntryKey } from './draft';
import {
  IconChevronDown,
  IconLink,
  IconSparkle,
  statusColors,
  statusIcons,
  typeIcons,
} from './icons';
import { roadmapRequest } from './request';

type RoadmapDetailModalProps = {
  entry: RoadmapEntry;
  allEntries: readonly RoadmapEntry[];
  columnLabels: Partial<Record<RoadmapStatus, string>>;
  statusOptions?: readonly RoadmapStatus[];
  locale: RoadmapLocale;
  chrome: RoadmapChrome;
  canEdit: boolean;
  // 新建列（板配置第一列）：只有落在这一列时，右侧浮条才给出「+」新增入口。
  createStatus?: RoadmapStatus;
  undoStatus?: RoadmapStatus;
  advanceStatus?: RoadmapStatus;
  onClose: () => void;
  onSelectEntry: (entry: RoadmapEntry) => void;
  onEntrySaved: (entry: RoadmapEntry) => void;
  onEntryDeleted: (key: string) => void;
};

const statusPillStyles: Record<RoadmapStatus, { bg: string; fg: string; border: string }> = {
  completed: {
    bg: 'color-mix(in oklab, var(--roadmap-status-completed, #2f8566) 11%, transparent)',
    fg: 'var(--roadmap-status-completed, #2f8566)',
    border: 'color-mix(in oklab, var(--roadmap-status-completed, #2f8566) 24%, transparent)',
  },
  active: {
    bg: 'color-mix(in oklab, var(--roadmap-status-active, #3b6ea5) 11%, transparent)',
    fg: 'var(--roadmap-status-active, #3b6ea5)',
    border: 'color-mix(in oklab, var(--roadmap-status-active, #3b6ea5) 24%, transparent)',
  },
  unstarted: {
    bg: 'color-mix(in oklab, var(--roadmap-status-unstarted, #7c67b8) 11%, transparent)',
    fg: 'var(--roadmap-status-unstarted, #7c67b8)',
    border: 'color-mix(in oklab, var(--roadmap-status-unstarted, #7c67b8) 24%, transparent)',
  },
  reviewing: {
    bg: 'var(--roadmap-chip-bg, rgba(71, 85, 105, 0.1))',
    fg: 'var(--roadmap-status-reviewing, #5b6472)',
    border: 'var(--roadmap-chip-border, rgba(71, 85, 105, 0.18))',
  },
  canceled: {
    bg: 'color-mix(in oklab, var(--roadmap-status-canceled, #b84a5a) 11%, transparent)',
    fg: 'var(--roadmap-status-canceled, #b84a5a)',
    border: 'color-mix(in oklab, var(--roadmap-status-canceled, #b84a5a) 24%, transparent)',
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

// 双语标题拆分：以首个 ' / ' 分隔中英文；未包含分隔符时双语同文以满足完整性约束。
function splitBilingualTitle(value: string): LocalizedText {
  const index = value.indexOf(' / ');

  if (index === -1) {
    return { en: value.trim(), zh: value.trim() };
  }

  return { en: value.slice(0, index).trim(), zh: value.slice(index + 3).trim() };
}

// 本地化文本填充：输入单侧语言时，对侧自动同文兜底以确保成对写入。
function withLocaleFallback(
  current: LocalizedText | undefined,
  value: string,
  locale: RoadmapLocale,
): LocalizedText {
  const other: RoadmapLocale = locale === 'en' ? 'zh' : 'en';
  const next: LocalizedText = { en: current?.en ?? '', zh: current?.zh ?? '', [locale]: value };

  if (next[other].trim() === '') {
    next[other] = value;
  }

  return next;
}

// 相对时间（Module E）：createdAt / updatedAt 的 ISO 字符串 → 诚实相对时间。
function relativeTime(iso: string | undefined, locale: RoadmapLocale): string | null {
  if (!iso) return null;

  const target = new Date(iso).getTime();

  if (Number.isNaN(target)) return null;

  const minutes = Math.round((Date.now() - target) / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', { numeric: 'auto' });

  if (Math.abs(minutes) < 60) return rtf.format(-minutes, 'minute');

  const hours = Math.round(minutes / 60);

  if (Math.abs(hours) < 24) return rtf.format(-hours, 'hour');

  return rtf.format(-Math.round(hours / 24), 'day');
}

function formatCalendarDate(iso: string | undefined, locale: RoadmapLocale): string | null {
  if (!iso) return null;

  const parsed = new Date(iso);

  if (Number.isNaN(parsed.getTime())) return null;

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const rel = relativeTime(iso, locale);

  return rel ? `${year}-${month}-${day} (${rel})` : `${year}-${month}-${day}`;
}

// 条目详情弹窗（第 1 轮微调：弹窗上移至导航栏下方、右侧切换条下方仅在 Backlog 显示 + 按钮、移除 Comments 改为英文预留空白栏目、移除右侧 Upvoters 行）。
export function RoadmapDetailModal({
  entry,
  allEntries,
  columnLabels,
  statusOptions,
  locale,
  chrome,
  canEdit,
  createStatus,
  undoStatus,
  advanceStatus,
  onClose,
  onSelectEntry,
  onEntrySaved,
  onEntryDeleted,
}: RoadmapDetailModalProps) {
  // 草稿条目（key 带 draft: 前缀）= 直接进创建态，保存后看板会把它换成真实条目。
  const draftEntry = isDraftEntryKey(entry.key);
  const [activeTab, setActiveTab] = useState<'details' | 'activity' | 'editor'>(
    draftEntry ? 'editor' : 'activity',
  );
  const [mode, setMode] = useState<'view' | 'create'>(draftEntry ? 'create' : 'view');
  const [saveError, setSaveError] = useState<string | null>(null);
  const isCreate = mode === 'create';

  const defaultBilingualTitle =
    entry.title.en === entry.title.zh
      ? entry.title.en
      : `${entry.title.en} / ${entry.title.zh}`;

  const [editedTitle, setEditedTitle] = useState(defaultBilingualTitle);
  const [editedSummary, setEditedSummary] = useState(entry.summary[locale]);
  const [editedDetail, setEditedDetail] = useState(entry.detail?.[locale] ?? '');
  const [savedToast, setSavedToast] = useState(false);

  const [selectedStatus, setSelectedStatus] = useState<RoadmapStatus>(entry.status);
  const [selectedType, setSelectedType] = useState<RoadmapEntryType>(entry.type ?? 'feature');
  const [selectedPriority, setSelectedPriority] = useState<RoadmapEntryPriority>(entry.priority);
  const [openSelector, setOpenSelector] = useState<'status' | 'board' | 'tags' | null>(null);

  useEffect(() => {
    const nextTitle =
      entry.title.en === entry.title.zh
        ? entry.title.en
        : `${entry.title.en} / ${entry.title.zh}`;
    setMode(draftEntry ? 'create' : 'view');
    setSaveError(null);
    setEditedTitle(nextTitle);
    setEditedSummary(entry.summary[locale]);
    setEditedDetail(entry.detail?.[locale] ?? '');
    setSavedToast(false);
    setSelectedStatus(entry.status);
    setSelectedType(entry.type ?? 'feature');
    setSelectedPriority(entry.priority);
    setOpenSelector(null);
    if (draftEntry) setActiveTab('editor');
  }, [entry, locale, draftEntry]);

  const currentIndex = allEntries.findIndex((item) => item.key === entry.key);
  const prevEntry = currentIndex > 0 ? allEntries[currentIndex - 1] : undefined;
  const nextEntry =
    currentIndex >= 0 && currentIndex < allEntries.length - 1
      ? allEntries[currentIndex + 1]
      : undefined;

  const similarEntry = isCreate ? null : findSimilarEntry(entry, allEntries);

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

  const effectiveStatusOptions: readonly RoadmapStatus[] =
    statusOptions && statusOptions.length > 0
      ? statusOptions
      : ['reviewing', 'unstarted', 'active', 'completed'];

  function labelForStatus(status: RoadmapStatus) {
    return status === 'completed'
      ? 'Completed'
      : (columnLabels[status] ?? statusDefaultNames[status]);
  }

  const statusLabel = labelForStatus(selectedStatus);
  const statusStyle = statusPillStyles[selectedStatus];
  const CurrentStatusIcon = statusIcons[selectedStatus];
  const currentTypeStyle = typeSelectorStyles[selectedType];
  const CurrentTypeIcon = typeIcons[selectedType];
  const currentPriorityStyle = prioritySelectorStyles[selectedPriority];
  // 新建列 = 板配置的第一列；不传时退回旧行为（Backlog = reviewing）。
  const isFirstColumn = createStatus
    ? selectedStatus === createStatus
    : selectedStatus === 'reviewing';
  const isDirty =
    editedTitle !== defaultBilingualTitle ||
    editedSummary !== entry.summary[locale] ||
    editedDetail !== (entry.detail?.[locale] ?? '');

  const createdText = relativeTime(entry.createdAt, locale);
  const updatedText = relativeTime(entry.updatedAt, locale);

  function reportFailure(error: unknown) {
    const message = error instanceof Error ? error.message : '';

    setSaveError(message ? `${chrome.saveFailed} ${message}` : chrome.saveFailed);
  }

  // 保存操作：编辑模式执行 PATCH，新建模式在保存时执行 POST；标题执行双语拆分，详情清空显式传 null。
  async function handleSave() {
    const title = splitBilingualTitle(editedTitle);
    const summary = withLocaleFallback(isCreate ? undefined : entry.summary, editedSummary, locale);
    const detailBody =
      editedDetail.trim() === ''
        ? isCreate
          ? {}
          : entry.detail
            ? { detail: null }
            : {}
        : { detail: withLocaleFallback(entry.detail, editedDetail, locale) };

    try {
      const saved = isCreate
        ? await roadmapRequest<{ entry: RoadmapEntry }>(roadmapEndpoints.entries, 'POST', {
            roadmapKey: entry.roadmap,
            status: selectedStatus ?? createStatus ?? entry.status,
            type: selectedType,
            priority: selectedPriority,
            title,
            summary,
            ...detailBody,
          })
        : await roadmapRequest<{ entry: RoadmapEntry }>(
            roadmapEndpoints.entry(entry.key),
            'PATCH',
            { title, summary, ...detailBody },
          );

      setMode('view');
      setSaveError(null);
      setSavedToast(true);
      onEntrySaved(saved.entry);
    } catch (error) {
      reportFailure(error);
    }
  }

  // Status 下拉选择 & 阶段推进 / 回退共用更新路径，失败自动回滚并提示。
  async function handleStatusPick(statusOption: RoadmapStatus) {
    const previous = selectedStatus;

    setSelectedStatus(statusOption);
    setOpenSelector(null);
    if (isCreate || statusOption === entry.status) return;

    try {
      const saved = await roadmapRequest<{ entry: RoadmapEntry }>(
        roadmapEndpoints.entry(entry.key),
        'PATCH',
        { status: statusOption },
      );

      onEntrySaved(saved.entry);
      setSaveError(null);
    } catch (error) {
      setSelectedStatus(previous);
      reportFailure(error);
    }
  }

  // Module B：Board/Tags 选中即乐观更新 + PATCH，失败回滚并提示。
  async function handleTypePick(typeOption: RoadmapEntryType) {
    const previous = selectedType;

    setSelectedType(typeOption);
    setOpenSelector(null);
    if (isCreate) return;

    try {
      const saved = await roadmapRequest<{ entry: RoadmapEntry }>(
        roadmapEndpoints.entry(entry.key),
        'PATCH',
        { type: typeOption },
      );

      onEntrySaved(saved.entry);
      setSaveError(null);
    } catch (error) {
      setSelectedType(previous);
      reportFailure(error);
    }
  }

  async function handlePriorityPick(priorityOption: RoadmapEntryPriority) {
    const previous = selectedPriority;

    setSelectedPriority(priorityOption);
    setOpenSelector(null);
    if (isCreate) return;

    try {
      const saved = await roadmapRequest<{ entry: RoadmapEntry }>(
        roadmapEndpoints.entry(entry.key),
        'PATCH',
        { priority: priorityOption },
      );

      onEntrySaved(saved.entry);
      setSaveError(null);
    } catch (error) {
      setSelectedPriority(previous);
      reportFailure(error);
    }
  }

  // Module C：Undo / Advance = 阶段回退或推进一档（目标由板列序算出）。
  async function handleUndo() {
    if (!undoStatus) return;
    await handleStatusPick(undoStatus);
  }

  async function handleAdvance() {
    if (!advanceStatus) return;
    await handleStatusPick(advanceStatus);
  }

  async function handleDelete() {
    if (!window.confirm(chrome.confirmDelete)) return;

    try {
      await roadmapRequest(roadmapEndpoints.entry(entry.key), 'DELETE');
      onEntryDeleted(entry.key);
    } catch (error) {
      reportFailure(error);
    }
  }

  // 新建入口：初始化空白草稿并切至编辑面板，点击保存前不触发任何网络请求。
  function enterCreateMode() {
    setMode('create');
    setSelectedStatus(createStatus ?? entry.status);
    setEditedTitle('');
    setEditedSummary('');
    setEditedDetail('');
    setSavedToast(false);
    setSaveError(null);
    setActiveTab('editor');
    setOpenSelector(null);
  }

  const createdDateText = formatCalendarDate(entry.createdAt, locale);
  const updatedDateText = formatCalendarDate(entry.updatedAt, locale);

  const modalNode = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={editedTitle}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
        }
      }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex transform-gpu items-end justify-center overflow-y-auto bg-black/45 p-0 pt-10 backdrop-blur-[3px] will-change-[opacity] sm:items-start sm:px-6 sm:pt-[calc(var(--navbar-height,64px)+28px)] sm:pb-12 dark:bg-black/72"
    >
      <div
        onClick={(event) => {
          event.stopPropagation();
          if (openSelector) {
            setOpenSelector(null);
          }
        }}
        className="relative flex max-h-[calc(100dvh-2.5rem)] w-full max-w-[920px] flex-col overflow-y-auto rounded-t-[18px] rounded-b-none border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-modal-bg,var(--color-bg))] shadow-[0_24px_64px_rgba(0,0,0,0.38)] sm:max-h-none sm:overflow-visible sm:rounded-[16px] md:flex-row"
      >
        {/* 统一控制条：<1024px 为弹窗内嵌顶栏；>=1024px 为右侧外置浮动工具条（避免重复 DOM 按钮） */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--roadmap-divider,var(--color-border))] px-4 py-2.5 lg:absolute lg:-right-11 lg:top-0 lg:flex-col lg:items-center lg:justify-start lg:gap-2 lg:border-0 lg:p-0">
          <div className="flex items-center gap-2 lg:flex-col">
            <div className="flex overflow-hidden rounded-[8px] border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-modal-bg,var(--color-bg))] shadow-sm lg:flex-col lg:shadow-md">
              <button
                type="button"
                aria-label="Previous entry"
                disabled={!prevEntry}
                onClick={() => prevEntry && onSelectEntry(prevEntry)}
                className="flex size-8 items-center justify-center border-r border-[var(--roadmap-border,var(--color-border))] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--roadmap-lane-bg)] hover:text-[var(--color-text)] disabled:opacity-35 lg:border-r-0 lg:border-b"
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

            {canEdit && isFirstColumn && !isCreate && (
              <button
                type="button"
                aria-label={`Add ${statusLabel} entry`}
                title={`Add entry to ${statusLabel}`}
                onClick={enterCreateMode}
                className="flex size-8 items-center justify-center rounded-[8px] border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-modal-bg,var(--color-bg))] text-[var(--color-text-muted)] shadow-sm transition-colors hover:border-[var(--color-accent-border,var(--roadmap-border-hover))] hover:bg-[var(--roadmap-lane-bg)] hover:text-[var(--color-accent)] lg:shadow-md"
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

          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-[8px] border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-modal-bg,var(--color-bg))] text-[var(--color-text-muted)] shadow-sm transition-colors hover:bg-[var(--roadmap-lane-bg)] hover:text-[var(--color-text)] lg:-order-1 lg:shadow-md"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M3.25 3.25 10.75 10.75M10.75 3.25 3.25 10.75" />
            </svg>
          </button>
        </div>

        {/* 左侧主内容列 */}
        <div className="flex min-w-0 flex-1 flex-col gap-5 p-4 sm:p-6 md:rounded-l-[15px] md:p-7">
          <div className="space-y-2">
            <h2 className="text-[1.08rem] font-semibold leading-snug tracking-[-0.01em] text-[var(--color-text)] sm:text-[1.22rem]">
              {editedTitle}
            </h2>
            <p className="text-[0.84rem] leading-6 text-[var(--color-text-muted)]">
              {editedSummary}
            </p>
          </div>

          {/* View all similar requests 折叠卡片盒 */}
          {similarEntry && (
            <div className="overflow-hidden rounded-[10px] border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-card-bg,var(--color-bg))]">
              <button
                type="button"
                onClick={() => onSelectEntry(similarEntry)}
                className="flex w-full items-center justify-between border-b border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-lane-bg)] px-3.5 py-2 text-left text-[0.78rem] font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
              >
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="text-[var(--color-text-muted)]">
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
                  className="size-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
                />
                <span className="truncate">{similarBilingualTitle}</span>
              </button>
            </div>
          )}

          {/* Details / Activity feed / Editor 分段标签页 */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-5 border-b border-[var(--roadmap-divider,var(--color-border))]">
              <button
                type="button"
                onClick={() => setActiveTab('details')}
                className={`inline-flex items-center gap-1.5 border-b-2 pb-2.5 text-[0.82rem] font-medium transition-colors ${
                  activeTab === 'details'
                    ? 'border-[var(--color-accent)] text-[var(--color-text)]'
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
                    ? 'border-[var(--color-accent)] text-[var(--color-text)]'
                    : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                Activity feed
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setActiveTab('editor')}
                  className={`inline-flex items-center gap-1.5 border-b-2 pb-2.5 text-[0.82rem] font-medium transition-colors ${
                    activeTab === 'editor'
                      ? 'border-[var(--color-accent)] text-[var(--color-text)]'
                      : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                  }`}
                >
                  Editor
                </button>
              )}
            </div>

            {activeTab === 'activity' && (
              <div className="relative flex flex-col gap-0">
                {/* 节点 1：真实创建时间记录 */}
                {createdDateText && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-lane-bg)] px-3.5 py-2.5 text-[0.8rem]">
                      <span className="inline-flex items-center gap-2">
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <circle cx="8" cy="8" r="6.5" fill="var(--roadmap-status-completed, #2f8566)" />
                          <path
                            d="m5.3 8.1 1.85 1.85L10.8 6.2"
                            stroke="#ffffff"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span className="font-medium text-[var(--color-text)]">cpp</span>
                        <span className="text-[var(--color-text-muted)]">
                          {locale === 'zh' ? '创建了此提议' : 'created this proposal'}
                        </span>
                      </span>
                      <span className="text-[0.75rem] text-[var(--color-text-soft)]">{createdDateText}</span>
                    </div>

                    {/* 时间轴连接竖线 */}
                    <div className="ml-5 h-3.5 w-px bg-[var(--roadmap-divider,var(--color-border))]" />
                  </>
                )}

                {/* 节点 2：动态阶段与修改记录（方案 3-A） */}
                {updatedDateText && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-lane-bg)] px-3.5 py-2.5 text-[0.8rem]">
                    <span className="inline-flex items-center gap-2">
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <circle cx="8" cy="8" r="6" stroke="var(--color-accent)" strokeWidth="1.6" />
                        <path d="M8 2a6 6 0 0 0 0 12V2Z" fill="var(--color-accent)" />
                      </svg>
                      <span className="font-medium text-[var(--color-text)]">cpp</span>
                      <span className="text-[var(--color-text-muted)]">
                        {locale === 'zh'
                          ? `更新了提议（当前阶段：${statusLabel} · 优先级：${chrome.priorityLabels[selectedPriority]}）`
                          : `updated proposal (currently ${statusLabel} · ${chrome.priorityLabels[selectedPriority]})`}
                      </span>
                    </span>
                    <span className="text-[0.75rem] text-[var(--color-text-soft)]">{updatedDateText}</span>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'details' && (
              <div className="flex min-h-[104px] items-center justify-center rounded-[10px] border border-dashed border-[var(--roadmap-divider,var(--color-border))] bg-[var(--roadmap-lane-bg)]/50 px-4 py-6 text-[0.78rem] text-[var(--color-text-soft)]">
                {editedDetail.trim() ? (
                  <p className="w-full whitespace-pre-wrap text-left text-[0.82rem] leading-relaxed text-[var(--color-text)]">
                    {editedDetail}
                  </p>
                ) : (
                  chrome.pendingDetail
                )}
              </div>
            )}

            {activeTab === 'editor' && (
              <div className="overflow-hidden rounded-[10px] border border-[var(--roadmap-divider,var(--color-border))] bg-[var(--roadmap-card-bg,var(--color-bg))] shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
                {/* 编辑器顶栏状态与重置操作 */}
                <div className="flex items-center justify-between border-b border-[var(--roadmap-divider,var(--color-border))] bg-[var(--roadmap-lane-bg)]/80 px-3.5 py-2">
                  <div className="inline-flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-[var(--color-accent)]" />
                    <span className="text-[0.74rem] font-semibold tracking-wide text-[var(--color-text)]">
                      Proposal Editor
                    </span>
                    <span className="rounded-[5px] border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-card-bg,var(--color-bg))] px-1.5 py-0.5 text-[0.68rem] text-[var(--color-text-soft)]">
                      Live sync
                    </span>
                  </div>
                  {isDirty && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isCreate) {
                          setEditedTitle('');
                          setEditedSummary('');
                          setEditedDetail('');
                        } else {
                          setEditedTitle(defaultBilingualTitle);
                          setEditedSummary(entry.summary[locale]);
                          setEditedDetail(entry.detail?.[locale] ?? '');
                        }
                        setSavedToast(false);
                        setSaveError(null);
                      }}
                      className="text-[0.72rem] font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* 分栏紧凑表单字段：字段名保持单语，序号与说明文字已按界面规格移除 */}
                <div className="divide-y divide-[var(--roadmap-divider,var(--color-border))]">
                  <label className="flex flex-col gap-1.5 p-3.5 transition-colors focus-within:bg-[var(--roadmap-lane-bg)]/30">
                    <span className="text-[0.74rem] font-semibold text-[var(--color-text)]">
                      Title
                    </span>
                    <input
                      type="text"
                      aria-label="Title"
                      value={editedTitle}
                      onChange={(event) => {
                        setEditedTitle(event.target.value);
                        setSavedToast(false);
                      }}
                      className="w-full rounded-[7px] border border-[var(--roadmap-divider,var(--color-border))] bg-[var(--roadmap-lane-bg)]/45 px-3 py-1.5 text-[0.82rem] font-medium text-[var(--color-text)] outline-none transition-all focus:border-[var(--color-border-focus,var(--color-accent))] focus:bg-[var(--roadmap-card-bg,var(--color-bg))] focus:ring-2 focus:ring-[var(--color-ring-focus)]"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5 p-3.5 transition-colors focus-within:bg-[var(--roadmap-lane-bg)]/30">
                    <div className="flex items-center justify-between">
                      <span className="text-[0.74rem] font-semibold text-[var(--color-text)]">
                        Summary
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
                      className="w-full resize-none rounded-[7px] border border-[var(--roadmap-divider,var(--color-border))] bg-[var(--roadmap-lane-bg)]/45 px-3 py-1.5 text-[0.81rem] leading-relaxed text-[var(--color-text)] outline-none transition-all focus:border-[var(--color-border-focus,var(--color-accent))] focus:bg-[var(--roadmap-card-bg,var(--color-bg))] focus:ring-2 focus:ring-[var(--color-ring-focus)]"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5 p-3.5 transition-colors focus-within:bg-[var(--roadmap-lane-bg)]/30">
                    <span className="text-[0.74rem] font-semibold text-[var(--color-text)]">
                      Detail
                    </span>
                    <textarea
                      rows={3}
                      aria-label="Detail"
                      value={editedDetail}
                      onChange={(event) => {
                        setEditedDetail(event.target.value);
                        setSavedToast(false);
                      }}
                      placeholder="输入具体内容与方案说明..."
                      className="w-full resize-none rounded-[7px] border border-[var(--roadmap-divider,var(--color-border))] bg-[var(--roadmap-lane-bg)]/45 px-3 py-2 text-[0.81rem] leading-relaxed text-[var(--color-text)] outline-none transition-all focus:border-[var(--color-border-focus,var(--color-accent))] focus:bg-[var(--roadmap-card-bg,var(--color-bg))] focus:ring-2 focus:ring-[var(--color-ring-focus)]"
                    />
                  </label>
                </div>

                {/* 底部保存与预览操作条 */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--roadmap-divider,var(--color-border))] bg-[var(--roadmap-lane-bg)]/50 px-3.5 py-2">
                  <span className="text-[0.72rem] text-[var(--color-text-soft)]">
                    {saveError ? (
                      <span className="text-[var(--roadmap-danger-fg,#b91c1c)]">{saveError}</span>
                    ) : savedToast ? (
                      '✓ Draft updated in current view'
                    ) : (
                      'Changes reflect immediately in header'
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('details')}
                      className="rounded-[6px] border border-[var(--roadmap-divider,var(--color-border))] bg-[var(--roadmap-card-bg,var(--color-bg))] px-2.5 py-1 text-[0.73rem] font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
                    >
                      Preview Details
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={isCreate && editedTitle.trim() === ''}
                      className="rounded-[6px] bg-[var(--color-accent)] px-3 py-1 text-[0.73rem] font-medium text-[var(--color-accent-fg,#ffffff)] shadow-2xs transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右侧元数据与流转/删除侧栏 */}
        <aside className="flex w-full shrink-0 flex-col justify-between border-t border-[var(--roadmap-divider,var(--color-border))] bg-[var(--roadmap-lane-bg)]/55 md:w-[288px] md:rounded-r-[15px] md:border-t-0 md:border-l">
          <div className="space-y-3.5 p-4 text-[0.8rem] sm:p-6">
            {/* Status 扁平化下拉选择：支持直达任意阶段 */}
            <div className="grid grid-cols-[84px_1fr] items-center">
              <span className="text-[var(--color-text-muted)]">Status</span>
              <div className="relative">
                <button
                  type="button"
                  aria-label="Select Status"
                  aria-haspopup="listbox"
                  aria-expanded={openSelector === 'status'}
                  disabled={!canEdit}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!canEdit) return;
                    setOpenSelector((prev) => (prev === 'status' ? null : 'status'));
                  }}
                  style={{
                    backgroundColor: statusStyle.bg,
                    color: statusStyle.fg,
                    borderColor: statusStyle.border,
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.74rem] font-medium leading-5 whitespace-nowrap transition-opacity hover:opacity-85 focus:outline-none disabled:cursor-default"
                >
                  <span aria-hidden="true" className="inline-flex shrink-0">
                    <CurrentStatusIcon />
                  </span>
                  <span>{statusLabel}</span>
                  {canEdit && (
                    <span
                      aria-hidden="true"
                      className={`ml-0.5 inline-flex text-[var(--color-text-soft)] transition-transform ${
                        openSelector === 'status' ? 'rotate-180' : ''
                      }`}
                    >
                      <IconChevronDown />
                    </span>
                  )}
                </button>

                {canEdit && openSelector === 'status' && (
                  <ul
                    role="listbox"
                    aria-label="Status options"
                    onClick={(event) => event.stopPropagation()}
                    className="absolute left-0 z-30 mt-1.5 w-[176px] rounded-[9px] border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-popover-bg,var(--color-bg))] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.22)]"
                  >
                    {effectiveStatusOptions.map((statusOption) => {
                      const active = selectedStatus === statusOption;
                      const OptionStatusIcon = statusIcons[statusOption];
                      return (
                        <li key={statusOption} role="option" aria-selected={active}>
                          <button
                            type="button"
                            onClick={() => void handleStatusPick(statusOption)}
                            className={`flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-left text-[0.75rem] font-medium transition-colors ${
                              active
                                ? 'bg-[var(--roadmap-chip-bg)] text-[var(--color-text)]'
                                : 'text-[var(--color-text-muted)] hover:bg-[var(--roadmap-chip-bg)]/70 hover:text-[var(--color-text)]'
                            }`}
                          >
                            <span className="inline-flex items-center gap-2 truncate">
                              <span
                                aria-hidden="true"
                                className="inline-flex shrink-0"
                                style={{ color: statusColors[statusOption] }}
                              >
                                <OptionStatusIcon />
                              </span>
                              <span className="truncate">{labelForStatus(statusOption)}</span>
                            </span>
                            {active && (
                              <span
                                aria-hidden="true"
                                className="ml-1.5 shrink-0 text-[0.72rem] font-semibold text-[var(--color-accent)]"
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

            {/* Board 扁平化下拉选择（箭头内嵌，展开项去除胶囊套娃边框） */}
            <div className="grid grid-cols-[84px_1fr] items-center">
              <span className="text-[var(--color-text-muted)]">Board</span>
              <div className="relative">
                <button
                  type="button"
                  aria-label="Select Board"
                  aria-haspopup="listbox"
                  aria-expanded={openSelector === 'board'}
                  disabled={!canEdit}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!canEdit) return;
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
                  {canEdit && (
                    <span
                      aria-hidden="true"
                      className={`ml-0.5 inline-flex text-[var(--color-text-soft)] transition-transform ${
                        openSelector === 'board' ? 'rotate-180' : ''
                      }`}
                    >
                      <IconChevronDown />
                    </span>
                  )}
                </button>

                {canEdit && openSelector === 'board' && (
                  <ul
                    role="listbox"
                    aria-label="Board options"
                    onClick={(event) => event.stopPropagation()}
                    className="absolute left-0 z-30 mt-1.5 w-[164px] rounded-[9px] border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-popover-bg,var(--color-bg))] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.22)]"
                  >
                    {boardTypeOptions.map((typeOption) => {
                      const active = selectedType === typeOption;
                      const OptionIcon = typeIcons[typeOption];
                      const optionStyle = typeSelectorStyles[typeOption];
                      return (
                        <li key={typeOption} role="option" aria-selected={active}>
                          <button
                            type="button"
                            onClick={() => void handleTypePick(typeOption)}
                            className={`flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-left text-[0.75rem] font-medium transition-colors ${
                              active
                                ? 'bg-[var(--roadmap-chip-bg)] text-[var(--color-text)]'
                                : 'text-[var(--color-text-muted)] hover:bg-[var(--roadmap-chip-bg)]/70 hover:text-[var(--color-text)]'
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
                                className="ml-1.5 shrink-0 text-[0.72rem] font-semibold text-[var(--color-accent)]"
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
                  disabled={!canEdit}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!canEdit) return;
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
                  {canEdit && (
                    <span
                      aria-hidden="true"
                      className={`ml-0.5 inline-flex text-[var(--color-text-soft)] transition-transform ${
                        openSelector === 'tags' ? 'rotate-180' : ''
                      }`}
                    >
                      <IconChevronDown />
                    </span>
                  )}
                </button>

                {canEdit && openSelector === 'tags' && (
                  <ul
                    role="listbox"
                    aria-label="Tags options"
                    onClick={(event) => event.stopPropagation()}
                    className="absolute left-0 z-30 mt-1.5 w-[164px] rounded-[9px] border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-popover-bg,var(--color-bg))] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.22)]"
                  >
                    {priorityTagOptions.map((priorityOption) => {
                      const active = selectedPriority === priorityOption;
                      const optionStyle = prioritySelectorStyles[priorityOption];
                      return (
                        <li key={priorityOption} role="option" aria-selected={active}>
                          <button
                            type="button"
                            onClick={() => void handlePriorityPick(priorityOption)}
                            className={`flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-left text-[0.75rem] font-medium transition-colors ${
                              active
                                ? 'bg-[var(--roadmap-chip-bg)] text-[var(--color-text)]'
                                : 'text-[var(--color-text-muted)] hover:bg-[var(--roadmap-chip-bg)]/70 hover:text-[var(--color-text)]'
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
                                className="ml-1.5 shrink-0 text-[0.72rem] font-semibold text-[var(--color-accent)]"
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
              <span className="text-[var(--color-text)]">{createdDateText ?? '—'}</span>
            </div>

            <div className="grid grid-cols-[84px_1fr] items-center">
              <span className="text-[var(--color-text-muted)]">Author</span>
              <div className="inline-flex items-center gap-2">
                <span className="relative inline-flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-amber-500 text-[0.7rem] font-semibold text-white">
                  C
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 flex size-2.5 items-center justify-center rounded-full bg-[var(--color-accent)] text-[7px] text-[var(--color-accent-fg,#ffffff)] ring-1 ring-[var(--roadmap-modal-bg,var(--color-bg))]"
                  >
                    ✓
                  </span>
                </span>
                <span className="font-medium text-[var(--color-text)]">cpp</span>
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
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--roadmap-chip-border,var(--color-border))] bg-[var(--roadmap-card-bg,var(--color-bg))] px-2 py-0.5 text-[0.71rem] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                    >
                      <IconLink />
                      {link.label[locale]}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 阶段流转与删除操作区：非 Owner 隐藏；推进与回退目标状态由看板配置指定 */}
          {canEdit && !isCreate && (
            <div className="border-t border-[var(--roadmap-divider,var(--color-border))] p-4 sm:p-6">
              <h3 className="text-[0.86rem] font-semibold text-[var(--color-text)]">
                Stage & actions
              </h3>
              <div className="mt-3.5 flex flex-wrap items-center gap-2">
                {advanceStatus && (
                  <button
                    type="button"
                    aria-label="Advance"
                    title={`Advance to ${labelForStatus(advanceStatus)}`}
                    onClick={() => void handleAdvance()}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent)] px-3.5 py-1.5 text-[0.78rem] font-medium text-[var(--color-accent-fg,#ffffff)] shadow-xs transition-opacity hover:opacity-90"
                  >
                    Advance
                  </button>
                )}

                {!isFirstColumn && undoStatus && (
                  <button
                    type="button"
                    aria-label="Undo"
                    title={`Move back to ${labelForStatus(undoStatus)}`}
                    onClick={() => void handleUndo()}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-card-bg,var(--color-bg))] px-3.5 py-1.5 text-[0.78rem] font-medium text-[var(--color-text)] shadow-xs transition-colors hover:border-[var(--roadmap-border-hover,var(--color-text-soft))] hover:bg-[var(--roadmap-lane-bg)]"
                  >
                    Undo
                  </button>
                )}

                <button
                  type="button"
                  aria-label="Delete"
                  onClick={() => void handleDelete()}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.78rem] font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--roadmap-danger-bg,rgba(184,74,72,0.08))] hover:text-[var(--roadmap-danger-fg,#a63838)] focus-visible:bg-[var(--roadmap-danger-bg,rgba(184,74,72,0.08))] focus-visible:text-[var(--roadmap-danger-fg,#a63838)]"
                >
                  <svg
                    aria-hidden="true"
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                  <span>Delete</span>
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode;
}
