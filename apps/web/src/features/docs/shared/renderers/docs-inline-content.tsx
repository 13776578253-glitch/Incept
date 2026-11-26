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
        className="underline decoration-[color:color-mix(in_oklab,var(--color-accent)_40%,var(--color-border-strong))] underline-offset-[0.2em] transition-colors hover:text-[var(--color-text)] hover:decoration-[var(--color-accent)]"
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
        className="rounded-[0.26rem] bg-[var(--docs-mark-bg)] px-[0.28rem] py-[0.06rem] text-[var(--docs-mark-text)]"
      >
        {item.text}
      </mark>
    );
  }

  if (item.type === 'inlineCode') {
    return (
      <code
        key={`${item.code}-${index}`}
        className="rounded-[0.32rem] border border-[var(--docs-inline-code-border)] bg-[var(--docs-inline-code-bg)] px-[0.34rem] py-[0.08rem] font-mono text-[0.88em] text-[var(--docs-inline-code-text)]"
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
