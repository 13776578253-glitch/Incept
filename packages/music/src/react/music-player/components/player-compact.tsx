'use client';

import { ChevronDown, Minimize2 } from 'lucide-react';

import { PlayerPauseIcon, PlayerPlayIcon } from './player-icons';

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
  currentTime?: number;
  duration?: number;
  statusText?: string | null;
  playbackRateLocked?: boolean;
  /** pill 自带边框与圆角；bare 用于展开卡片内部 */
  variant?: 'pill' | 'bare';
  onTogglePlay: () => void;
  onCollapse: () => void;
  onToggleList: () => void;
  onCycleRate: () => void;
};

const systemFont = { fontFamily: 'var(--font-stack-system, system-ui, sans-serif)' };
const iconButtonClass =
  'flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--color-nav-muted)] transition-colors duration-150 hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)]';

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
  currentTime = 0,
  duration = 0,
  statusText = null,
  playbackRateLocked = false,
  variant = 'pill',
  onTogglePlay,
  onCollapse,
  onToggleList,
  onCycleRate,
}: PlayerCompactProps) {
  const widthClass = fullWidth ? 'w-full' : playerSurfaceWidthClass;

  const containerClassName =
    variant === 'pill'
      ? `flex items-center gap-2 rounded-full border border-[var(--color-nav-dropdown-border,var(--color-border))] bg-[var(--color-nav-dropdown-bg)] py-1.5 pl-1.5 pr-2 shadow-[var(--shadow-nav-dropdown)] ${widthClass}`
      : `flex items-center gap-2 py-1.5 pl-2.5 pr-2 ${widthClass}`;

  const isReady = Number.isFinite(duration) && duration > 0;
  const percent = isReady ? (Math.max(0, Math.min(currentTime, duration)) / duration) * 100 : 0;
  const ringRadius = 16.75;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - percent / 100);
  const tooltip = statusText ? `${title} · ${statusText}` : `${title} · ${clock} / ${totalClock}`;

  return (
    <div className={containerClassName}>
      <button
        type="button"
        data-player-interactive
        onClick={onTogglePlay}
        aria-label={isPlaying ? pauseLabel : playLabel}
        className={`relative flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)] ${
          isPlaying
            ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
            : 'bg-[var(--color-surface-subtle)] text-[var(--color-text)] hover:bg-[var(--color-nav-item-hover)]'
        }`}
      >
        {isReady && percent > 0 ? (
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full -rotate-90"
            viewBox="0 0 36 36"
          >
            <circle cx="18" cy="18" r={ringRadius} fill="none" stroke="var(--color-border-faint)" strokeWidth="1.5" />
            <circle
              cx="18"
              cy="18"
              r={ringRadius}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray={ringCircumference}
              strokeDashoffset={ringOffset}
              className="transition-[stroke-dashoffset] duration-150"
            />
          </svg>
        ) : null}
        {isPlaying ? <PlayerPauseIcon className="size-3.5" /> : <PlayerPlayIcon className="size-3.5" />}
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-1.5" title={tooltip}>
        {statusText && variant === 'pill' ? (
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[var(--badge-amber-dot)]" />
        ) : isPlaying ? (
          <div aria-hidden="true" className="flex h-3 shrink-0 items-end gap-[2px] text-[var(--color-accent)]">
            <span className="w-[2px] rounded-full bg-current animate-music-bar-1" />
            <span className="w-[2px] rounded-full bg-current animate-music-bar-2" />
            <span className="w-[2px] rounded-full bg-current animate-music-bar-3" />
          </div>
        ) : null}
        <span
          style={systemFont}
          className="min-w-0 flex-1 truncate text-[length:var(--text-sm)] font-medium text-[var(--color-text)]"
        >
          {title}
        </span>
      </div>

      {/* 倍速：档位定义在 adapter，在 core 的合法区间 */}
      <button
        type="button"
        data-player-interactive
        onClick={onCycleRate}
        aria-label={`${rateCycleLabel} ${rateLabel}`}
        aria-disabled={playbackRateLocked || undefined}
        className={`shrink-0 cursor-pointer rounded-full px-2 py-0.5 text-[length:var(--text-2xs)] font-medium tabular-nums text-[var(--color-text-soft)] transition-colors duration-150 hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)] ${
          playbackRateLocked ? 'opacity-70' : ''
        }`}
      >
        {rateLabel}
      </button>

      <button
        type="button"
        data-player-interactive
        onClick={onToggleList}
        aria-label={listExpanded ? collapseListLabel : expandListLabel}
        aria-expanded={listExpanded}
        title={listExpanded ? collapseListLabel : expandListLabel}
        className={iconButtonClass}
      >
        <ChevronDown
          aria-hidden="true"
          className={`size-3.5 transition-transform duration-150 ${listExpanded ? 'rotate-180' : ''}`}
          strokeWidth={1.75}
        />
      </button>

      {showOrbToggle ? (
        <button
          type="button"
          data-player-interactive
          onClick={onCollapse}
          aria-label={collapseLabel}
          title={collapseLabel}
          className={iconButtonClass}
        >
          <Minimize2 aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  );
}
