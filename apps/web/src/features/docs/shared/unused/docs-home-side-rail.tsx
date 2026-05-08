'use client';

import { DocsArticleRightRail } from '@/features/docs/shared/components/docs-article-right-rail';
import type { DocsHomeGroupModel } from '@/features/docs/shared/types';

type DocsHomeSideRailProps = {
  groups: DocsHomeGroupModel[];
  label: string;
};

export function DocsHomeSideRail({
  groups,
  label,
}: DocsHomeSideRailProps) {
  const items = groups.map((group) => ({
    id: `docs-home-group-${group.id}`,
    label: group.label,
  }));

  return <DocsArticleRightRail items={items} label={label} />;
}
