import { SimpleShell } from '@/components/layouts/containers/simple-shell';
import { HomePageFeature } from '@/features/home';
import type { AppLocale } from '@/i18n/config/locales';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;

  return (
    <SimpleShell>
      <HomePageFeature locale={locale} />
    </SimpleShell>
  );
}
