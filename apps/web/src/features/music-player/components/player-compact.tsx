'use client';

import { PlayerChevronIcon, PlayerPauseIcon, PlayerPlayIcon } from './player-icons';

/** compact 胶囊与展开卡片共用同一宽度：两种状态只改高度，横向零位移。 */
export const playerSurfaceWidthClass = 'w-[min(22rem,calc(100vw-2.5rem))]';

type PlayerCompactProps = {
  title: string;
  clock: string;
  rateLabel: string;
  playLabel: string;
  pauseLabel: string;
  collapseLabel: string;
  expandListLabel: string;
  collapseListLabel: string;
  isPlaying: boolean;
  fullWidth: boolean;
  listExpanded: boolean;
  showOrbToggle: boolean;
  /** pill 自带边框与圆角；bare 用于展开卡片内部，避免“卡片里再嵌一个胶囊”。 */
  variant?: 'pill' | 'bare';
  onTogglePlay: () => void;
  onCollapse: () => void;
  onToggleList: () => void;
};

// 圆形封面/时长：与播放按钮同尺寸，配色用表面色 + 前景色，而不是反相的主按钮样式。
const clockClassName =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-nav-item-active)] text-[0.62rem] font-medium tabular-nums text-[var(--color-text)]';

export function PlayerCompact({
  title,
  clock,
  rateLabel,
  playLabel,
  pauseLabel,
  collapseLabel,
  expandListLabel,
  collapseListLabel,
  isPlaying,
  fullWidth,
  listExpanded,
  showOrbToggle,
  variant = 'pill',
  onTogglePlay,
  onCollapse,
  onToggleList,
}: PlayerCompactProps) {
  const widthClass = fullWidth ? 'w-full' : playerSurfaceWidthClass;

  const containerClassName =
    variant === 'pill'
      ? `flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-nav-dropdown-bg)] py-1.5 pl-1.5 pr-2 shadow-[var(--shadow-nav-dropdown)] ${widthClass}`
      : `flex items-center gap-2 py-1.5 pl-1.5 pr-2 ${widthClass}`;

  return (
    <div className={containerClassName}>
      <button
        type="button"
        data-player-interactive
        onClick={onTogglePlay}
        aria-label={isPlaying ? pauseLabel : playLabel}
        className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--color-nav-item-active)] text-[var(--color-text)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-nav-item-hover)]"
      >
        {isPlaying ? <PlayerPauseIcon className="h-4 w-4" /> : <PlayerPlayIcon className="h-4 w-4" />}
      </button>

      {/* 点击标题展开列表；按住并移动超过阈值仍由宿主拖拽接管。 */}
      <span
        role="button"
        tabIndex={0}
        onClick={onToggleList}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggleList();
          }
        }}
        className="min-w-0 flex-1 cursor-pointer truncate text-[0.82rem] font-medium text-[var(--color-text)]"
      >
        {title}
      </span>

      <span className="shrink-0 text-[0.72rem] tabular-nums text-[var(--color-text-soft)]">{rateLabel}</span>

      {/* 箭头只管列表：折叠时朝下、展开时朝上，与参考图一致。 */}
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
          className={`${clockClassName} cursor-pointer transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-nav-item-hover)]`}
        >
          {clock}
        </button>
      ) : (
        <span aria-hidden className={clockClassName}>
          {clock}
        </span>
      )}
    </div>
  );
}
