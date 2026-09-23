import { SettingsShell } from '@/components/layouts/containers/settings-shell';
import {
  SettingsPageContent,
  SettingsPageSidebar,
} from '@/features/settings';
import { loadSettingsSectionContributionData } from '@/mount/registry';
import { settingsSectionServerLoaders } from '@/mount/server';
import { getCurrentViewer } from '@/server/auth';
import { readMusicAdminData } from '@/server/music/music-admin';

export default async function SettingsPage() {
  const viewer = await getCurrentViewer();
  // 曲目与曲库管理只对 owner 渲染；数据在服务端从数据库读，客户端组件只负责渲染与提交
  const musicAdminData = viewer.role === 'owner' ? await readMusicAdminData() : null;
  // 注册表贡献分区的 server loader 数据流：owner 门控在收集器内执行
  const settingsContributionData = await loadSettingsSectionContributionData(
    settingsSectionServerLoaders,
    viewer.role === 'owner',
  );

  return (
    <SettingsShell sidebar={<SettingsPageSidebar />}>
      <SettingsPageContent
        viewerRole={viewer.role}
        musicAdminData={musicAdminData}
        settingsContributionData={settingsContributionData}
      />
    </SettingsShell>
  );
}
