type RoadmapSampleBannerProps = {
  text: string;
};

// fixture 阶段的诚实标注（决策条目 3 + internal-surfaces 更新段）：虚线框与内容区分开。
export function RoadmapSampleBanner({ text }: RoadmapSampleBannerProps) {
  return (
    <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-text-soft)] px-4 py-3 text-[0.85rem] text-[var(--color-text-muted)]">
      {text}
    </p>
  );
}

type RoadmapSkeletonProps = {
  label: string;
};

export function RoadmapSkeleton({ label }: RoadmapSkeletonProps) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="flex flex-col gap-4">
      <span className="sr-only">{label}</span>
      <div className="flex flex-col gap-4 md:grid md:auto-cols-[minmax(280px,1fr)] md:grid-flow-col">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="flex flex-col gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--roadmap-lane-bg)] p-4"
          >
            <div className="h-5 w-24 animate-pulse rounded-full bg-[var(--roadmap-chip-bg)]" />
            <div className="h-28 animate-pulse rounded-[var(--radius-md)] bg-[var(--roadmap-chip-bg)]" />
            <div className="h-28 animate-pulse rounded-[var(--radius-md)] bg-[var(--roadmap-chip-bg)]" />
          </div>
        ))}
      </div>
    </div>
  );
}

type RoadmapErrorProps = {
  title: string;
  description: string;
};

export function RoadmapError({ title, description }: RoadmapErrorProps) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-6">
      <h2 className="text-[1rem] font-medium text-[var(--color-text)]">{title}</h2>
      <p className="text-[0.95rem] leading-7 text-[var(--color-text-muted)]">{description}</p>
    </div>
  );
}
