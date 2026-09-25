import type { DocsCalloutBlockModel } from '@/features/docs/block-system';

// 提示块组件，根据不同的提示类型（如提示、警告等）和变体（如默认、柔和等）渲染不同样式的提示信息，增强文档内容的表达力和可读性
export function DocsCalloutBlock({
  tone,
  title,
  text,
  variant = 'default',
}: DocsCalloutBlockModel) {
  const toneClassName =
    tone === 'tip'
      ? variant === 'context'
        ? 'border-[color:var(--callout-context-border)] bg-[color:var(--callout-context-bg)]'
        : 'border-[color:var(--callout-tip-border)] bg-[color:var(--callout-tip-bg)]'
      : tone === 'attention'
        ? 'border-[color:var(--callout-attention-border)] bg-[color:var(--callout-attention-bg)]'
        : tone === 'warning'
          ? 'border-[color:var(--callout-warning-border)] bg-[color:var(--callout-warning-bg)]'
          : tone === 'meta'
            ? 'border-[color:var(--callout-meta-border)] bg-[color:var(--callout-meta-bg)]'
            : 'border-[var(--color-border)] bg-[color:var(--callout-default-bg)]';
  const variantClassName =
    variant === 'soft' || variant === 'context'
      ? 'rounded-[14px] px-4 py-3'
      : 'rounded-[16px] px-5 py-4';

  return (
    <div className={`border ${variantClassName} ${toneClassName}`}>
      <h4 className="text-[0.94rem] font-semibold text-[var(--color-text)]">
        {title}
      </h4>
      <p className="mt-2 text-[0.95rem] leading-7 text-[var(--color-text-muted)]">
        {text}
      </p>
    </div>
  );
}
