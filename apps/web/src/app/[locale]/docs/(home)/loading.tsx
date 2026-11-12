import { NavigationSkeleton } from '@/components/layouts/navigation-skeleton';
import { WorkspaceShell } from '@/components/layouts/containers/workspace-shell';

export default function LoadingDocsHome() {
  return (
    <WorkspaceShell>
      <NavigationSkeleton variant="docs-home" />
    </WorkspaceShell>
  );
}
