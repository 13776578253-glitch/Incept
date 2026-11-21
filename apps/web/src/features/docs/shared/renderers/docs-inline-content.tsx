import type { DocsParagraphInlineModel } from '@/features/docs/block-system';
import { DocsMath } from './docs-math';

function renderInlineContentItem(item: DocsParagraphInlineModel, index: number) {
  if (item.type === 'link') {
    const isExternal = item.external ?? /^https?:\/\//.test(item.href);

    return (
      <a
        key={`${item.href}-${index}`}
        href={item.href}
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noreferrer' : undefined}
        className="underline decoration-[color:var(--color-link-decoration)] underline-offset-[0.18em] transition-colors hover:text-[var(--color-text)] hover:decoration-[var(--color-text-muted)]"
      >
        {item.label}
      </a>
    );
  }

  if (item.type === 'delete') {
    return (
      <span
        key={`${item.text}-${index}`}
        className="text-[color:var(--color-text-strikethrough)] line-through"
      >
        {item.text}
      </span>
    );
  }

  if (item.type === 'mark') {
    return (
      <mark
        key={`${item.text}-${index}`}
        className="rounded-[0.28rem] bg-[#f3e8a8] px-[0.28rem] py-[0.08rem] text-[var(--color-text)] dark:bg-[#5d5223] dark:text-[#f5efcf]"
      >
        {item.text}
      </mark>
    );
  }

  if (item.type === 'inlineCode') {
    return (
      <code
        key={`${item.code}-${index}`}
        className="rounded-[0.34rem] border border-[#ece7df] bg-[#f7f4ef] px-[0.34rem] py-[0.1rem] font-mono text-[0.92em] text-[#5f4632] dark:border-white/10 dark:bg-[#23211d] dark:text-[#f1dfc8]"
      >
        {item.code}
      </code>
    );
  }

  if (item.type === 'inlineMath') {
    return <DocsMath key={index} tex={item.tex} />;
  }

  return <span key={`${item.text}-${index}`}>{item.text}</span>;
}

export function DocsInlineContent({ content }: { content: DocsParagraphInlineModel[] }) {
  return content.map(renderInlineContentItem);
}
