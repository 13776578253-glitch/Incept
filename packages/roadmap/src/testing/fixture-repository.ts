import { validateBoard } from '../domain';
import type { RoadmapBoard, RoadmapRepository } from '../ports';
import { fixtureEntries, fixtureProjects, fixtureRoadmaps } from './fixtures';

// 测试内存仓储：提供离线测试看板数据，初始化时执行全量域校验。
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
    async listProjects() {
      return [...fixtureProjects];
    },
    async getProject(key) {
      return fixtureProjects.find((project) => project.key === key) ?? null;
    },
    async listRoadmaps() {
      return [...fixtureRoadmaps];
    },
    async listBoard(roadmapKey) {
      return boards.get(roadmapKey) ?? null;
    },
  };
}
