import type { DocsHeadingBlockModel } from '@/features/docs/block-system';

// 标题块组件，根据提供的标题级别、文本内容和可选的变体（如显示、紧凑、细微等）渲染不同样式的标题，适用于文档中的章节标题和小节标题等不同层级的标题展示
export function DocsHeadingBlock({ id, level, text, variant = 'default' }: DocsHeadingBlockModel) {
  const className =
    variant === 'display'
      ? 'text-[1.52rem] font-semibold tracking-[-0.05em] text-[var(--color-text)] md:text-[1.7rem]'
      : variant === 'compact'
        ? 'text-[1rem] font-semibold tracking-[-0.02em] text-[var(--color-text)] md:text-[1.08rem]'
        : variant === 'subtle'
          ? 'text-[0.9rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-nav-muted)]'
          : level === 1
            ? 'text-[1.45rem] font-semibold tracking-[-0.04em] text-[var(--color-text)] md:text-[1.6rem]'
            : level === 2
              ? 'text-[1.18rem] font-semibold tracking-[-0.03em] text-[var(--color-text)] md:text-[1.28rem]'
              : level === 3
                ? 'text-[1rem] font-semibold tracking-[-0.02em] text-[var(--color-text)] md:text-[1.08rem]'
                : 'text-[0.9rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-nav-muted)]';

  const HeadingTag =
    level === 1 ? 'h2' : level === 2 ? 'h3' : level === 3 ? 'h4' : 'h5';

  return (
    <HeadingTag id={id} className={`${className} scroll-mt-28`}>
      {text}
    </HeadingTag>
  );
}
