import { NavigationSkeleton } from '@/components/layouts/navigation-skeleton';
import { WorkspaceShell } from '@/components/layouts/containers/workspace-shell';

export default function LoadingRoadmap() {
  return (
    <WorkspaceShell>
      <NavigationSkeleton variant="workspace" />
    </WorkspaceShell>
  );
}
