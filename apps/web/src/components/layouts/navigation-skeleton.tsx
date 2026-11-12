import { useTranslations } from 'next-intl';

type NavigationSkeletonProps = {
  variant: 'docs-home' | 'article' | 'workspace' | 'about';
};

export function NavigationSkeleton({ variant }: NavigationSkeletonProps) {
  const t = useTranslations('navigation');
  const bar = 'rounded-md bg-[var(--color-nav-item-hover)]';

  return (
    <div role="status" aria-live="polite" aria-busy="true" data-navigation-loading={variant}>
      <span className="sr-only">{t('loading')}</span>
      {variant === 'docs-home' ? (
        <div aria-hidden="true" className="mx-auto w-full max-w-[780px] px-4 pb-20 pt-6 motion-safe:animate-pulse sm:px-6 md:pt-8 lg:pt-9">
          <div className={`${bar} mb-10 h-11 w-full`} />
          <div className={`${bar} mb-4 h-5 w-28`} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className={`${bar} h-[116px] rounded-[14px]`} />
            ))}
          </div>
        </div>
      ) : variant === 'about' ? (
        <div aria-hidden="true" className="mx-auto flex min-h-[27rem] max-w-[var(--docs-content-width)] flex-col items-center justify-center gap-7 px-5 motion-safe:animate-pulse md:min-h-[34rem]">
          <div className={`${bar} size-32 rounded-full md:size-36`} />
          <div className={`${bar} h-8 w-48`} />
          <div className={`${bar} h-5 w-64 max-w-full`} />
        </div>
      ) : variant === 'article' ? (
        <div aria-hidden="true" className="mx-auto w-full max-w-[var(--docs-prose-max-width)] px-5 pb-20 pt-10 motion-safe:animate-pulse md:px-8">
          <div className={`${bar} mb-8 h-4 w-28`} />
          <div className={`${bar} mb-5 h-10 w-4/5`} />
          <div className={`${bar} mb-16 h-5 w-3/5`} />
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="mb-12 space-y-4">
              <div className={`${bar} h-7 w-2/5`} />
              <div className={`${bar} h-4 w-full`} />
              <div className={`${bar} h-4 w-11/12`} />
              <div className={`${bar} h-4 w-4/5`} />
            </div>
          ))}
        </div>
      ) : (
        <div aria-hidden="true" className="mx-auto w-full max-w-[1480px] px-6 pb-20 pt-8 motion-safe:animate-pulse lg:px-10">
          <div className={`${bar} mb-5 h-9 w-56`} />
          <div className={`${bar} mb-8 h-5 w-80 max-w-full`} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className={`${bar} h-28 rounded-xl`} />
            ))}
          </div>
          <div className={`${bar} mt-6 h-80 rounded-xl`} />
        </div>
      )}
    </div>
  );
}
