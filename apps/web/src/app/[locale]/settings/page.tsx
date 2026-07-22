import { SettingsShell } from '@/components/layouts/containers/settings-shell';
import {
  SettingsPageContent,
  SettingsPageSidebar,
} from '@/features/settings';
import { getCurrentViewer } from '@/server/auth';

export default async function SettingsPage() {
  const viewer = await getCurrentViewer();

  return (
    <SettingsShell sidebar={<SettingsPageSidebar />}>
      <SettingsPageContent viewerRole={viewer.role} />
    </SettingsShell>
  );
}
