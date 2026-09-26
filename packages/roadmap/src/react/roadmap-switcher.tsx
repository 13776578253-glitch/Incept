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
    <nav
      aria-label={label}
      className="inline-flex flex-wrap items-center gap-1 rounded-full border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-lane-bg)] p-1"
    >
      <span className="sr-only">{label}</span>
      {roadmaps.map((roadmap) => {
        const current = roadmap.key === currentKey;

        return (
          <a
            key={roadmap.key}
            href={hrefFor(roadmap.key)}
            aria-current={current ? 'true' : undefined}
            className={`inline-flex items-center rounded-full px-3.5 py-1 text-[0.8rem] font-medium transition-all ${
              current
                ? 'border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-card-bg,var(--color-bg))] text-[var(--color-text)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]'
                : 'border border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {roadmap.name[locale]}
          </a>
        );
      })}
    </nav>
  );
}

