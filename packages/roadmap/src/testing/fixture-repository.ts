import { validateBoard } from '../domain';
import type { RoadmapBoard, RoadmapRepository } from '../ports';
import { fixtureEntries, fixtureRoadmaps } from './fixtures';

// 内存 fixture 仓储：Gate 前唯一数据源（决策条目 3），创建时全量校验，坏样本直接抛错。
export function createFixtureRoadmapRepository(): RoadmapRepository {
  const boards = new Map<string, RoadmapBoard>();
  const known = new Set<string>();

  for (const roadmap of fixtureRoadmaps) {
    known.add(roadmap.key);

    const entries = fixtureEntries
      .filter((entry) => entry.roadmap === roadmap.key)
      .sort((a, b) => a.order - b.order);

    validateBoard(roadmap, entries);
    boards.set(roadmap.key, { roadmap, entries });
  }

  for (const entry of fixtureEntries) {
    if (!known.has(entry.roadmap)) {
      throw new Error(`roadmap fixture invalid: entry "${entry.key}" points at unknown roadmap "${entry.roadmap}"`);
    }
  }

  return {
    async listRoadmaps() {
      return [...fixtureRoadmaps];
    },
    async listBoard(roadmapKey) {
      return boards.get(roadmapKey) ?? null;
    },
  };
}
