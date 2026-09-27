import {
  assertLocalizedText,
  validateEntry,
  ROADMAP_ENTRY_PRIORITIES,
  ROADMAP_ENTRY_TYPES,
  ROADMAP_STATUSES,
  type Roadmap,
  type RoadmapColumn,
  type RoadmapEntry,
  type RoadmapEntryImportItem,
  type RoadmapEntryLink,
  type RoadmapEntryPriority,
  type RoadmapEntryType,
  type RoadmapStatus,
} from '../../domain';
import type { RoadmapEntryPatch, RoadmapWriter } from '../../ports';

import {
  toColumn,
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
    count(args: { where: { projectId: string } }): Promise<number>;
    create(args: {
      data: { key: string; nameEn: string; nameZh: string; position: number; project: { connect: { key: string } } };
      include: { project: true; columns: true };
    }): Promise<RoadmapWithProject & { columns: RoadmapColumnRow[] }>;
    update(args: {
      where: { key: string };
      data: { nameEn?: string; nameZh?: string; position?: number; projectId?: string };
    }): Promise<RoadmapRow>;
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
    delete(args: {
      where: { roadmapId_status: { roadmapId: string; status: RoadmapStatus } };
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

function assertStatus(value: string): asserts value is RoadmapStatus {
  if (!ROADMAP_STATUSES.includes(value as RoadmapStatus)) {
    fail(`unknown status "${value}"`);
  }
}

// 缺省 key 由英文标题生成（U3）：仅保留 a-z0-9 段，全空退化为 "entry"；碰撞后缀由写口负责。
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
    // M2：=== null 判定必须在 ?? 之前，否则 null ?? current.detail 会吞掉清空。
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

        // 默认初始化路线图与规划图看板及列结构
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

    async createRoadmap({ key, name, projectKey, position }) {
      assertLocalizedText(name, 'name');

      return client.$transaction(async (tx) => {
        const existing = await tx.roadmap.findMany({
          orderBy: { position: 'asc' },
          include: { columns: true, project: true },
        });

        if (existing.some((row) => row.key === key)) {
          fail(`the roadmap "${key}" already exists`);
        }

        const resolved =
          position ?? (existing.length === 0 ? 10 : Math.max(...existing.map((row) => row.position)) + 10);
        const row = await tx.roadmap.create({
          data: { key, nameEn: name.en, nameZh: name.zh, position: resolved, project: { connect: { key: projectKey } } },
          include: { project: true, columns: true },
        });

        if (!row.project) fail(`the roadmap "${key}" was created without a project`);

        return toRoadmap(row, row.columns);
      });
    },

    async updateRoadmap({ key, patch }) {
      if (patch.name) {
        assertLocalizedText(patch.name, 'patch.name');
      }

      return client.$transaction(async (tx) => {
        const project = patch.projectKey === undefined ? undefined : await tx.roadmapProject.findUnique({ where: { key: patch.projectKey } });
        if (patch.projectKey !== undefined && !project) fail(`the project "${patch.projectKey}" does not exist`);
        const row = await tx.roadmap.update({
          where: { key },
          data: {
            ...(patch.name ? { nameEn: patch.name.en, nameZh: patch.name.zh } : {}),
            ...(patch.position !== undefined ? { position: patch.position } : {}),
            ...(project ? { projectId: project.id } : {}),
          },
        });
        const { roadmap } = await readRoadmapShape(tx, key);

        return roadmap;
      });
    },

    async deleteRoadmap({ key }) {
      await client.roadmap.delete({ where: { key } });

      return { key };
    },

    async upsertColumn({ roadmapKey, status, label, position }) {
      assertStatus(status);
      assertLocalizedText(label, 'label');

      return client.$transaction(async (tx) => {
        const { roadmapId } = await readRoadmapShape(tx, roadmapKey);
        const row = await tx.roadmapColumn.upsert({
          where: { roadmapId_status: { roadmapId, status } },
          create: {
            roadmapId,
            status,
            labelEn: label.en,
            labelZh: label.zh,
            position: position ?? 10,
          },
          update: {
            labelEn: label.en,
            labelZh: label.zh,
            ...(position !== undefined ? { position } : {}),
          },
        });

        return toColumn(row);
      });
    },

    // 事务不变式：仍有条目引用该列 status 时拒绝删除，不静默挪列。
    async deleteColumn({ roadmapKey, status }) {
      assertStatus(status);

      await client.$transaction(async (tx) => {
        const { roadmapId } = await readRoadmapShape(tx, roadmapKey);
        const referenced = await tx.roadmapEntry.count({ where: { roadmapId, status } });

        if (referenced > 0) {
          fail(`column "${status}" still holds ${referenced} entries; move or delete them first`);
        }

        await tx.roadmapColumn.delete({ where: { roadmapId_status: { roadmapId, status } } });
      });

      return { roadmapKey, status };
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

    // 导入（U5）：人工维护的 JSON 清单批量 upsert。计划阶段全量校验、提交阶段单事务写入，
    // 任何一条失败整体拒绝；只消费传入的清单数据，绝不读取仓库文件（反自动派生红线）。
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

          const order = item.order ?? (await nextPosition(tx, item.roadmapKey));
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
