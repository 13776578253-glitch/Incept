import type { Roadmap, RoadmapProject } from '@incept/roadmap/domain';

// 规划图看板标识判定：规划图看板 key 严格以 '-atlas' 结尾。
// history: 早期以 includes('atlas') 判断导致包含 atlas 字符串的项目 key 产生误判，修正为严格后缀匹配。
export function isAtlasBoardKey(key: string): boolean {
  return key.endsWith('-atlas');
}

export function resolveRoadmapSelection(
  projects: readonly RoadmapProject[],
  roadmaps: readonly Roadmap[],
  projectKey?: string,
  roadmapKey?: string,
  surface?: 'roadmap' | 'atlas',
): { project: RoadmapProject; roadmap: Roadmap } | null {
  const currentProject = projectKey ? projects.find((project) => project.key === projectKey) : undefined;
  const project = currentProject ?? (roadmapKey ? roadmaps.find((roadmap) => roadmap.key === roadmapKey)?.project : undefined) ?? projects[0];
  if (!project) return null;

  const projectRoadmaps = roadmaps.filter((roadmap) => roadmap.project.key === project.key);
  if (projectRoadmaps.length === 0) return null;

  if (roadmapKey) {
    const matched = projectRoadmaps.find((roadmap) => roadmap.key === roadmapKey);
    if (matched) return { project, roadmap: matched };
  }

  if (surface === 'atlas') {
    const atlasBoard = projectRoadmaps.find((roadmap) => isAtlasBoardKey(roadmap.key));
    if (atlasBoard) return { project, roadmap: atlasBoard };
  }

  const roadmapBoard = projectRoadmaps.find((roadmap) => !isAtlasBoardKey(roadmap.key)) ?? projectRoadmaps[0];
  return { project, roadmap: roadmapBoard };
}
