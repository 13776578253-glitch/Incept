import { notFound } from 'next/navigation';
import { DocsArticleFeature } from '@/features/docs';
import {
  docsLegacyReferenceSlug,
  getDocsArticlePageBySlug,
} from '@/lib/mock/pages/docs/article/docs-article-pages.mock';

export default function DocsReferencePage() {
  const page = getDocsArticlePageBySlug(docsLegacyReferenceSlug);

  if (!page) {
    notFound();
  }

  return <DocsArticleFeature page={page} />;
}
