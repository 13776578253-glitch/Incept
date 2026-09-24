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
} from '../../domain';
import type { RoadmapBoard, RoadmapRepository } from '../../ports';

// Prisma 模型句柄的结构子集（T3：@incept/db 持有 schema/migration/client，包持有仓储规则）。
// 宿主装配注入 prisma 单例；结构类型让测试用假 client，也不依赖生成 client 的具体类型。
export type RoadmapRow = {
  id: string;
  key: string;
  nameEn: string;
  nameZh: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
};

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

export type RoadmapWithColumns = RoadmapRow & { columns: RoadmapColumnRow[] };

export type RoadmapWithChildren = RoadmapRow & {
  columns: RoadmapColumnRow[];
  entries: (RoadmapEntryRow & { links: RoadmapEntryLinkRow[] })[];
};

export type RoadmapPrismaClient = {
  roadmap: {
    findMany(query: {
      orderBy: { position: 'asc' };
      include: { columns: true };
    }): Promise<RoadmapWithColumns[]>;
    findUnique(query: {
      where: { key: string };
      include: { columns: true; entries: { include: { links: true } } };
    }): Promise<RoadmapWithChildren | null>;
  };
};

function byPosition(a: { position: number }, b: { position: number }): number {
  return a.position - b.position;
}

function toColumn(row: RoadmapColumnRow): RoadmapColumn {
  return {
    status: row.status as RoadmapStatus,
    label: { en: row.labelEn, zh: row.labelZh },
  };
}

function toRoadmap(row: RoadmapRow, columns: readonly RoadmapColumnRow[]): Roadmap {
  return {
    key: row.key,
    name: { en: row.nameEn, zh: row.nameZh },
    columns: [...columns].sort(byPosition).map(toColumn),
  };
}

// 行 → 域：position → order；entry.roadmap 记的是 roadmap key（校验口径），由父行带入。
function toEntry(
  row: RoadmapEntryRow & { links: readonly RoadmapEntryLinkRow[] },
  roadmapKey: string,
): RoadmapEntry {
  const links: RoadmapEntryLink[] = [...row.links]
    .sort(byPosition)
    .map((link) => ({ label: { en: link.labelEn, zh: link.labelZh }, href: link.href }));
  const hasMetrics = row.votes !== null || row.comments !== null;

  return {
    key: row.key,
    roadmap: roadmapKey,
    order: row.position,
    status: row.status as RoadmapStatus,
    type: row.type as RoadmapEntryType,
    priority: row.priority as RoadmapEntryPriority,
    title: { en: row.titleEn, zh: row.titleZh },
    summary: { en: row.summaryEn, zh: row.summaryZh },
    ...(hasMetrics
      ? {
          metrics: {
            ...(row.votes !== null ? { votes: row.votes } : {}),
            ...(row.comments !== null ? { comments: row.comments } : {}),
          },
        }
      : {}),
    ...(links.length > 0 ? { links } : {}),
  };
}

// 读链仓储：映射后过 domain 校验，坏行直接抛错（与 fixture 仓储同口径）。
export function createPrismaRoadmapRepository(prisma: RoadmapPrismaClient): RoadmapRepository {
  return {
    async listRoadmaps(): Promise<Roadmap[]> {
      const rows = await prisma.roadmap.findMany({
        orderBy: { position: 'asc' },
        include: { columns: true },
      });

      return rows.map((row) => {
        const roadmap = toRoadmap(row, row.columns);
        validateRoadmap(roadmap);
        return roadmap;
      });
    },

    async listBoard(roadmapKey: string): Promise<RoadmapBoard | null> {
      const row = await prisma.roadmap.findUnique({
        where: { key: roadmapKey },
        include: { columns: true, entries: { include: { links: true } } },
      });

      if (!row) {
        return null;
      }

      const roadmap = toRoadmap(row, row.columns);
      const entries = [...row.entries].sort(byPosition).map((entry) => toEntry(entry, roadmap.key));
      validateBoard(roadmap, entries);

      return { roadmap, entries };
    },
  };
}
