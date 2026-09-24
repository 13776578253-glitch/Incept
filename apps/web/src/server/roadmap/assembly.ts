import { prisma } from '@incept/db';
import { createPrismaRoadmapRepository } from '@incept/roadmap/adapters';
import type { RoadmapPrismaClient } from '@incept/roadmap/adapters';
import type { RoadmapRepository } from '@incept/roadmap/ports';

// 宿主装配（决策 7）：连接注入，包内不碰 client 单例（T3 分层封装）。
export function createRoadmapRepository(): RoadmapRepository {
  const client: RoadmapPrismaClient = {
    roadmap: {
      findMany: (query) => prisma.roadmap.findMany(query),
      findUnique: (query) => prisma.roadmap.findUnique(query),
    },
  };

  return createPrismaRoadmapRepository(client);
}
