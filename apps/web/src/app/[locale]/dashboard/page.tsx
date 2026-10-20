import { TokenDashboardPage } from '@incept/dashboard/next';

import { WorkspaceShell } from '@/components/layouts/containers/workspace-shell';
import { getCurrentViewer } from '@/server/auth';

export default async function DashboardPage() {
  const viewer = await getCurrentViewer();
  return (
    <WorkspaceShell>
      <TokenDashboardPage canImport={viewer.role === 'owner'} canViewDetails={viewer.role === 'owner' || viewer.role === 'pro'} />
    </WorkspaceShell>
  );
}
