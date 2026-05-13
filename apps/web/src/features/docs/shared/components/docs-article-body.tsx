import type { DocsArticlePageModel } from '@/features/docs/shared/types';
import { DocsBlockRenderer } from '@/features/docs/shared/renderers';

type DocsArticleBodyProps = {
  page: DocsArticlePageModel;
};

// 文档文章内容组件，负责渲染文章的主体内容
export function DocsArticleBody({ page }: DocsArticleBodyProps) {
  return (
    <article className="mx-auto w-full max-w-[var(--docs-prose-max-width)] min-w-0">
      <header className="pb-12 pt-2">
        {page.eyebrow ? (
          <p className="text-[0.74rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
            {page.eyebrow}
          </p>
        ) : null}
        <h1 className="mt-4 max-w-[16ch] text-[2.35rem] font-semibold tracking-[-0.05em] text-[var(--color-text)] md:text-[3rem]">
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
