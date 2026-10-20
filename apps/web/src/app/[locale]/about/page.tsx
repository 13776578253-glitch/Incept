import { AboutFeature } from '@/features/about';
import type { AppLocale } from '@/i18n/config/locales';
import { getUnlistedDocsArticlePage } from '@/server/docs/loaders';

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const page = await getUnlistedDocsArticlePage({
    locale,
    documentKey: 'about',
    viewerRole: 'guest',
  });

  return <AboutFeature sections={page?.sections ?? []} activityHref={`/${locale}/about/activity`} />;
}
