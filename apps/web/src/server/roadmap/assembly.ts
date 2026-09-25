import { prisma } from '@incept/db';
import {
  createRoadmapColumnItemRoute,
  createRoadmapColumnsRoute,
  createRoadmapEntryItemRoute,
  createRoadmapEntriesRoute,
  createRoadmapImportRoute,
  createRoadmapItemRoute,
  createRoadmapsRoute,
} from '@incept/roadmap/next';
import {
  createPrismaRoadmapRepository,
  createPrismaRoadmapWriter,
  type RoadmapPrismaWriteClient,
} from '@incept/roadmap/adapters';
import type {
  AuthorizeOwner,
  RoadmapBoard,
  RoadmapRepository,
  RoadmapWriter,
} from '@incept/roadmap/ports';

import { getCurrentViewer, hasSameOrigin } from '@/server/auth';

// 宿主装配（决策 5/6/7）：门禁、连接、读写端口的宿主实现；包只认 ports，不感知会话模型。
export function createRoadmapRepository(): RoadmapRepository {
  const client: Parameters<typeof createPrismaRoadmapRepository>[0] = {
    roadmap: {
      findMany: (query) => prisma.roadmap.findMany(query),
      findUnique: (query) => prisma.roadmap.findUnique(query),
    },
  };

  return createPrismaRoadmapRepository(client);
}

export const authorizeOwner: AuthorizeOwner<Request> = async (request) =>
  hasSameOrigin(request) && (await getCurrentViewer()).role === 'owner';

export function createRoadmapWriter(): RoadmapWriter {
  const client: RoadmapPrismaWriteClient = {
    roadmap: {
      findUnique: (query) => prisma.roadmap.findUnique(query),
      findMany: (query) => prisma.roadmap.findMany(query),
      create: (args) => prisma.roadmap.create(args),
      update: (args) => prisma.roadmap.update(args),
      delete: (args) => prisma.roadmap.delete(args),
    },
    roadmapColumn: {
      upsert: (args) => prisma.roadmapColumn.upsert(args),
      delete: (args) => prisma.roadmapColumn.delete(args),
    },
    roadmapEntry: {
      count: (args) => prisma.roadmapEntry.count(args),
      findUnique: (args) => prisma.roadmapEntry.findUnique(args),
      create: (args) => prisma.roadmapEntry.create(args),
      update: (args) => prisma.roadmapEntry.update(args),
      delete: (args) => prisma.roadmapEntry.delete(args),
    },
    roadmapEntryLink: {
      deleteMany: (args) => prisma.roadmapEntryLink.deleteMany(args),
      create: (args) => prisma.roadmapEntryLink.create(args),
    },
    $transaction: (fn) => prisma.$transaction((tx) => fn(tx)),
  };

  return createPrismaRoadmapWriter(client);
}

export async function loadRoadmapAdminBoards(): Promise<RoadmapBoard[]> {
  const repository = createRoadmapRepository();
  const roadmaps = await repository.listRoadmaps();
  const boards: RoadmapBoard[] = [];

  for (const roadmap of roadmaps) {
    const board = await repository.listBoard(roadmap.key);

    if (board) boards.push(board);
  }

  return boards;
}

// 路由装配：6 个 route handler 工厂的宿主绑定；app/api 下的 stub 只 re-export 这些具名 handler。
const roadmapRouteDeps = {
  authorizeOwner,
  reader: createRoadmapRepository(),
  writer: createRoadmapWriter(),
};

const roadmapsRoute = createRoadmapsRoute(roadmapRouteDeps);
const roadmapItemRoute = createRoadmapItemRoute(roadmapRouteDeps);
const columnsRoute = createRoadmapColumnsRoute(roadmapRouteDeps);
const columnItemRoute = createRoadmapColumnItemRoute(roadmapRouteDeps);
const entriesRoute = createRoadmapEntriesRoute(roadmapRouteDeps);
const entryItemRoute = createRoadmapEntryItemRoute(roadmapRouteDeps);

export const roadmapsGet = roadmapsRoute.GET;
export const roadmapsPost = roadmapsRoute.POST;
export const roadmapUpdate = roadmapItemRoute.PATCH;
export const roadmapDelete = roadmapItemRoute.DELETE;
export const columnUpsert = columnsRoute.POST;
export const columnUpdate = columnItemRoute.PATCH;
export const columnDelete = columnItemRoute.DELETE;
export const entryCreate = entriesRoute.POST;
export const entryUpdate = entryItemRoute.PATCH;
export const entryDelete = entryItemRoute.DELETE;
export const roadmapImport = createRoadmapImportRoute(roadmapRouteDeps).POST;
