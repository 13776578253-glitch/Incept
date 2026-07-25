import Link from 'next/link';
import type { DocsArticlePageModel } from '@/features/docs/shared/types';
import { DocsBlockRenderer } from '@/features/docs/shared/renderers';

type DocsArticleBodyProps = {
  page: DocsArticlePageModel;
  backToListHref?: string;
  backToListLabel?: string;
};

// 文档文章内容组件，负责渲染文章的主体内容
export function DocsArticleBody({
  page,
  backToListHref,
  backToListLabel,
}: DocsArticleBodyProps) {
  return (
    <article className="mx-auto w-full max-w-[var(--docs-prose-max-width)] min-w-0">
      <header className="pb-12 pt-2">
        {backToListHref && backToListLabel ? (
          <Link
            href={backToListHref}
            className="mb-5 inline-flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-[0.8125rem] font-medium text-[var(--color-nav-dropdown-description)] transition-colors hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-text-soft)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
          >
            <span aria-hidden="true" className="text-[1.125rem] leading-none">
              &larr;
            </span>
            {backToListLabel}
          </Link>
        ) : null}
        {page.eyebrow ? (
          <p className="text-[0.74rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
            {page.eyebrow}
          </p>
        ) : null}
        <h1 className="mt-4 text-[2.35rem] font-semibold tracking-[-0.05em] text-[var(--color-text)] md:text-[3rem]">
          {page.title}
        </h1>
        {page.description ? (
          <p className="mt-4 w-full max-w-[var(--docs-prose-description-max-width)] text-[1.08rem] leading-8 text-[var(--color-text-muted)]">
            {page.description}
          </p>
        ) : null}
      </header>

      <div className="space-y-16">
        {page.sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-28">
            <div className="space-y-6">
              <div className="space-y-3">
                <h2 className="text-[1.6rem] font-semibold tracking-[-0.04em] text-[var(--color-text)] md:text-[1.85rem]">
                  {section.title}
                </h2>
                {section.description ? (
                  <p className="w-full max-w-[var(--docs-prose-description-max-width)] text-[0.98rem] leading-7 text-[var(--color-text-soft)]">
                    {section.description}
                  </p>
                ) : null}
              </div>

              <div className="space-y-5">
                {section.blocks.map((block) => (
                  <DocsBlockRenderer key={block.id} block={block} />
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
