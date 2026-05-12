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
      ? 'border-[rgba(34,120,87,0.16)] bg-[rgba(34,120,87,0.05)]'
      : tone === 'warning'
        ? 'border-[rgba(164,96,32,0.18)] bg-[rgba(164,96,32,0.06)]'
        : 'border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-nav-item-active)_45%,transparent)]';
  const variantClassName =
    variant === 'soft' ? 'rounded-[14px] px-4 py-3' : 'rounded-[16px] px-5 py-4';

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
