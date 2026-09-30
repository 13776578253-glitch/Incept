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
      className="group relative flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-nav-dropdown-bg)] shadow-[var(--shadow-nav-dropdown)] ring-1 ring-black/[0.03] dark:ring-white/[0.06] transition-transform duration-[var(--duration-fast)] hover:scale-[1.05] active:scale-95"
    >
      <span aria-hidden className="absolute inset-[4px] rounded-full border border-[var(--color-border)] bg-[var(--color-nav-item-active)] shadow-[var(--shadow-card-sm)]" />
      <span aria-hidden className="pointer-events-none absolute inset-[7px] rounded-full border border-dashed border-[var(--color-border)] opacity-60" />
      <span aria-hidden className="absolute inset-[10px] rounded-full bg-[var(--color-nav-item-active)] opacity-85" />
      {/* 默认播放位置，悬浮切总时长 */}
      <span className="relative z-10 text-[0.62rem] font-medium tabular-nums text-[var(--color-text)] transition-opacity duration-[var(--duration-fast)] group-hover:opacity-0">
        {clock}
      </span>
      <span
        aria-hidden
        className="absolute inset-0 z-10 flex items-center justify-center text-[0.62rem] font-medium tabular-nums text-[var(--color-text)] opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100"
      >
        {totalClock}
      </span>
    </button>
  );
}
