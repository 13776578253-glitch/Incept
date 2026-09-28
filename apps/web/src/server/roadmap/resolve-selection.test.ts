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

  it('matches boards by the -atlas suffix even when the project key contains "atlas"', () => {
    const project = { key: 'atlas-ops', name: { en: 'Atlas Ops', zh: 'Atlas Ops' }, roadmapEnabled: true, atlasEnabled: true };
    const roadmaps = [
      { key: 'atlas-ops-roadmap', name: { en: 'Roadmap', zh: '路线图' }, project, columns: [] },
      { key: 'atlas-ops-atlas', name: { en: 'Planning Board', zh: '规划图' }, project, columns: [] },
    ];

    expect(resolveRoadmapSelection([project], roadmaps, 'atlas-ops', undefined, 'atlas')?.roadmap.key).toBe('atlas-ops-atlas');
    expect(resolveRoadmapSelection([project], roadmaps, 'atlas-ops', undefined, 'roadmap')?.roadmap.key).toBe('atlas-ops-roadmap');
    expect(resolveRoadmapSelection([project], roadmaps, 'atlas-ops')?.roadmap.key).toBe('atlas-ops-roadmap');
    expect(resolveRoadmapSelection([project], roadmaps, 'atlas-ops', 'atlas-ops-atlas')?.roadmap.key).toBe('atlas-ops-atlas');
  });

  it('matches boards by suffix when the project key itself ends with -atlas', () => {
    const project = { key: 'ops-atlas', name: { en: 'Ops Atlas', zh: 'Ops Atlas' }, roadmapEnabled: true, atlasEnabled: true };
    const roadmaps = [
      { key: 'ops-atlas-roadmap', name: { en: 'Roadmap', zh: '路线图' }, project, columns: [] },
      { key: 'ops-atlas-atlas', name: { en: 'Planning Board', zh: '规划图' }, project, columns: [] },
    ];

    expect(resolveRoadmapSelection([project], roadmaps, 'ops-atlas', undefined, 'atlas')?.roadmap.key).toBe('ops-atlas-atlas');
    expect(resolveRoadmapSelection([project], roadmaps, 'ops-atlas')?.roadmap.key).toBe('ops-atlas-roadmap');
  });
});
