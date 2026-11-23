import type { DocsQuoteBlockModel } from '@/features/docs/block-system';
import { DocsInlineContent } from '../docs-inline-content';

// 引用块组件，根据提供的引用文本、可选的出处信息和变体（如默认或强调）渲染不同样式的引用内容，适用于文档中的引用段落、名人名言等内容展示
export function DocsQuoteBlock({
  text,
  content,
  attribution,
}: DocsQuoteBlockModel) {
  return (
    <figure className="border-l-[2.5px] border-l-[color:var(--docs-quote-border)] py-0.5 pl-4 md:pl-5">
      <blockquote className="text-[length:var(--docs-font-size)] leading-[var(--docs-paragraph-line-height)] text-[var(--color-text)]">
        {content ? <DocsInlineContent content={content} /> : text}
      </blockquote>
      {attribution ? (
        <figcaption className="mt-2.5 text-[length:calc(var(--docs-font-size)*0.88)] leading-[1.6] text-[var(--color-text-soft)]">
          {attribution}
        </figcaption>
      ) : null}
    </figure>
  );
}
