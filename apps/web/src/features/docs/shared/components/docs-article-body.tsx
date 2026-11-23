import { NavigationLink as Link } from '@/components/layouts/navigation-link';
import { useLocale, useTranslations } from 'next-intl';
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

  // 使用 next-intl 获取国际化翻译函数
  const t = useTranslations('docs');
  const interfaceLocale = useLocale();

  // 根据文档的 locale 和阅读统计信息，生成阅读元信息字符串
  const readingMeta = page.locale === 'zh'
    ? t('reference.readingMeta.zh', {
        characters: page.readingStats.chineseCharacterCount,
        minutes: page.readingStats.estimatedMinutes,
      })
    : t('reference.readingMeta.en', {
        words: page.readingStats.wordCount,
        minutes: page.readingStats.estimatedMinutes,
      });
  
  // 如有最后编辑时间，则格式化为本地化日期字符串
  const lastEditedDate = page.lastEditedAt
    ? new Intl.DateTimeFormat(interfaceLocale === 'zh' ? 'zh-CN' : 'en-US', {
        dateStyle: 'long',
        timeZone: 'Asia/Shanghai',
      }).format(new Date(page.lastEditedAt))
    : null;

  return (
    <article
      lang={page.locale}
      style={{ fontFamily: 'var(--docs-font-family)' }}
      className="mx-auto w-full max-w-[var(--docs-prose-max-width)] min-w-0 break-words"
    >
      <header className="pb-7 pt-1 md:pb-9 lg:pb-10 lg:pt-2">
        {backToListHref && backToListLabel ? (
          <div className="mb-4 flex items-center justify-between gap-4 md:mb-5">
            <Link
              href={backToListHref}
              className="inline-flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-[0.8125rem] font-medium text-[var(--color-nav-dropdown-description)] transition-colors hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-text-soft)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
            >
              <span aria-hidden="true" className="text-[1.125rem] leading-none">
                &larr;
              </span>
              {backToListLabel}
            </Link>
            <p className="text-right text-[0.75rem] tabular-nums text-[var(--color-nav-muted)]">
              {readingMeta}
            </p>
          </div>
        ) : null}
        {page.eyebrow ? (
          <p className="text-[0.74rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
            {page.eyebrow}
          </p>
        ) : null}
        <h1 className="mt-3 text-[length:clamp(1.5rem,calc(var(--docs-font-size)*1.65),1.75rem)] leading-[1.28] font-semibold tracking-[-0.025em] text-[var(--color-text)] [text-wrap:balance] md:mt-3.5 md:text-[length:clamp(1.85rem,calc(var(--docs-font-size)*2),2.05rem)] md:leading-[1.22] md:tracking-[-0.03em]">
          {page.title}
        </h1>
        {page.description ? (
          <p className="mt-3 w-full max-w-[var(--docs-prose-description-max-width)] text-[length:calc(var(--docs-font-size)*0.96)] leading-[var(--docs-line-height)] text-[var(--color-text-muted)] [text-wrap:pretty] md:mt-3.5 md:text-[length:calc(var(--docs-font-size)*1.02)]">
            {page.description}
          </p>
        ) : null}
      </header>

      <div className="space-y-9 md:space-y-11 lg:space-y-14">
        {page.sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <div className="space-y-4 md:space-y-5">
              <div className="space-y-2 md:space-y-2.5">
                <h2 className="text-[length:calc(var(--docs-font-size)*1.28)] leading-[1.35] font-semibold tracking-[-0.02em] text-[var(--color-text)] [text-wrap:balance] md:text-[length:calc(var(--docs-font-size)*1.4)] md:leading-[1.3] md:tracking-[-0.025em]">
                  {section.title}
                </h2>
                {section.description ? (
                  <p className="w-full max-w-[var(--docs-prose-description-max-width)] text-[length:calc(var(--docs-font-size)*0.94)] leading-[var(--docs-line-height)] text-[var(--color-text-soft)] [text-wrap:pretty]">
                    {section.description}
                  </p>
                ) : null}
              </div>

              <div className="space-y-3.5 md:space-y-4 lg:space-y-5">
                {section.blocks.map((block) => (
                  <DocsBlockRenderer key={block.id} block={block} locale={page.locale} />
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
      {lastEditedDate ? (
        <footer className="mt-10 border-t border-[var(--color-border)] pt-4 text-[0.75rem] text-[var(--color-nav-muted)] md:mt-12">
          {t('reference.lastEdited', { date: lastEditedDate })}
        </footer>
      ) : null}
    </article>
  );
}
