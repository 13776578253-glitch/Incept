import type { DocsHeadingBlockModel } from '@/features/docs/block-system';
import { DocsInlineContent } from '../docs-inline-content';

// 标题块组件，根据提供的标题级别、文本内容和可选的变体（如显示、紧凑、细微等）渲染不同样式的标题，适用于文档中的章节标题和小节标题等不同层级的标题展示
export function DocsHeadingBlock({ id, level, text, content, variant = 'default' }: DocsHeadingBlockModel) {
  const className =
    variant === 'display'
      ? 'text-[length:calc(var(--docs-font-size)*1.28)] leading-[1.32] font-semibold tracking-[-0.025em] text-[var(--color-text)] [text-wrap:balance] md:text-[length:calc(var(--docs-font-size)*1.4)]'
      : variant === 'compact'
        ? 'text-[length:var(--docs-font-size)] leading-[1.45] font-semibold tracking-[-0.01em] text-[var(--color-text)] md:text-[length:calc(var(--docs-font-size)*1.04)]'
        : variant === 'subtle'
          ? 'text-[0.85rem] leading-[1.45] font-semibold uppercase tracking-[0.12em] text-[var(--color-nav-muted)]'
          : level === 1
            ? 'text-[length:calc(var(--docs-font-size)*1.24)] leading-[1.34] font-semibold tracking-[-0.02em] text-[var(--color-text)] [text-wrap:balance] md:text-[length:calc(var(--docs-font-size)*1.34)]'
            : level === 2
              ? 'text-[length:calc(var(--docs-font-size)*1.1)] leading-[1.4] font-semibold tracking-[-0.015em] text-[var(--color-text)] md:text-[length:calc(var(--docs-font-size)*1.16)]'
              : level === 3
                ? 'text-[length:var(--docs-font-size)] leading-[1.45] font-semibold tracking-[-0.01em] text-[var(--color-text)] md:text-[length:calc(var(--docs-font-size)*1.04)]'
                : 'text-[0.85rem] leading-[1.45] font-semibold uppercase tracking-[0.12em] text-[var(--color-nav-muted)]';

  const HeadingTag =
    level === 1 ? 'h2' : level === 2 ? 'h3' : level === 3 ? 'h4' : 'h5';

  return (
    <HeadingTag id={id} className={`${className} scroll-mt-24`}>
      {content ? <DocsInlineContent content={content} /> : text}
    </HeadingTag>
  );
}
