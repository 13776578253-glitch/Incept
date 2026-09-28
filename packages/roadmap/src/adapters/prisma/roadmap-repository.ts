import {
  validateBoard,
  validateRoadmap,
  type Roadmap,
  type RoadmapColumn,
  type RoadmapEntry,
  type RoadmapEntryLink,
  type RoadmapEntryPriority,
  type RoadmapEntryType,
  type RoadmapStatus,
  type RoadmapProject,
} from '../../domain';
import type { RoadmapBoard, RoadmapRepository } from '../../ports';

// 数据库行结构子集定义：业务包持有仓储与映射规则，底层连接与 Client 由宿主装配注入。
// 宿主装配注入 prisma 单例；结构类型让测试用假 client，也不依赖生成 client 的具体类型。
export type RoadmapRow = {
  id: string;
  key: string;
  nameEn: string;
  nameZh: string;
  position: number;
  projectId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RoadmapProjectRow = {
  id: string;
  key: string;
  nameEn: string;
  nameZh: string;
  position: number;
  roadmapEnabled: boolean;
  atlasEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type RoadmapWithProject = RoadmapRow & { project: RoadmapProjectRow | null };

export type RoadmapColumnRow = {
  id: string;
  roadmapId: string;
  status: string;
  labelEn: string;
  labelZh: string;
  position: number;
};

export type RoadmapEntryRow = {
  id: string;
  roadmapId: string;
  key: string;
  status: string;
  type: string;
  priority: string;
  titleEn: string;
  titleZh: string;
  summaryEn: string;
  summaryZh: string;
  detailEn: string | null;
  detailZh: string | null;
  votes: number | null;
  comments: number | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
};

export type RoadmapEntryLinkRow = {
  id: string;
  entryId: string;
  labelEn: string;
  labelZh: string;
  href: string;
  position: number;
};

export type RoadmapWithColumns = RoadmapWithProject & { columns: RoadmapColumnRow[] };

export type RoadmapWithChildren = RoadmapWithProject & {
  columns: RoadmapColumnRow[];
  entries: (RoadmapEntryRow & { links: RoadmapEntryLinkRow[] })[];
};

export type RoadmapPrismaClient = {
  roadmapProject: {
    findMany(query: { orderBy: { position: 'asc' } }): Promise<RoadmapProjectRow[]>;
    findUnique(query: { where: { key: string } }): Promise<RoadmapProjectRow | null>;
  };
  roadmap: {
    findMany(query: {
      orderBy: { position: 'asc' };
      include: { columns: true; project: true };
    }): Promise<RoadmapWithColumns[]>;
    findUnique(query: {
      where: { key: string };
      include: { columns: true; project: true; entries: { include: { links: true } } };
    }): Promise<RoadmapWithChildren | null>;
  };
};

function byPosition(a: { position: number }, b: { position: number }): number {
  return a.position - b.position;
}

export function toColumn(row: RoadmapColumnRow): RoadmapColumn {
  return {
    status: row.status as RoadmapStatus,
    label: { en: row.labelEn, zh: row.labelZh },
  };
}

export function toProject(row: RoadmapProjectRow): RoadmapProject {
  return {
    key: row.key,
    name: { en: row.nameEn, zh: row.nameZh },
    roadmapEnabled: row.roadmapEnabled,
    atlasEnabled: row.atlasEnabled,
  };
}

export function toRoadmap(
  row: RoadmapWithProject,
  columns: readonly RoadmapColumnRow[],
): Roadmap {
  return {
    key: row.key,
    name: { en: row.nameEn, zh: row.nameZh },
    project: row.project ? toProject(row.project) : {
      key: '',
      name: { en: '', zh: '' },
      roadmapEnabled: true,
      atlasEnabled: true,
    },
    columns: [...columns].sort(byPosition).map(toColumn),
  };
}

// 实体转换映射：position 映射为 order；votes/comments 为底层保留字段，不映射至领域模型。
export function toEntry(
  row: RoadmapEntryRow & { links: readonly RoadmapEntryLinkRow[] },
  roadmapKey: string,
): RoadmapEntry {
  const links: RoadmapEntryLink[] = [...row.links]
    .sort(byPosition)
    .map((link) => ({ label: { en: link.labelEn, zh: link.labelZh }, href: link.href }));

  // 详情双语映射：双 NULL 表示缺省；单侧存在视为异常数据，映射为空字符串交由校验层阻断。
  const detail =
    row.detailEn !== null || row.detailZh !== null
      ? { en: row.detailEn ?? '', zh: row.detailZh ?? '' }
      : undefined;

  return {
    key: row.key,
    roadmap: roadmapKey,
    order: row.position,
    status: row.status as RoadmapStatus,
    type: row.type as RoadmapEntryType,
    priority: row.priority as RoadmapEntryPriority,
    title: { en: row.titleEn, zh: row.titleZh },
    summary: { en: row.summaryEn, zh: row.summaryZh },
    ...(detail ? { detail } : {}),
    ...(links.length > 0 ? { links } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// 读链仓储：映射后过 domain 校验，坏行直接抛错（与 fixture 仓储同口径）。
export function createPrismaRoadmapRepository(prisma: RoadmapPrismaClient): RoadmapRepository {
  return {
    async listProjects(): Promise<RoadmapProject[]> {
      return (await prisma.roadmapProject.findMany({ orderBy: { position: 'asc' } })).map(toProject);
    },

    async getProject(key: string): Promise<RoadmapProject | null> {
      const row = await prisma.roadmapProject.findUnique({ where: { key } });
      return row ? toProject(row) : null;
    },

    async listRoadmaps(): Promise<Roadmap[]> {
      const rows = await prisma.roadmap.findMany({
        orderBy: { position: 'asc' },
        include: { columns: true, project: true },
      });

      return rows.filter((row) => row.project !== null).map((row) => {
        const roadmap = toRoadmap(row, row.columns);
        validateRoadmap(roadmap);
        return roadmap;
      });
    },

    async listBoard(roadmapKey: string): Promise<RoadmapBoard | null> {
      const row = await prisma.roadmap.findUnique({
        where: { key: roadmapKey },
        include: { columns: true, project: true, entries: { include: { links: true } } },
      });

      if (!row || !row.project) {
        return null;
      }

      const roadmap = toRoadmap(row, row.columns);
      const entries = [...row.entries].sort(byPosition).map((entry) => toEntry(entry, roadmap.key));
      validateBoard(roadmap, entries);

      return { roadmap, entries };
    },
  };
}
