import type { AppLocale } from '@/i18n/config/locales';

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  await params;

  return (
    <main className="page-shell page-shell-workspace">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-6 py-16 lg:px-10">
        <p className="text-[0.76rem] uppercase tracking-[0.2em] text-[var(--color-text-soft)]">
          Workspace
        </p>
        <h1 className="max-w-[12ch] text-[clamp(2.4rem,5vw,4.6rem)] font-semibold leading-[0.95] tracking-[-0.04em] text-[var(--color-text)]">
          Workspace
        </h1>
        <p className="max-w-[640px] text-[1.02rem] leading-8 text-[var(--color-text-muted)]">
          This surface is reserved for the standalone workspace experience.
        </p>
      </div>
    </main>
  );
}
