import { WorkspaceShell } from '@/components/layouts/containers/workspace-shell';
import { DocsHomeFeature } from '@/features/docs';
import type { AppLocale } from '@/i18n/config/locales';
import { getCurrentViewer } from '@/server/auth';
import { getDocsHomePage } from '@/server/docs/loaders';
import { toDocsViewerAccessRole } from '@/server/docs/viewer';

// 文档主页，展示文档的入口和导航结构
export default async function DocsPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const viewer = await getCurrentViewer();
  const page = await getDocsHomePage({
    locale,
    viewerRole: toDocsViewerAccessRole(viewer),
  });

  return (
    <WorkspaceShell>
      <DocsHomeFeature page={page} />
    </WorkspaceShell>
  );
}
