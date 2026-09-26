import { SettingsShell } from '@/components/layouts/containers/settings-shell';
import {
  SettingsPageContent,
  SettingsPageSidebar,
} from '@/features/settings';
import { loadSettingsSectionContributionData } from '@/mount/registry';
import { settingsSectionServerLoaders } from '@/mount/server';
import { getCurrentViewer } from '@/server/auth';
import { loadRoadmapAdminProjects } from '@/server/roadmap/assembly';

export default async function SettingsPage() {
  const viewer = await getCurrentViewer();
  // 曲目与曲库管理只对 owner 渲染
  // history: 原直接数据流已迁入 settingsSectionServerLoaders 的 music 注册条目
  // 注册表贡献分区的 server loader 数据流：owner 门控在收集器内执行
  const settingsContributionData = await loadSettingsSectionContributionData(
    settingsSectionServerLoaders,
    viewer.role === 'owner',
  );
  const projects = viewer.role === 'owner' ? await loadRoadmapAdminProjects() : [];

  return (
    <SettingsShell sidebar={<SettingsPageSidebar viewerRole={viewer.role} />}>
      <SettingsPageContent
        viewerRole={viewer.role}
        settingsContributionData={settingsContributionData}
        projects={projects}
      />
    </SettingsShell>
  );
}
