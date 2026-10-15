import {
  assertLocalizedText,
  validateEntry,
  ROADMAP_ENTRY_PRIORITIES,
  ROADMAP_ENTRY_TYPES,
  type Roadmap,
  type RoadmapEntry,
  type RoadmapEntryImportItem,
  type RoadmapEntryLink,
  type RoadmapEntryPriority,
  type RoadmapEntryType,
  type RoadmapStatus,
} from '../../domain';
import type { RoadmapEntryPatch, RoadmapWriter } from '../../ports';

import {
  toEntry,
  toRoadmap,
  type RoadmapColumnRow,
  type RoadmapEntryLinkRow,
  type RoadmapEntryRow,
  type RoadmapRow,
  type RoadmapProjectRow,
  type RoadmapWithProject,
} from './roadmap-repository';

// 写端口的结构化 Prisma 句柄：事务回调只拿事务代理（Prisma TransactionClient 同形）。
export type RoadmapPrismaTx = {
  roadmap: {
    findUnique(query: {
      where: { key: string };
      include: { columns: true; project: true; entries: { include: { links: true } } };
    }): Promise<
      | (RoadmapRow & {
          project: RoadmapProjectRow | null;
          columns: RoadmapColumnRow[];
          entries: (RoadmapEntryRow & { links: RoadmapEntryLinkRow[] })[];
        })
      | null
    >;
    findMany(query: {
      orderBy: { position: 'asc' };
      include: { columns: true; project: true };
    }): Promise<(RoadmapWithProject & { columns: RoadmapColumnRow[] })[]>;
    create(args: {
      data: { key: string; nameEn: string; nameZh: string; position: number; project: { connect: { key: string } } };
      include: { project: true; columns: true };
    }): Promise<RoadmapWithProject & { columns: RoadmapColumnRow[] }>;
    delete(args: { where: { key: string } }): Promise<RoadmapRow>;
  };
  roadmapProject: {
    findMany(args: { orderBy: { position: 'asc' } }): Promise<RoadmapProjectRow[]>;
    findUnique(args: { where: { key: string } }): Promise<RoadmapProjectRow | null>;
    create(args: { data: { key: string; nameEn: string; nameZh: string; position: number; roadmapEnabled: boolean; atlasEnabled: boolean } }): Promise<RoadmapProjectRow>;
    update(args: { where: { key: string }; data: { nameEn?: string; nameZh?: string; position?: number; roadmapEnabled?: boolean; atlasEnabled?: boolean } }): Promise<RoadmapProjectRow>;
    delete(args: { where: { key: string } }): Promise<RoadmapProjectRow>;
  };
  roadmapColumn: {
    upsert(args: {
      where: { roadmapId_status: { roadmapId: string; status: RoadmapStatus } };
      create: {
        roadmapId: string;
        status: RoadmapStatus;
        labelEn: string;
        labelZh: string;
        position: number;
      };
      update: { labelEn: string; labelZh: string; position?: number };
    }): Promise<RoadmapColumnRow>;
  };
  roadmapEntry: {
    count(args: { where: { roadmapId: string; status?: RoadmapStatus } }): Promise<number>;
    findUnique(args: { where: { key: string } }): Promise<RoadmapEntryRow | null>;
    create(args: {
      data: {
        roadmapId: string;
        key: string;
        status: RoadmapStatus;
        type: RoadmapEntryType;
        priority: RoadmapEntryPriority;
        titleEn: string;
        titleZh: string;
        summaryEn: string;
        summaryZh: string;
        detailEn: string | null;
        detailZh: string | null;
        position: number;
      };
    }): Promise<RoadmapEntryRow>;
    update(args: {
      where: { key: string };
      data: {
        status?: RoadmapStatus;
        type?: RoadmapEntryType;
        priority?: RoadmapEntryPriority;
        titleEn?: string;
        titleZh?: string;
        summaryEn?: string;
        summaryZh?: string;
        detailEn?: string | null;
        detailZh?: string | null;
        position?: number;
      };
    }): Promise<RoadmapEntryRow>;
    delete(args: { where: { key: string } }): Promise<RoadmapEntryRow>;
  };
  roadmapEntryLink: {
    deleteMany(args: { where: { entryId: string } }): Promise<{ count: number }>;
    create(args: {
      data: { entryId: string; labelEn: string; labelZh: string; href: string; position: number };
    }): Promise<RoadmapEntryLinkRow>;
  };
};

export type RoadmapPrismaWriteClient = RoadmapPrismaTx & {
  $transaction<T>(fn: (tx: RoadmapPrismaTx) => Promise<T>): Promise<T>;
};

function fail(reason: string): never {
  throw new Error(`roadmap write rejected: ${reason}`);
}

// 缺省标识生成：提取英文标题小写字母与数字生成 slug，全空退化为 "entry"；碰撞由写端口递增后缀。
function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug === '' ? 'entry' : slug;
}

// 行 → 域草稿合并：patch 只覆盖给出的字段，校验作用于合并结果（事务内读数）。
function mergedEntry(
  current: RoadmapEntry,
  patch: RoadmapEntryPatch,
): Omit<RoadmapEntry, 'roadmap'> {
  return {
    key: current.key,
    order: patch.order ?? current.order,
    status: patch.status ?? current.status,
    type: patch.type ?? current.type,
    priority: patch.priority ?? current.priority,
    title: patch.title ?? current.title,
    summary: patch.summary ?? current.summary,
    // 显式 null 判定必须优先于空值合并，确保清除操作不被旧值覆盖。
    detail: patch.detail === null ? undefined : (patch.detail ?? current.detail),
    links: patch.links ?? current.links,
  };
}

export function createPrismaRoadmapWriter(client: RoadmapPrismaWriteClient): RoadmapWriter {
  async function nextPosition(tx: RoadmapPrismaTx, roadmapKey: string): Promise<number> {
    const board = await tx.roadmap.findUnique({
      where: { key: roadmapKey },
      include: { columns: true, project: true, entries: { include: { links: true } } },
    });
    const entries = board?.entries ?? [];

    return entries.length === 0 ? 10 : Math.max(...entries.map((entry) => entry.position)) + 10;
  }

  // 批量导入顺序递增：计划阶段未实际入库前按看板维护递增计数器，显式指定 order 时同步提升下限。
  // history: 解决同批次未指定 order 的多条目批量导入时位置重叠的问题。
  async function takeNextOrder(
    tx: RoadmapPrismaTx,
    roadmapKey: string,
    runningNext: Map<string, number>,
    explicit?: number,
  ): Promise<number> {
    const baseline = runningNext.get(roadmapKey) ?? (await nextPosition(tx, roadmapKey));
    const order = explicit ?? baseline;
    runningNext.set(roadmapKey, Math.max(baseline, order) + 10);
    return order;
  }

  // key 全局唯一（schema @unique）：slug 逐候选查重，碰撞加 -2、-3 后缀；taken 为清单内已占用。
  async function resolveEntryKey(
    tx: RoadmapPrismaTx,
    titleEn: string,
    taken: ReadonlySet<string> = new Set(),
  ): Promise<string> {
    const base = slugifyTitle(titleEn);
    let candidate = base;

    for (let suffix = 2; ; suffix += 1) {
      if (!taken.has(candidate)) {
        const existing = await tx.roadmapEntry.findUnique({ where: { key: candidate } });

        if (!existing) {
          return candidate;
        }
      }

      candidate = `${base}-${suffix}`;
    }
  }

  async function readRoadmapShape(
    tx: RoadmapPrismaTx,
    roadmapKey: string,
  ): Promise<{ roadmap: Roadmap; roadmapId: string }> {
    const row = await tx.roadmap.findUnique({
      where: { key: roadmapKey },
      include: { columns: true, project: true, entries: { include: { links: true } } },
    });

    if (!row) {
      fail(`the roadmap "${roadmapKey}" does not exist`);
    }

    if (!row.project) {
      fail(`the roadmap "${roadmapKey}" has no project`);
    }

    return { roadmap: toRoadmap(row, row.columns), roadmapId: row.id };
  }

  async function writeLinks(
    tx: RoadmapPrismaTx,
    entryId: string,
    links: readonly RoadmapEntryLink[],
  ): Promise<void> {
    await tx.roadmapEntryLink.deleteMany({ where: { entryId } });

    for (const [index, link] of links.entries()) {
      await tx.roadmapEntryLink.create({
        data: {
          entryId,
          labelEn: link.label.en,
          labelZh: link.label.zh,
          href: link.href,
          position: (index + 1) * 10,
        },
      });
    }
  }

  async function readEntryWithLinks(
    tx: RoadmapPrismaTx,
    entryKey: string,
  ): Promise<RoadmapEntryRow & { links: RoadmapEntryLinkRow[]; roadmapKey: string }> {
    const board = await tx.roadmap.findMany({
      orderBy: { position: 'asc' },
      include: { columns: true, project: true },
    });

    for (const roadmapRow of board) {
      const full = await tx.roadmap.findUnique({
        where: { key: roadmapRow.key },
        include: { columns: true, project: true, entries: { include: { links: true } } },
      });
      const entry = full?.entries.find((candidate) => candidate.key === entryKey);

      if (entry) {
        return { ...entry, roadmapKey: roadmapRow.key };
      }
    }

    fail(`the entry "${entryKey}" does not exist`);
  }

  return {
    async createProject({ key, name, position, roadmapEnabled = true, atlasEnabled = true }) {
      if (key.trim() === '') fail('project key must be a non-empty string');
      if (!roadmapEnabled && !atlasEnabled) fail('at least one public surface must remain enabled');
      assertLocalizedText(name, 'name');
      return client.$transaction(async (tx) => {
        const rows = await tx.roadmapProject.findMany({ orderBy: { position: 'asc' } });
        const resolved = position ?? (rows.length === 0 ? 10 : Math.max(...rows.map((row) => row.position)) + 10);
        const row = await tx.roadmapProject.create({
          data: { key, nameEn: name.en, nameZh: name.zh, position: resolved, roadmapEnabled, atlasEnabled },
        });

        // 默认初始化路线图与规划图看板及列结构。
        // history: 解决新建空项目缺失默认看板的问题，默认开启路线图与规划图双板。
        const roadmapBoard = await tx.roadmap.create({
          data: {
            key: `${key}-roadmap`,
            nameEn: 'Roadmap',
            nameZh: '路线图',
            position: 10,
            project: { connect: { key } },
          },
          include: { project: true, columns: true },
        });

        const roadmapCols: { status: RoadmapStatus; labelEn: string; labelZh: string; position: number }[] = [
          { status: 'reviewing', labelEn: 'Backlog', labelZh: 'Backlog', position: 10 },
          { status: 'unstarted', labelEn: 'Next up', labelZh: 'Next up', position: 20 },
          { status: 'active', labelEn: 'In Progress', labelZh: 'In Progress', position: 30 },
          { status: 'completed', labelEn: 'Done', labelZh: 'Done', position: 40 },
        ];
        for (const col of roadmapCols) {
          await tx.roadmapColumn.upsert({
            where: { roadmapId_status: { roadmapId: roadmapBoard.id, status: col.status } },
            create: {
              roadmapId: roadmapBoard.id,
              status: col.status,
              labelEn: col.labelEn,
              labelZh: col.labelZh,
              position: col.position,
            },
            update: { labelEn: col.labelEn, labelZh: col.labelZh, position: col.position },
          });
        }

        const atlasBoard = await tx.roadmap.create({
          data: {
            key: `${key}-atlas`,
            nameEn: 'Planning Board',
            nameZh: '规划图',
            position: 20,
            project: { connect: { key } },
          },
          include: { project: true, columns: true },
        });

        const atlasCols: { status: RoadmapStatus; labelEn: string; labelZh: string; position: number }[] = [
          { status: 'unstarted', labelEn: 'Planned', labelZh: 'Planned', position: 10 },
          { status: 'active', labelEn: 'Building', labelZh: 'Building', position: 20 },
          { status: 'completed', labelEn: 'Shipped', labelZh: 'Shipped', position: 30 },
        ];
        for (const col of atlasCols) {
          await tx.roadmapColumn.upsert({
            where: { roadmapId_status: { roadmapId: atlasBoard.id, status: col.status } },
            create: {
              roadmapId: atlasBoard.id,
              status: col.status,
              labelEn: col.labelEn,
              labelZh: col.labelZh,
              position: col.position,
            },
            update: { labelEn: col.labelEn, labelZh: col.labelZh, position: col.position },
          });
        }

        return { key: row.key, name: { en: row.nameEn, zh: row.nameZh }, roadmapEnabled: row.roadmapEnabled, atlasEnabled: row.atlasEnabled };
      });
    },

    async updateProject({ key, patch }) {
      if (patch.name) assertLocalizedText(patch.name, 'patch.name');
      if (patch.roadmapEnabled === false && patch.atlasEnabled === false) {
        fail('at least one public surface must remain enabled');
      }
      const row = await client.roadmapProject.update({
        where: { key },
        data: {
          ...(patch.name ? { nameEn: patch.name.en, nameZh: patch.name.zh } : {}),
          ...(patch.position !== undefined ? { position: patch.position } : {}),
          ...(patch.roadmapEnabled !== undefined ? { roadmapEnabled: patch.roadmapEnabled } : {}),
          ...(patch.atlasEnabled !== undefined ? { atlasEnabled: patch.atlasEnabled } : {}),
        },
      });
      if (!row.roadmapEnabled && !row.atlasEnabled) fail('at least one public surface must remain enabled');
      return { key: row.key, name: { en: row.nameEn, zh: row.nameZh }, roadmapEnabled: row.roadmapEnabled, atlasEnabled: row.atlasEnabled };
    },

    // 删除项目：看板下仍有条目时阻断删除以保护数据；无条目时安全清理默认看板。
    // history: 配合默认初始化看板，允许空项目连带清理默认看板，非空项目强制保护。
    async deleteProject({ key }) {
      await client.$transaction(async (tx) => {
        const project = await tx.roadmapProject.findUnique({ where: { key } });
        if (!project) fail(`the project "${key}" does not exist`);
        const allRoadmaps = await tx.roadmap.findMany({
          orderBy: { position: 'asc' },
          include: { columns: true, project: true },
        });
        const projectRoadmaps = allRoadmaps.filter((r) => r.project?.key === key);
        for (const r of projectRoadmaps) {
          const entryCount = await tx.roadmapEntry.count({ where: { roadmapId: r.id } });
          if (entryCount > 0) {
            fail(`the project "${key}" still has entries on its roadmaps; delete entries before deleting the project`);
          }
        }
        for (const r of projectRoadmaps) {
          await tx.roadmap.delete({ where: { key: r.key } });
        }
        await tx.roadmapProject.delete({ where: { key } });
      });
      return { key };
    },

    async createEntry(input) {
      return client.$transaction(async (tx) => {
        const { roadmap, roadmapId } = await readRoadmapShape(tx, input.roadmapKey);
        const key = input.key ?? (await resolveEntryKey(tx, input.title.en));
        const draft = {
          key,
          order: input.order ?? (await nextPosition(tx, input.roadmapKey)),
          status: input.status,
          type: input.type,
          priority: input.priority,
          title: input.title,
          summary: input.summary,
          detail: input.detail,
          links: input.links ?? [],
        };
        const entry: RoadmapEntry = { ...draft, roadmap: input.roadmapKey };

        if (!ROADMAP_ENTRY_TYPES.includes(entry.type)) {
          fail(`unknown type "${String(entry.type)}"`);
        }
        if (!ROADMAP_ENTRY_PRIORITIES.includes(entry.priority)) {
          fail(`unknown priority "${String(entry.priority)}"`);
        }
        validateEntry(entry, roadmap);

        const row = await tx.roadmapEntry.create({
          data: {
            roadmapId,
            key: entry.key,
            status: entry.status,
            type: entry.type,
            priority: entry.priority,
            titleEn: entry.title.en,
            titleZh: entry.title.zh,
            summaryEn: entry.summary.en,
            summaryZh: entry.summary.zh,
            detailEn: entry.detail?.en ?? null,
            detailZh: entry.detail?.zh ?? null,
            position: entry.order,
          },
        });
        await writeLinks(tx, row.id, entry.links ?? []);

        return {
          ...entry,
          links: entry.links ?? [],
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
      });
    },

    async updateEntry({ key, patch }) {
      return client.$transaction(async (tx) => {
        const current = await readEntryWithLinks(tx, key);
        const { roadmap } = await readRoadmapShape(tx, current.roadmapKey);
        const merged = mergedEntry(
          toEntry(current, current.roadmapKey),
          patch,
        );
        const entry: RoadmapEntry = { ...merged, roadmap: current.roadmapKey };

        validateEntry(entry, roadmap);

        const row = await tx.roadmapEntry.update({
          where: { key },
          data: {
            status: entry.status,
            type: entry.type,
            priority: entry.priority,
            titleEn: entry.title.en,
            titleZh: entry.title.zh,
            summaryEn: entry.summary.en,
            summaryZh: entry.summary.zh,
            detailEn: entry.detail?.en ?? null,
            detailZh: entry.detail?.zh ?? null,
            position: entry.order,
          },
        });

        if (patch.links !== undefined) {
          await writeLinks(tx, current.id, entry.links ?? []);
        }

        return {
          ...entry,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
      });
    },

    async deleteEntry({ key }) {
      await client.roadmapEntry.delete({ where: { key } });

      return { key };
    },

    // 批量导入：人工 JSON 清单单事务全量写入，全校验通过后统一落库，任何单项失败全量回滚。
    // 仅消费上传的数据体，不依赖或解析仓库任何文件。
    // history: 彻底移除更新旧卡片分支，改为严格追加模式（append-only），遇到已有 key 直接抛错阻断。
    async importEntries({ entries }) {
      if (entries.length === 0) {
        fail('the import manifest carries no entries');
      }

      return client.$transaction(async (tx) => {
        type ImportPlan = {
          item: RoadmapEntryImportItem;
          key: string;
          order: number;
          roadmapKey: string;
          roadmapId: string;
        };

        const shapes = new Map<string, { roadmap: Roadmap; roadmapId: string }>();
        const takenKeys = new Set<string>();
        const nextOrders = new Map<string, number>();
        const plans: ImportPlan[] = [];

        for (const item of entries) {
          let shape = shapes.get(item.roadmapKey);

          if (!shape) {
            shape = await readRoadmapShape(tx, item.roadmapKey);
            shapes.set(item.roadmapKey, shape);
          }

          const key = item.key ?? (await resolveEntryKey(tx, item.title.en, takenKeys));

          if (takenKeys.has(key)) {
            fail(`the manifest repeats the key "${key}"`);
          }

          const existing = await tx.roadmapEntry.findUnique({ where: { key } });

          if (existing) {
            fail(`the entry "${key}" already exists; import only appends new entries and does not overwrite`);
          }

          const order = await takeNextOrder(tx, item.roadmapKey, nextOrders, item.order);
          const entry: RoadmapEntry = {
            key,
            roadmap: item.roadmapKey,
            order,
            status: item.status,
            type: item.type,
            priority: item.priority,
            title: item.title,
            summary: item.summary,
            ...(item.detail ? { detail: item.detail } : {}),
            ...(item.links && item.links.length > 0 ? { links: item.links } : {}),
          };

          validateEntry(entry, shape.roadmap);
          takenKeys.add(key);
          plans.push({
            item,
            key,
            order,
            roadmapKey: item.roadmapKey,
            roadmapId: shape.roadmapId,
          });
        }

        const results: RoadmapEntry[] = [];

        for (const plan of plans) {
          const data = {
            status: plan.item.status,
            type: plan.item.type,
            priority: plan.item.priority,
            titleEn: plan.item.title.en,
            titleZh: plan.item.title.zh,
            summaryEn: plan.item.summary.en,
            summaryZh: plan.item.summary.zh,
            detailEn: plan.item.detail?.en ?? null,
            detailZh: plan.item.detail?.zh ?? null,
            position: plan.order,
          };
          const row = await tx.roadmapEntry.create({
            data: { roadmapId: plan.roadmapId, key: plan.key, ...data },
          });

          await writeLinks(tx, row.id, plan.item.links ?? []);
          results.push({
            key: plan.key,
            roadmap: plan.roadmapKey,
            order: plan.order,
            status: plan.item.status,
            type: plan.item.type,
            priority: plan.item.priority,
            title: plan.item.title,
            summary: plan.item.summary,
            ...(plan.item.detail ? { detail: plan.item.detail } : {}),
            links: plan.item.links ?? [],
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
          });
        }

        return results;
      });
    },
  };
}
