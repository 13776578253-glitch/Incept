import { describe, expect, it } from 'vitest';

import { createFixtureRoadmapRepository } from '../fixture-repository';
import { fixtureEntries, fixtureRoadmaps } from '../fixtures';

describe('roadmap fixtures', () => {
  it('validate cleanly and cover both roadmaps', async () => {
    const repository = createFixtureRoadmapRepository();

    expect(await repository.listRoadmaps()).toHaveLength(fixtureRoadmaps.length);
    for (const roadmap of fixtureRoadmaps) {
      expect(await repository.listBoard(roadmap.key)).not.toBeNull();
    }
    expect(await repository.listBoard('missing')).toBeNull();
  });

  it('return entries sorted by hand order', async () => {
    const repository = createFixtureRoadmapRepository();
    const board = await repository.listBoard('sample-roadmap');

    expect(board).not.toBeNull();
    const orders = (board?.entries ?? []).map((entry) => entry.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('cover the extreme samples the UI must survive', async () => {
    const repository = createFixtureRoadmapRepository();
    const board = await repository.listBoard('sample-roadmap');
    const entries = board?.entries ?? [];

    expect(entries.some((entry) => entry.title.en.length > 100)).toBe(true);

    const atlas = await repository.listBoard('sample-atlas');
    const active = atlas?.entries.filter((entry) => entry.status === 'active') ?? [];
    expect(active).toHaveLength(0);
  });

  it('declare the second board with its own columns (multi-roadmap axis)', () => {
    const atlas = fixtureRoadmaps.find((roadmap) => roadmap.key === 'sample-atlas');

    expect(atlas?.columns.map((column) => column.status)).toEqual([
      'unstarted',
      'active',
      'completed',
    ]);
    expect(fixtureEntries.filter((entry) => entry.roadmap === 'sample-atlas').length).toBeGreaterThan(0);
  });
});
