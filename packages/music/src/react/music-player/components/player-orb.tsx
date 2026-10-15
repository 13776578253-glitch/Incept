'use client';

type PlayerOrbProps = {
  label: string;
  clock: string;
  totalClock: string;
  onClick: () => void;
  isPlaying?: boolean;
  currentTime?: number;
  duration?: number;
};

export function PlayerOrb({
  label,
  clock,
  totalClock,
  onClick,
  isPlaying = false,
  currentTime = 0,
  duration = 0,
}: PlayerOrbProps) {
  const isReady = Number.isFinite(duration) && duration > 0;
  const clampedTime = isReady ? Math.max(0, Math.min(currentTime, duration)) : 0;
  const percent = isReady ? (clampedTime / duration) * 100 : 0;
  // 48px 规格，半径 22，描边 2px 贴合外轮廓，杜绝内外多层同心圈
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = isReady ? circumference * (1 - percent / 100) : circumference;

  return (
    <button
      type="button"
      data-player-interactive
      onClick={onClick}
      aria-label={label}
      title={`${clock} / ${totalClock}`}
      style={{ outline: 'none' }}
      className={`group relative flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-black/[0.04] dark:border-white/[0.05] bg-[var(--color-nav-dropdown-bg)]/95 backdrop-blur-xl transition-all duration-200 hover:scale-105 active:scale-95 outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 select-none ${
        isPlaying
          ? 'shadow-[0_4px_20px_-2px_rgba(14,165,233,0.35)] dark:shadow-[0_4px_24px_-2px_rgba(14,165,233,0.4)]'
          : 'shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08),0_2px_4px_-1px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_24px_-2px_rgba(0,0,0,0.6)] hover:shadow-[0_8px_24px_-2px_rgba(0,0,0,0.12),0_4px_8px_-1px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_12px_32px_-2px_rgba(0,0,0,0.8)]'
      }`}
    >
      {/* 边缘环形进度弧线：无多余的灰色内圈底线，仅在有进度时沿球体边缘平滑延伸天蓝弧线 */}
      {isReady && percent > 0 ? (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full -rotate-90"
          viewBox="0 0 48 48"
        >
          <circle
            cx="24"
            cy="24"
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-[var(--badge-sky-icon)] transition-[stroke-dashoffset] duration-150"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>
      ) : null}

      {/* 中心音乐信息核：声波律动柱 + 时间（杜绝双圆音符引起的眼睛错觉） */}
      <div className="relative flex flex-col items-center justify-center gap-1 select-none pointer-events-none">
        {/* 声波律动柱：播放时活跃跳跃，暂停时静止于柔和低位 */}
        <div
          aria-hidden="true"
          className={`flex h-3 items-end gap-[2px] px-0.5 transition-colors duration-200 ${
            isPlaying
              ? 'text-[var(--badge-sky-icon)]'
              : 'text-[var(--color-nav-muted)] group-hover:text-[var(--color-text-soft)]'
          }`}
        >
          <span
            className={`w-[2px] rounded-full bg-current transition-all duration-200 ${
              isPlaying ? 'animate-music-bar-1' : 'h-1.5'
            }`}
          />
          <span
            className={`w-[2px] rounded-full bg-current transition-all duration-200 ${
              isPlaying ? 'animate-music-bar-2' : 'h-3'
            }`}
          />
          <span
            className={`w-[2px] rounded-full bg-current transition-all duration-200 ${
              isPlaying ? 'animate-music-bar-3' : 'h-2'
            }`}
          />
        </div>

        {/* 紧凑时间戳（常态当前进度，悬浮平滑显现总时长） */}
        <div className="relative flex items-center justify-center">
          <span className="text-[0.62rem] font-semibold tabular-nums tracking-tight text-[var(--color-text)] transition-opacity duration-150 group-hover:opacity-0">
            {clock}
          </span>
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center text-[0.62rem] font-semibold tabular-nums tracking-tight text-[var(--color-text-soft)] opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          >
            {totalClock}
          </span>
        </div>
      </div>
    </button>
  );
}
