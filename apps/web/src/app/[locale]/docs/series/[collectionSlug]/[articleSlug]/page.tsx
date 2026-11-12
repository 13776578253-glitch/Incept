import { notFound } from 'next/navigation';
import { DocsArticleFeature } from '@/features/docs';
import { getDocsCollectionArticlePage } from '@/server/docs/loaders';
import type { AppLocale } from '@/i18n/config/locales';
import { getCurrentViewer } from '@/server/auth';
import { toDocsViewerAccessRole } from '@/server/docs/viewer';

// 获取系列文章页面 
export default async function DocsCollectionArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{
    locale: AppLocale;
    collectionSlug: string;
    articleSlug: string;
  }>;
  searchParams?: Promise<{ imported?: string }>;
}) {
  const { locale, collectionSlug, articleSlug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const viewer = await getCurrentViewer();
  const page = await getDocsCollectionArticlePage({
    locale,
    collectionSlug,
    articleSlug,
    viewerRole: toDocsViewerAccessRole(viewer),
  });

  if (!page) {
    notFound();
  }

  return (
    <DocsArticleFeature
      page={page}
      showImportSuccessToast={resolvedSearchParams?.imported === '1'}
      backToListHref={`/${locale}/docs`}
    />
  );
}
