import type { Roadmap, RoadmapLocale } from '../domain';

type RoadmapSwitcherProps = {
  roadmaps: readonly Roadmap[];
  currentKey: string;
  locale: RoadmapLocale;
  hrefFor: (roadmapKey: string) => string;
  label: string;
};

// 多 roadmap 切换（T2 裁定）：服务端组件，链接即 ?rd= 切换，无客户端状态。
export function RoadmapSwitcher({
  roadmaps,
  currentKey,
  locale,
  hrefFor,
  label,
}: RoadmapSwitcherProps) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="text-[0.76rem] uppercase tracking-[0.2em] text-[var(--color-text-soft)]">
        {label}
      </span>
      {roadmaps.map((roadmap) => {
        const current = roadmap.key === currentKey;

        return (
          <a
            key={roadmap.key}
            href={hrefFor(roadmap.key)}
            aria-current={current ? 'true' : undefined}
            className={`rounded-full border px-3.5 py-2 text-[0.82rem] transition-colors ${
              current
                ? 'border-[var(--color-text-soft)] bg-[var(--roadmap-chip-bg)] text-[var(--color-text)]'
                : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-text-soft)] hover:text-[var(--color-text)]'
            }`}
          >
            {roadmap.name[locale]}
          </a>
        );
      })}
    </nav>
  );
}
