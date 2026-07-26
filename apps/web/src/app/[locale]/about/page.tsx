import { AboutFeature } from '@/features/about';
import type { AppLocale } from '@/i18n/config/locales';
import { requireOwner } from '@/server/auth';
import { getUnlistedDocsArticlePage } from '@/server/docs/loaders';
import { toDocsViewerAccessRole } from '@/server/docs/viewer';

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const viewer = await requireOwner();
  const page = await getUnlistedDocsArticlePage({
    locale,
    documentKey: 'about',
    viewerRole: toDocsViewerAccessRole(viewer),
  });

  return <AboutFeature sections={page?.sections ?? []} activityHref={`/${locale}/about/activity`} />;
}
