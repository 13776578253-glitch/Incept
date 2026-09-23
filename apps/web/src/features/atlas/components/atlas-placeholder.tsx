import type { ReactNode } from 'react';

type AtlasPlaceholderProps = {
  eyebrow: string;
  title: string;
  description: string;
  backLabel: string;
  backHref: string;
  children?: ReactNode;
};

// 子图谱尚未实现时的占位内容。
// 明确标出「尚未实现」，避免路由已存在被误读为功能已就绪。
export function AtlasPlaceholder({
  eyebrow,
  title,
  description,
  backLabel,
  backHref,
  children,
}: AtlasPlaceholderProps) {
  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-6 pt-10 pb-16 lg:px-10">
      <header className="max-w-[720px] space-y-4">
        <p className="text-[0.76rem] uppercase tracking-[0.2em] text-[var(--color-text-soft)]">
          {eyebrow}
        </p>
        <h1 className="text-[clamp(1.8rem,3.5vw,2.8rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--color-text)]">
          {title}
        </h1>
        <p className="text-[1.02rem] leading-8 text-[var(--color-text-muted)]">{description}</p>
      </header>

      {children}

      <div>
        <a
          href={backHref}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-1.5 text-[0.9rem] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-text-soft)] hover:text-[var(--color-text)]"
        >
          <span aria-hidden="true">←</span>
          <span>{backLabel}</span>
        </a>
      </div>
    </div>
  );
}
