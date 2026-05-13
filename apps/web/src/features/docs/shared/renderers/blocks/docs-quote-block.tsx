import type { DocsQuoteBlockModel } from '@/features/docs/block-system';

// 引用块组件，根据提供的引用文本、可选的出处信息和变体（如默认或强调）渲染不同样式的引用内容，适用于文档中的引用段落、名人名言等内容展示
export function DocsQuoteBlock({
  text,
  attribution,
}: DocsQuoteBlockModel) {
  return (
    <figure className="border-l-[4px] border-l-[var(--color-text)] pl-7">
      <blockquote className="text-[1.02rem] leading-8 text-[var(--color-text)]">
        {text}
      </blockquote>
      {attribution ? (
        <figcaption className="mt-3 text-[0.92rem] leading-7 text-[var(--color-text-muted)]">
          {attribution}
        </figcaption>
      ) : null}
    </figure>
  );
}
