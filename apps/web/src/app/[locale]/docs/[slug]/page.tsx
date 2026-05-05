import { notFound } from 'next/navigation';
import { DocsArticleFeature } from '@/features/docs';
import { getDocsArticlePageBySlug } from '@/lib/mock/pages/docs/article/docs-article-pages.mock';

export default async function DocsArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = getDocsArticlePageBySlug(slug);

  if (!page) {
    notFound();
  }

  return <DocsArticleFeature page={page} />;
}
