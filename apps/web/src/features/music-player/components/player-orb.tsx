'use client';

type PlayerOrbProps = {
  label: string;
  clock: string;
  onClick: () => void;
};

export function PlayerOrb({ label, clock, onClick }: PlayerOrbProps) {
  return (
    <button
      type="button"
      data-player-interactive
      onClick={onClick}
      aria-label={label}
      className="relative flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-nav-dropdown-bg)] shadow-[var(--shadow-nav-dropdown)] transition-transform duration-[var(--duration-fast)] hover:scale-[1.03]"
    >
      <span aria-hidden className="absolute inset-[5px] rounded-full bg-[var(--color-nav-item-active)]" />
      <span className="relative text-[0.62rem] font-medium tabular-nums text-[var(--color-text)]">
        {clock}
      </span>
    </button>
  );
}
