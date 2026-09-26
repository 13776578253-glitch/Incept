import type { Roadmap, RoadmapProject } from '@incept/roadmap/domain';

export function resolveRoadmapSelection(
  projects: readonly RoadmapProject[],
  roadmaps: readonly Roadmap[],
  projectKey?: string,
  roadmapKey?: string,
): { project: RoadmapProject; roadmap: Roadmap } | null {
  const selectedRoadmap = roadmapKey ? roadmaps.find((roadmap) => roadmap.key === roadmapKey) : undefined;
  if (selectedRoadmap) return { project: selectedRoadmap.project, roadmap: selectedRoadmap };

  const selectedProject = projectKey ? projects.find((project) => project.key === projectKey) : undefined;
  const projectRoadmap = selectedProject
    ? roadmaps.find((roadmap) => roadmap.project.key === selectedProject.key)
    : undefined;
  if (selectedProject) {
    return projectRoadmap ? { project: selectedProject, roadmap: projectRoadmap } : null;
  }

  for (const project of projects) {
    const roadmap = roadmaps.find((candidate) => candidate.project.key === project.key);
    if (roadmap) return { project, roadmap };
  }

  return null;
}
