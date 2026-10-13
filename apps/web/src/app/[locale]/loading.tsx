import { getTranslations } from 'next-intl/server';

export default async function NavigationLoading() {
  const t = await getTranslations('navigation');
  return <div role="status" aria-busy="true" className="mx-auto w-full max-w-[1480px] space-y-6 px-6 py-9 lg:px-10">
    <span className="sr-only">{t('loading')}</span>
    <div aria-hidden="true" className="h-8 w-48 rounded-lg bg-[var(--color-row-bg)]" />
    <div aria-hidden="true" className="h-80 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-row-bg)]" />
  </div>;
}
