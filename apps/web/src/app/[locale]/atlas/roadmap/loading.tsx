import { getTranslations } from 'next-intl/server';
import { RoadmapSkeleton } from '@incept/roadmap/react';

import { WorkspaceShell } from '@/components/layouts/containers/workspace-shell';

export default async function RoadmapMapLoading() {
  const t = await getTranslations('roadmap');

  return (
    <WorkspaceShell>
      <RoadmapSkeleton label={t('loading')} />
    </WorkspaceShell>
  );
}
