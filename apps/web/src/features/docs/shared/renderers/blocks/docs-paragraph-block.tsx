import type { DocsParagraphBlockModel } from '@/features/docs/block-system';

// 段落块组件，根据提供的文本内容和可选的变体（如引导、柔和等）渲染不同样式的段落，适用于文档中的普通文本内容展示
export function DocsParagraphBlock({
  text,
  variant = 'default',
  width = 'default',
  spacing = 'default',
}: DocsParagraphBlockModel) {
  const variantClassName =
    variant === 'lead'
      ? 'text-[1.06rem] text-[var(--color-text)]'
      : variant === 'muted'
        ? 'text-[0.97rem] text-[var(--color-text-soft)]'
        : 'text-[1rem] text-[var(--color-text-muted)]';

  const widthClassName =
    width === 'narrow'
      ? 'max-w-[54ch]'
      : width === 'wide'
        ? 'max-w-[72ch]'
        : 'max-w-[64ch]';

  const spacingClassName =
    spacing === 'relaxed' ? 'leading-[2.2]' : 'leading-8';

  const className = [variantClassName, widthClassName, spacingClassName].join(' ');

  return <p className={className}>{text}</p>;
}
