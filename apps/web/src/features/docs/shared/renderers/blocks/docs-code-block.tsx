import type { DocsCodeBlockModel } from '@/features/docs/block-system';

// 代码块组件，根据提供的代码内容、编程语言、可选的标题和变体（如紧凑或块状）渲染格式化的代码展示，适用于文档中的代码示例和技术说明
export function DocsCodeBlock({
  code,
  language,
  caption,
  variant = 'block',
}: DocsCodeBlockModel) {
  const frameClassName =
    variant === 'compact'
      ? 'overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-nav-item-active)_24%,transparent)]'
      : 'overflow-hidden rounded-[16px] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-nav-item-active)_30%,transparent)]';
  const contentClassName =
    variant === 'compact'
      ? 'overflow-x-auto px-4 py-3 text-[0.88rem] leading-6 text-[var(--color-text)]'
      : 'overflow-x-auto px-4 py-4 text-[0.92rem] leading-7 text-[var(--color-text)]';

  return (
    <figure className={frameClassName}>
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <span className="text-[0.76rem] font-medium uppercase tracking-[0.12em] text-[var(--color-nav-muted)]">
          {language}
        </span>
        {caption ? (
          <span className="text-[0.82rem] text-[var(--color-text-soft)]">
            {caption}
          </span>
        ) : null}
      </div>
      <pre className={contentClassName}>
        <code>{code}</code>
      </pre>
    </figure>
  );
}
