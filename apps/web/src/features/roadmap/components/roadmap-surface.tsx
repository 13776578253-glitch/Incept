'use client';

import { useState } from 'react';

import type { RoadmapProject } from '@incept/roadmap/domain';
import type { RoadmapBoard as RoadmapBoardData } from '@incept/roadmap/ports';
import { RoadmapBoard, RoadmapToolbar } from '@incept/roadmap/react';
import type { RoadmapChrome } from '@incept/roadmap/react';

import type { AppLocale } from '@/i18n/config/locales';
import { SurfaceNavigation } from './surface-navigation';

type RoadmapSurfaceProps = {
  projects: readonly RoadmapProject[];
  currentProject: RoadmapProject;
  locale: AppLocale;
  chrome: RoadmapChrome;
  canEdit: boolean;
  board: RoadmapBoardData;
  hrefs: Record<string, string>;
  activeSurface: 'roadmap' | 'atlas';
  currentRoadmapKey: string;
  roadmapHref: string;
  atlasHref: string;
  // 首个阶段列为空时才给工具栏「+」，其余时候创建入口仍在条目弹窗里。
  canCreate: boolean;
};

// 表面组合：把工具条的「+」和看板的草稿弹窗连起来。
// 工具条与看板是同级组件，创建信号只能由共同父级持有，所以这里提升成客户端组件。
export function RoadmapSurface({
  projects,
  currentProject,
  locale,
  chrome,
  canEdit,
  board,
  hrefs,
  activeSurface,
  currentRoadmapKey,
  roadmapHref,
  atlasHref,
  canCreate,
}: RoadmapSurfaceProps) {
  const [createRequest, setCreateRequest] = useState(0);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 shrink-0 md:mb-5">
        <SurfaceNavigation
          projects={projects}
          currentProject={currentProject}
          locale={locale}
          activeSurface={activeSurface}
          roadmapHref={roadmapHref}
          atlasHref={atlasHref}
          showProjectSelector={false}
        />
        <RoadmapToolbar
          projects={projects}
          currentProjectKey={currentProject.key}
          activeSurface={activeSurface}
          currentRoadmapKey={currentRoadmapKey}
          locale={locale}
          chrome={chrome}
          canEdit={canEdit}
          hrefs={hrefs}
          onCreateEntry={canEdit && canCreate ? () => setCreateRequest((current) => current + 1) : undefined}
          createEntryLabel={chrome.createEntryLabel}
        />
      </div>
      <RoadmapBoard
        key={currentRoadmapKey}
        board={board}
        locale={locale}
        chrome={chrome}
        canEdit={canEdit}
        createRequest={createRequest}
      />
    </>
  );
}
