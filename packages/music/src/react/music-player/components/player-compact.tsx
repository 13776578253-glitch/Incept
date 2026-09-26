'use client';

import { PlayerChevronIcon, PlayerPauseIcon, PlayerPlayIcon } from './player-icons';

/** compact 胶囊与展开卡片共用的宽度 */
export const playerSurfaceWidthClass = 'w-[min(22rem,calc(100vw-2.5rem))]';

type PlayerCompactProps = {
  title: string;
  clock: string;
  totalClock: string;
  rateLabel: string;
  playLabel: string;
  pauseLabel: string;
  collapseLabel: string;
  expandListLabel: string;
  collapseListLabel: string;
  rateCycleLabel: string;
  isPlaying: boolean;
  fullWidth: boolean;
  listExpanded: boolean;
  showOrbToggle: boolean;
  /** pill 自带边框与圆角；bare 用于展开卡片内部 */
  variant?: 'pill' | 'bare';
  onTogglePlay: () => void;
  onCollapse: () => void;
  onToggleList: () => void;
  onCycleRate: () => void;
};

// 圆形封面/时长：与播放按钮同尺寸，配色用表面色 + 前景色
const clockClassName =
  'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-nav-item-active)] text-[0.62rem] font-medium tabular-nums text-[var(--color-text)]';

export function PlayerCompact({
  title,
  clock,
  totalClock,
  rateLabel,
  playLabel,
  pauseLabel,
  collapseLabel,
  expandListLabel,
  collapseListLabel,
  rateCycleLabel,
  isPlaying,
  fullWidth,
  listExpanded,
  showOrbToggle,
  variant = 'pill',
  onTogglePlay,
  onCollapse,
  onToggleList,
  onCycleRate,
}: PlayerCompactProps) {
  const widthClass = fullWidth ? 'w-full' : playerSurfaceWidthClass;

  const containerClassName =
    variant === 'pill'
      ? `flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-nav-dropdown-bg)] py-1.5 pl-1.5 pr-2 shadow-[var(--shadow-nav-dropdown)] backdrop-blur-md ${widthClass}`
      : `flex items-center gap-2 py-1.5 pl-1.5 pr-2 ${widthClass}`;

  return (
    <div className={containerClassName}>
      <button
        type="button"
        data-player-interactive
        onClick={onTogglePlay}
        aria-label={isPlaying ? pauseLabel : playLabel}
        className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--color-pill-active-bg)] text-[var(--color-text)] shadow-[var(--shadow-pill-active)] transition-all duration-[var(--duration-fast)] hover:scale-105 hover:bg-[var(--color-nav-item-hover)] active:scale-95"
      >
        {isPlaying ? <PlayerPauseIcon className="h-4 w-4" /> : <PlayerPlayIcon className="h-4 w-4" />}
      </button>

      {/* 标题是纯文本，不作为展开列表的入口 */}
      <span className="min-w-0 flex-1 truncate text-[0.82rem] font-medium text-[var(--color-text)]">{title}</span>

      {/* 倍速：档位定义在 adapter，在 core 的合法区间 */}
      <button
        type="button"
        data-player-interactive
        onClick={onCycleRate}
        aria-label={`${rateCycleLabel} ${rateLabel}`}
        className="shrink-0 cursor-pointer rounded-full px-1.5 py-1 text-[0.72rem] tabular-nums text-[var(--color-text-soft)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)]"
      >
        {rateLabel}
      </button>

      {/* 箭头：折叠时朝下、展开时朝上 */}
      <button
        type="button"
        data-player-interactive
        onClick={onToggleList}
        aria-label={listExpanded ? collapseListLabel : expandListLabel}
        aria-expanded={listExpanded}
        className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--color-nav-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-nav-item-hover)]"
      >
        <PlayerChevronIcon className={`h-3.5 w-3.5 ${listExpanded ? 'rotate-180' : ''}`} />
      </button>

      {/* 圆形封面/时长：桌面端点它收起到 orb；移动端没有 orb 态，只做展示。 */}
      {showOrbToggle ? (
        <button
          type="button"
          data-player-interactive
          onClick={onCollapse}
          aria-label={collapseLabel}
          className={`${clockClassName} group cursor-pointer transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-nav-item-hover)]`}
        >
          {/* 默认显示播放位置，悬浮切换为总时长 */}
          <span className="transition-opacity duration-[var(--duration-fast)] group-hover:opacity-0">
            {clock}
          </span>
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100"
          >
            {totalClock}
          </span>
        </button>
      ) : (
        <span aria-hidden className={`${clockClassName} group`}>
          <span className="transition-opacity duration-[var(--duration-fast)] group-hover:opacity-0">
            {clock}
          </span>
          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100">
            {totalClock}
          </span>
        </span>
      )}
    </div>
  );
}
