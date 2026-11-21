import type { DocsParagraphBlockModel } from '@/features/docs/block-system';
import { DocsInlineContent } from '../docs-inline-content';

// 段落块组件，根据提供的文本内容和可选的变体（如引导、柔和等）渲染不同样式的段落，适用于文档中的普通文本内容展示
export function DocsParagraphBlock({
  text,
  content,
  variant = 'default',
  spacing = 'default',
}: DocsParagraphBlockModel) {
  const variantClassName =
    variant === 'lead'
      ? 'text-[1.06rem] text-[var(--color-text)]'
      : variant === 'muted'
        ? 'text-[0.97rem] text-[var(--color-text-soft)]'
        : 'text-[1rem] text-[var(--color-text-muted)]';

  const spacingClassName =
    spacing === 'relaxed'
      ? 'leading-[var(--docs-paragraph-line-height-relaxed)]'
      : 'leading-[var(--docs-paragraph-line-height)]';

  const className = ['w-full max-w-full', variantClassName, spacingClassName].join(' ');

  return (
    <p className={className}>
      {content && content.length > 0
        ? <DocsInlineContent content={content} />
        : text}
    </p>
  );
}
