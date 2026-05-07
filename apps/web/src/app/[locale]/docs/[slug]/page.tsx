import { notFound } from 'next/navigation';
import { DocsArticleFeature } from '@/features/docs';
import { getDocsArticlePage } from '@/server/docs/loaders';
import type { AppLocale } from '@/i18n/config/locales';

export default async function DocsArticlePage({
  params,
}: {
  params: Promise<{ locale: AppLocale; slug: string }>;
}) {
  const { locale, slug } = await params;
  const page = await getDocsArticlePage({
    locale,
    slug,
    viewerRole: 'guest',
  });

  if (!page) {
    notFound();
  }

  return <DocsArticleFeature page={page} />;
}
