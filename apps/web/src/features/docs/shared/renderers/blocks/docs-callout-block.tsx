import { AlertCircle, AlertTriangle, Bookmark, Info, Lightbulb } from 'lucide-react';
import type { DocsCalloutBlockModel } from '@/features/docs/block-system';

function resolveCalloutTone(tone: DocsCalloutBlockModel['tone'], variant: NonNullable<DocsCalloutBlockModel['variant']>) {
  if (tone === 'tip') {
    if (variant === 'context') {
      return { accentVar: 'var(--callout-context-accent)', Icon: Info };
    }
    return { accentVar: 'var(--callout-tip-accent)', Icon: Lightbulb };
  }
  if (tone === 'attention') {
    return { accentVar: 'var(--callout-attention-accent)', Icon: AlertCircle };
  }
  if (tone === 'warning') {
    return { accentVar: 'var(--callout-warning-accent)', Icon: AlertTriangle };
  }
  if (tone === 'meta') {
    return { accentVar: 'var(--callout-meta-accent)', Icon: Bookmark };
  }
  return { accentVar: 'var(--callout-default-accent)', Icon: Info };
}

// 提示块组件，统一采用极简中性微底 + 左侧低饱和语义细条 + 微型图标，克制融入各主题纸面
export function DocsCalloutBlock({
  tone,
  title,
  text,
  variant = 'default',
}: DocsCalloutBlockModel) {
  const { accentVar, Icon } = resolveCalloutTone(tone, variant);
  const isCompact = variant === 'soft' || variant === 'context';
  const paddingClassName = isCompact ? 'py-3 pl-4 pr-4' : 'py-3.5 pl-4.5 pr-5';
  const backgroundStyle =
    tone === 'note'
      ? 'var(--color-surface)'
      : `color-mix(in oklab, ${accentVar} 4.5%, var(--color-surface))`;

  return (
    <div
      className={`relative overflow-hidden rounded-[10px] border border-[var(--color-border-subtle)] ${paddingClassName}`}
      style={{ background: backgroundStyle }}
    >
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-0 top-0 w-[2.5px]"
        style={{ backgroundColor: accentVar }}
      />
      <div className="flex items-center gap-2">
        <Icon
          aria-hidden="true"
          className="size-3.5 shrink-0"
          style={{ color: accentVar }}
          strokeWidth={1.75}
        />
        <h4 className="text-[length:calc(var(--docs-font-size)*0.93)] font-semibold leading-[1.4] text-[var(--color-text)]">
          {title}
        </h4>
      </div>
      <p className="mt-1.5 text-[length:calc(var(--docs-font-size)*0.93)] leading-[var(--docs-paragraph-line-height)] text-[var(--color-text-muted)]">
        {text}
      </p>
    </div>
  );
}
