import { SettingsShell } from '@/components/layouts/containers/settings-shell';
import {
  SettingsPageContent,
  SettingsPageSidebar,
} from '@/features/settings';
import { getCurrentViewer } from '@/server/auth';
import { readMusicAdminData } from '@/server/music/music-admin';

export default async function SettingsPage() {
  const viewer = await getCurrentViewer();
  // 曲目与曲库管理只对 owner 渲染；数据在服务端从数据库读，客户端组件只负责渲染与提交
  const musicAdminData = viewer.role === 'owner' ? await readMusicAdminData() : null;

  return (
    <SettingsShell sidebar={<SettingsPageSidebar />}>
      <SettingsPageContent viewerRole={viewer.role} musicAdminData={musicAdminData} />
    </SettingsShell>
  );
}
