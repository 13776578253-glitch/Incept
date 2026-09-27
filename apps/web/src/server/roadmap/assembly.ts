import { prisma } from '@incept/db';
import {
  createRoadmapProjectItemRoute,
  createRoadmapProjectsRoute,
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
  type RoadmapPrismaTx,
  type RoadmapPrismaWriteClient,
} from '@incept/roadmap/adapters';
import type {
  AuthorizeOwner,
  RoadmapBoard,
  RoadmapRepository,
  RoadmapWriter,
} from '@incept/roadmap/ports';
import type { RoadmapProject } from '@incept/roadmap/domain';

import { getCurrentViewer, hasSameOrigin } from '@/server/auth';

// 宿主装配（决策 5/6/7）：门禁、连接、读写端口的宿主实现；包只认 ports，不感知会话模型。
export function createRoadmapRepository(): RoadmapRepository {
  const client: Parameters<typeof createPrismaRoadmapRepository>[0] = {
    roadmapProject: {
      findMany: (query) => prisma.roadmapProject.findMany(query),
      findUnique: (query) => prisma.roadmapProject.findUnique(query),
    },
    roadmap: {
      findMany: (query) => prisma.roadmap.findMany(query),
      findUnique: (query) => prisma.roadmap.findUnique(query),
    },
  };

  return createPrismaRoadmapRepository(client);
}

// U2：RSC 用的无 Request 门禁（规格指名放装配层）；路由门禁仍是 authorizeOwner（同源 + 本判定）。
export const isRoadmapOwner = async (): Promise<boolean> =>
  (await getCurrentViewer()).role === 'owner';

export const authorizeOwner: AuthorizeOwner<Request> = async (request) =>
  hasSameOrigin(request) && (await isRoadmapOwner());

export function createRoadmapWriter(): RoadmapWriter {
  const client: RoadmapPrismaWriteClient = {
    roadmap: {
      findUnique: (query) => prisma.roadmap.findUnique(query),
      findMany: (query) => prisma.roadmap.findMany(query),
      count: (args) => prisma.roadmap.count(args),
      create: (args) => prisma.roadmap.create(args),
      update: (args) => prisma.roadmap.update(args),
      delete: (args) => prisma.roadmap.delete(args),
    },
    roadmapProject: {
      findMany: (args) => prisma.roadmapProject.findMany(args),
      findUnique: (args) => prisma.roadmapProject.findUnique(args),
      create: (args) => prisma.roadmapProject.create(args),
      update: (args) => prisma.roadmapProject.update(args),
      delete: (args) => prisma.roadmapProject.delete(args),
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
    // Prisma transaction proxy exposes roadmap.count for the project deletion invariant.
    $transaction: (fn) => prisma.$transaction((tx) => fn(tx as unknown as RoadmapPrismaTx)),
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

export async function loadRoadmapAdminProjects(): Promise<RoadmapProject[]> {
  return createRoadmapRepository().listProjects();
}

// 路由装配：6 个 route handler 工厂的宿主绑定；app/api 下的 stub 只 re-export 这些具名 handler。
const roadmapRouteDeps = {
  authorizeOwner,
  reader: createRoadmapRepository(),
  writer: createRoadmapWriter(),
};

const roadmapsRoute = createRoadmapsRoute(roadmapRouteDeps);
const projectsRoute = createRoadmapProjectsRoute(roadmapRouteDeps);
const projectItemRoute = createRoadmapProjectItemRoute(roadmapRouteDeps);
const roadmapItemRoute = createRoadmapItemRoute(roadmapRouteDeps);
const columnsRoute = createRoadmapColumnsRoute(roadmapRouteDeps);
const columnItemRoute = createRoadmapColumnItemRoute(roadmapRouteDeps);
const entriesRoute = createRoadmapEntriesRoute(roadmapRouteDeps);
const entryItemRoute = createRoadmapEntryItemRoute(roadmapRouteDeps);

export const roadmapsGet = roadmapsRoute.GET;
export const roadmapsPost = roadmapsRoute.POST;
export const projectsGet = projectsRoute.GET;
export const projectsPost = projectsRoute.POST;
export const projectUpdate = projectItemRoute.PATCH;
export const projectDelete = projectItemRoute.DELETE;
export const roadmapUpdate = roadmapItemRoute.PATCH;
export const roadmapDelete = roadmapItemRoute.DELETE;
export const columnUpsert = columnsRoute.POST;
export const columnUpdate = columnItemRoute.PATCH;
export const columnDelete = columnItemRoute.DELETE;
export const entryCreate = entriesRoute.POST;
export const entryUpdate = entryItemRoute.PATCH;
export const entryDelete = entryItemRoute.DELETE;
export const roadmapImport = createRoadmapImportRoute(roadmapRouteDeps).POST;
