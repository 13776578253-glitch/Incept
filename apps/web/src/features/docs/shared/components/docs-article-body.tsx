import type {
  DocsArticlePageModel,
  DocsContentBlockModel,
} from '@/features/docs/shared/types';

function DocsParagraphBlock({ text }: Extract<DocsContentBlockModel, { type: 'paragraph' }>) {
  return (
    <p className="text-[1rem] leading-8 text-[var(--color-text-muted)]">
      {text}
    </p>
  );
}

function DocsListBlock({ items }: Extract<DocsContentBlockModel, { type: 'list' }>) {
  return (
    <ul className="space-y-3 pl-5 text-[1rem] leading-8 text-[var(--color-text-muted)]">
      {items.map((item) => (
        <li key={item} className="list-disc">
          {item}
        </li>
      ))}
    </ul>
  );
}

function DocsCalloutBlock({
  tone,
  title,
  text,
}: Extract<DocsContentBlockModel, { type: 'callout' }>) {
  const toneClassName =
    tone === 'tip'
      ? 'border-[rgba(34,120,87,0.16)] bg-[rgba(34,120,87,0.05)]'
      : tone === 'warning'
        ? 'border-[rgba(164,96,32,0.18)] bg-[rgba(164,96,32,0.06)]'
        : 'border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-nav-item-active)_45%,transparent)]';

  return (
    <div className={`rounded-[16px] border px-5 py-4 ${toneClassName}`}>
      <h4 className="text-[0.94rem] font-semibold text-[var(--color-text)]">
        {title}
      </h4>
      <p className="mt-2 text-[0.95rem] leading-7 text-[var(--color-text-muted)]">
        {text}
      </p>
    </div>
  );
}

function DocsContentBlockRenderer({ block }: { block: DocsContentBlockModel }) {
  switch (block.type) {
    case 'paragraph':
      return <DocsParagraphBlock {...block} />;
    case 'list':
      return <DocsListBlock {...block} />;
    case 'callout':
      return <DocsCalloutBlock {...block} />;
    default:
      return null;
  }
}

type DocsArticleBodyProps = {
  page: DocsArticlePageModel;
};

export function DocsArticleBody({ page }: DocsArticleBodyProps) {
  return (
    <article className="mx-auto w-full max-w-[760px] min-w-0">
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
          <p className="mt-4 max-w-[60ch] text-[1.08rem] leading-8 text-[var(--color-text-muted)]">
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
                  <p className="max-w-[58ch] text-[0.98rem] leading-7 text-[var(--color-text-soft)]">
                    {section.description}
                  </p>
                ) : null}
              </div>

              <div className="space-y-5">
                {section.blocks.map((block) => (
                  <DocsContentBlockRenderer key={block.id} block={block} />
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
