import { SettingsShell } from '@/components/layouts/containers/settings-shell';
import {
  SettingsPageContent,
  SettingsPageSidebar,
} from '@/features/settings';
import { loadSettingsSectionContributionData } from '@/mount/registry';
import { settingsSectionServerLoaders } from '@/mount/server';
import { getCurrentViewer } from '@/server/auth';

export default async function SettingsPage() {
  const viewer = await getCurrentViewer();
  // 曲目与曲库管理只对 owner 渲染；数据在服务端从数据库读，客户端组件只负责渲染与提交
  // 2026-09-23（Phase 7）：上述数据流已迁往 settingsSectionServerLoaders 的 music 条目
  // 注册表贡献分区的 server loader 数据流：owner 门控在收集器内执行
  const settingsContributionData = await loadSettingsSectionContributionData(
    settingsSectionServerLoaders,
    viewer.role === 'owner',
  );

  return (
    <SettingsShell sidebar={<SettingsPageSidebar />}>
      <SettingsPageContent
        viewerRole={viewer.role}
        settingsContributionData={settingsContributionData}
      />
    </SettingsShell>
  );
}
