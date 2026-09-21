'use client';

type PlayerOrbProps = {
  label: string;
  clock: string;
  totalClock: string;
  onClick: () => void;
};

export function PlayerOrb({ label, clock, totalClock, onClick }: PlayerOrbProps) {
  return (
    <button
      type="button"
      data-player-interactive
      onClick={onClick}
      aria-label={label}
      className="group relative flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-nav-dropdown-bg)] shadow-[var(--shadow-nav-dropdown)] transition-transform duration-[var(--duration-fast)] hover:scale-[1.03]"
    >
      <span aria-hidden className="absolute inset-[5px] rounded-full bg-[var(--color-nav-item-active)]" />
      {/* 默认播放位置，悬浮切总时长 */}
      <span className="relative text-[0.62rem] font-medium tabular-nums text-[var(--color-text)] transition-opacity duration-[var(--duration-fast)] group-hover:opacity-0">
        {clock}
      </span>
      <span
        aria-hidden
        className="absolute inset-0 flex items-center justify-center text-[0.62rem] font-medium tabular-nums text-[var(--color-text)] opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100"
      >
        {totalClock}
      </span>
    </button>
  );
}
