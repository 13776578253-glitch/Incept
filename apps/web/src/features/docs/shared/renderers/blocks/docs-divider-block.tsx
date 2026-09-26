import type { DocsDividerBlockModel } from '@/features/docs/block-system';

// 分割线块组件，根据提供的变体（如默认或宽松）渲染不同样式的分割线，用于在文档内容中分隔不同的部分，增强内容的层次感和可读性
export function DocsDividerBlock({
  variant = 'default',
}: DocsDividerBlockModel) {
  return (
    <hr
      className={
        variant === 'spacious'
          ? 'my-10 border-0 border-t border-[color:var(--color-border-strong)]'
          : 'my-6 border-0 border-t border-[color:var(--color-border-strong)]'
      }
    />
  );
}
