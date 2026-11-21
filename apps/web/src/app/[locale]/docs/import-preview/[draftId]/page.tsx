import { notFound } from 'next/navigation';
import type { AppLocale } from '@/i18n/config/locales';
import { ImportPreviewFeature } from '@/features/docs';
import { requireOwner } from '@/server/auth';
import { getDocsImportPreview } from '@/server/docs/import-preview';

// 预览导入草稿的页面组件，展示草稿的元信息、验证结果和文章内容预览
export default async function DocsImportPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{
    locale: AppLocale;
    draftId: string;
  }>;
  searchParams: Promise<{ article?: string | string[] }>;
}) {
  await requireOwner();
  const { locale, draftId } = await params;
  const { article } = await searchParams;
  const preview = await getDocsImportPreview(draftId, typeof article === 'string' ? article : undefined);

  if (!preview) {
    notFound();
  }

  return (
    <ImportPreviewFeature
      locale={locale}
      draftId={draftId}
      preview={preview}
    />
  );
}
