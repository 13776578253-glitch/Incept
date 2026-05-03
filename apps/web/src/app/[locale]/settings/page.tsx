import { SettingsShell } from '@/components/layouts/containers/settings-shell';
import {
  SettingsPageContent,
  SettingsPageSidebar,
} from '@/features/settings';

export default function SettingsPage() {
  return (
    <SettingsShell sidebar={<SettingsPageSidebar />}>
      <SettingsPageContent />
    </SettingsShell>
  );
}
