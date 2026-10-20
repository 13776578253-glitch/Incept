import { TokenDashboardPage } from '@incept/dashboard/next';

import { WorkspaceShell } from '@/components/layouts/containers/workspace-shell';
import { getCurrentViewer } from '@/server/auth';
import { trustedDashboardEnabled } from '@incept/dashboard/adapters';
import { syncExecutor } from '@/server/sync/next';

export default async function DashboardPage() {
  if (trustedDashboardEnabled()) syncExecutor();
  const viewer = await getCurrentViewer();
  return (
    <WorkspaceShell>
      <TokenDashboardPage canImport={viewer.role === 'owner'} canViewDetails={viewer.role === 'owner' || viewer.role === 'pro'} />
    </WorkspaceShell>
  );
}
