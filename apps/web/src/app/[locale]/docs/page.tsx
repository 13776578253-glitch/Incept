import { SimpleShell } from '@/components/layouts/containers/simple-shell';
import { DocsHomeFeature } from '@/features/docs';
import type { AppLocale } from '@/i18n/config/locales';
import { getDocsHomePage } from '@/server/docs/loaders';

// 文档主页，展示文档的入口和导航结构
export default async function DocsPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  // 获取主页数据，使用 guest 角色查看公开文档
  const page = await getDocsHomePage({
    locale, 
    viewerRole: 'guest',
  });

  return (
    <SimpleShell>
      <DocsHomeFeature page={page} />
    </SimpleShell>
  );
}
