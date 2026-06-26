import { DocsLibraryFeature } from '@/features/docs';
import { getDocsLibraryPage } from '@/server/docs/loaders';
import type { AppLocale } from '@/i18n/config/locales';

export default async function StudioDocsLibraryPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const page = await getDocsLibraryPage({ locale });

  return <DocsLibraryFeature page={page} />;
}
