import type { DocsEquationBlockModel } from '@/features/docs/block-system';
import { DocsMath } from '../docs-math';

export function DocsEquationBlock({
  id,
  tex,
  number,
  locale,
}: DocsEquationBlockModel & { locale: 'zh' | 'en' }) {
  return (
    <figure id={id} className="w-full min-w-0 scroll-mt-28 py-3 text-[var(--color-text)]">
      <div className="overflow-x-auto py-1.5 text-center [&_.katex-display]:my-0 [&_.katex-display>.katex]:w-max [&_.katex-display>.katex]:min-w-full">
        <DocsMath tex={tex} displayMode />
      </div>
      {number && (
        <figcaption className="mt-1 text-right text-xs tabular-nums text-[var(--color-text-muted)]">
          <span className="sr-only">{locale === 'zh' ? '编号公式 ' : 'Equation '}</span>
          {number}
        </figcaption>
      )}
    </figure>
  );
}
