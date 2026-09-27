import type { Roadmap, RoadmapProject } from '@incept/roadmap/domain';

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
    const atlasBoard = projectRoadmaps.find((roadmap) => roadmap.key.includes('atlas'));
    if (atlasBoard) return { project, roadmap: atlasBoard };
  }

  const roadmapBoard = projectRoadmaps.find((roadmap) => !roadmap.key.includes('atlas')) ?? projectRoadmaps[0];
  return { project, roadmap: roadmapBoard };
}
