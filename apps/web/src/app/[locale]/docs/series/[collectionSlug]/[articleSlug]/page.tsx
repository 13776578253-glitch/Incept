import { notFound } from 'next/navigation';
import { DocsArticleFeature } from '@/features/docs';
import { getDocsCollectionArticlePage } from '@/server/docs/loaders';
import type { AppLocale } from '@/i18n/config/locales';

// 获取系列文章页面 
export default async function DocsCollectionArticlePage({
  params,
}: {
  params: Promise<{
    locale: AppLocale;
    collectionSlug: string;
    articleSlug: string;
  }>;
}) {
  const { locale, collectionSlug, articleSlug } = await params;
  const page = await getDocsCollectionArticlePage({
    locale,
    collectionSlug,
    articleSlug,
    viewerRole: 'guest',
  });

  if (!page) {
    notFound();
  }

  return <DocsArticleFeature page={page} />;
}
