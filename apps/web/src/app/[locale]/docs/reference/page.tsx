import { notFound } from 'next/navigation';
import { DocsArticleFeature } from '@/features/docs';
import type { AppLocale } from '@/i18n/config/locales';
import { getDocsArticlePage } from '@/server/docs/loaders';

const CANONICAL_DOCS_REFERENCE_SLUG = 'document-shells';

export default async function DocsReferencePage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const page = await getDocsArticlePage({
    locale,
    slug: CANONICAL_DOCS_REFERENCE_SLUG,
    viewerRole: 'guest',
  });

  if (!page) {
    notFound();
  }

  return <DocsArticleFeature page={page} />;
}
