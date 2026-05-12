import { DocsArticleFeature } from '@/features/docs';
import { getDocsBlockStyleLabPage } from '@/features/docs/block-system';
import type { AppLocale } from '@/i18n/config/locales';

// 测试界面 / 样式实验室，展示各种文档内容块的样式和功能
// 半保留 / 未暴露
export default async function DocsStyleLabPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;

  return <DocsArticleFeature page={getDocsBlockStyleLabPage(locale)} />;
}
