import { notFound } from 'next/navigation';
import type { AppLocale } from '@/i18n/config/locales';
import { ImportPreviewFeature } from '@/features/docs';
import { getDocsImportPreview } from '@/server/docs/import-preview';

// 预览导入草稿的页面组件，展示草稿的元信息、验证结果和文章内容预览
export default async function DocsImportPreviewPage({
  params,
}: {
  params: Promise<{
    locale: AppLocale;
    draftId: string;
  }>;
}) {
  const { locale, draftId } = await params;
  const preview = await getDocsImportPreview(draftId);

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
