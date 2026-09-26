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
