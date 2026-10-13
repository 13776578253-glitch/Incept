'use client';



export function SectionHeader({
  id,
  eyebrow,
  title,
  description,
  accentColor,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  accentColor: string;
}) {
  return (
    <header id={id} className="scroll-mt-24 space-y-1">
      <p className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-nav-muted)]">
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: accentColor }}
        />
        <span>{eyebrow}</span>
      </p>
      <div className="flex flex-col justify-between gap-1.5 lg:flex-row lg:items-baseline">
        <h2 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[var(--color-text)] md:text-[1.35rem]">
          {title}
        </h2>
        <p className="max-w-[46rem] text-[0.8rem] leading-5 text-[var(--color-text-muted)]">
          {description}
        </p>
      </div>
    </header>
  );
}
