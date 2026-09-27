import { describe, expect, it } from 'vitest';

import { createFixtureRoadmapRepository } from '@incept/roadmap/testing';

import { resolveRoadmapSelection } from './resolve-selection';

describe('resolveRoadmapSelection', () => {
  it('prefers a valid roadmap and uses its owning project', async () => {
    const repository = createFixtureRoadmapRepository();
    const projects = await repository.listProjects();
    const roadmaps = await repository.listRoadmaps();
    const selection = resolveRoadmapSelection(projects, roadmaps, 'project-one', 'sample-atlas');

    expect(selection?.roadmap.key).toBe('sample-atlas');
    expect(selection?.project.key).toBe('project-one');
  });

  it('uses the requested project first board, then falls back to first project with a board', async () => {
    const repository = createFixtureRoadmapRepository();
    const projects = await repository.listProjects();
    const roadmaps = await repository.listRoadmaps();

    expect(resolveRoadmapSelection(projects, roadmaps, 'project-two')?.roadmap.key).toBe('sample-two-roadmap');
    expect(resolveRoadmapSelection(projects, roadmaps, 'project-two', undefined, 'atlas')?.roadmap.key).toBe('sample-two-atlas');
    expect(resolveRoadmapSelection(projects, roadmaps, 'unknown')?.roadmap.key).toBe('sample-roadmap');
    expect(resolveRoadmapSelection([], [], 'unknown')).toBeNull();
  });

  it('keeps a valid but empty project empty', async () => {
    const repository = createFixtureRoadmapRepository();
    const projects = await repository.listProjects();
    const emptyProject = { key: 'empty', name: { en: 'Empty', zh: '空项目' }, roadmapEnabled: true, atlasEnabled: true };

    expect(resolveRoadmapSelection([emptyProject, ...projects], await repository.listRoadmaps(), 'empty')).toBeNull();
  });
});
