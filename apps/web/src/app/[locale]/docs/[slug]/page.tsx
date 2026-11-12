import { notFound } from 'next/navigation';
import { DocsArticleFeature } from '@/features/docs';
import { getDocsArticlePage } from '@/server/docs/loaders';
import type { AppLocale } from '@/i18n/config/locales';
import { getCurrentViewer } from '@/server/auth';
import { toDocsViewerAccessRole } from '@/server/docs/viewer';

// 获取单篇文章页面
export default async function DocsArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale; slug: string }>;
  searchParams?: Promise<{ imported?: string }>;
}) {
  const { locale, slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const viewer = await getCurrentViewer();
  const page = await getDocsArticlePage({
    locale,
    slug,
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
