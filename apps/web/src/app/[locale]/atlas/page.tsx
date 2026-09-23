import { WorkspaceShell } from '@/components/layouts/containers/workspace-shell';
import { AtlasIndexFeature } from '@/features/atlas';

// 图谱总览：列出本栏目下的全部图谱
export default function AtlasPage() {
  return (
    <WorkspaceShell>
      <AtlasIndexFeature />
    </WorkspaceShell>
  );
}
