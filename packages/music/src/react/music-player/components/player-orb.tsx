'use client';

type PlayerOrbProps = {
  label: string;
  title: string;
  clock: string;
  totalClock: string;
  onClick: () => void;
  isPlaying?: boolean;
  currentTime?: number;
  duration?: number;
  statusText?: string | null;
};

export function PlayerOrb({
  label,
  title,
  clock,
  totalClock,
  onClick,
  isPlaying = false,
  currentTime = 0,
  duration = 0,
  statusText = null,
}: PlayerOrbProps) {
  const isReady = Number.isFinite(duration) && duration > 0;
  const clampedTime = isReady ? Math.max(0, Math.min(currentTime, duration)) : 0;
  const percent = isReady ? (clampedTime / duration) * 100 : 0;
  // 40px 规格，半径 18.75，描边 1.75px 贴合外轮廓
  const radius = 18.75;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = isReady ? circumference * (1 - percent / 100) : circumference;
  const tooltip = statusText
    ? `${title} · ${clock} / ${totalClock} · ${statusText}`
    : `${title} · ${clock} / ${totalClock}`;

  // 不带 data-player-interactive：点击（<4px）展开，拖动（>=4px）换位，拖动后的 click 由 onClickCapture 吞掉
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={tooltip}
      className="group relative flex size-10 cursor-pointer select-none items-center justify-center rounded-full border border-[var(--color-nav-dropdown-border,var(--color-border))] bg-[var(--color-nav-dropdown-bg)] shadow-[var(--shadow-nav-dropdown)] transition-transform duration-150 hover:scale-[1.04] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)]"
    >
      {isReady && percent > 0 ? (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full -rotate-90"
          viewBox="0 0 40 40"
        >
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke="var(--color-border-faint)"
            strokeWidth="1.75"
          />
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke="var(--color-accent)"
            className="transition-[stroke-dashoffset] duration-150"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>
      ) : null}

      <div
        aria-hidden="true"
        className={`pointer-events-none relative flex h-3.5 items-end gap-[2.5px] transition-colors duration-150 ${
          isPlaying
            ? 'text-[var(--color-accent)]'
            : 'text-[var(--color-nav-muted)] group-hover:text-[var(--color-text)]'
        }`}
      >
        <span className={`w-[2px] rounded-full bg-current ${isPlaying ? 'animate-music-bar-1' : 'h-1.5'}`} />
        <span className={`w-[2px] rounded-full bg-current ${isPlaying ? 'animate-music-bar-2' : 'h-3'}`} />
        <span className={`w-[2px] rounded-full bg-current ${isPlaying ? 'animate-music-bar-3' : 'h-2'}`} />
      </div>

      {statusText ? (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[var(--badge-amber-dot)] ring-2 ring-[var(--color-nav-dropdown-bg)]"
        />
      ) : null}
    </button>
  );
}
