import type {
  DocsParagraphBlockModel,
  DocsParagraphInlineModel,
} from '@/features/docs/block-system';

function renderInlineContentItem(item: DocsParagraphInlineModel, index: number) {
  if (item.type === 'link') {
    const isExternal = item.external ?? /^https?:\/\//.test(item.href);

    return (
      <a
        key={`${item.href}-${index}`}
        href={item.href}
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noreferrer' : undefined}
        className="underline decoration-[color:color-mix(in_srgb,var(--color-text)_20%,transparent)] underline-offset-[0.18em] transition-colors hover:text-[var(--color-text)] hover:decoration-[var(--color-text-muted)]"
      >
        {item.label}
      </a>
    );
  }

  if (item.type === 'delete') {
    return (
      <span
        key={`${item.text}-${index}`}
        className="text-[color-mix(in_srgb,var(--color-text-soft)_72%,transparent)] line-through"
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

  return <span key={`${item.text}-${index}`}>{item.text}</span>;
}

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
        ? content.map((item, index) => renderInlineContentItem(item, index))
        : text}
    </p>
  );
}
