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

// 宿主装配层：提供门禁、数据库连接与读写端口实现；业务包只依赖 ports 契约，解耦宿主会话模型。
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

// 服务端组件门禁：直接基于会话角色判定 Owner 权限；API 路由仍使用带同源校验的 authorizeOwner。
export const isRoadmapOwner = async (): Promise<boolean> =>
  (await getCurrentViewer()).role === 'owner';

export const authorizeOwner: AuthorizeOwner<Request> = async (request) =>
  (request.method === 'GET' || request.method === 'HEAD' || hasSameOrigin(request)) &&
  (await isRoadmapOwner());

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

// API 路由装配：统一绑定内部路由处理函数，上层路由入口仅负责转发重导出。
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
