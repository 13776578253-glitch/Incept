import { describe, expect, it } from 'vitest';

import type { RoadmapEntry } from '../../../domain';
import {
  createPrismaRoadmapWriter,
  type RoadmapPrismaTx,
  type RoadmapPrismaWriteClient,
} from '../roadmap-writer';
import type {
  RoadmapColumnRow,
  RoadmapEntryLinkRow,
  RoadmapEntryRow,
  RoadmapRow,
  RoadmapProjectRow,
  RoadmapWithProject,
} from '../roadmap-repository';

const roadmapRow: RoadmapRow = {
  id: 'rm_1',
  key: 'sample-roadmap',
  nameEn: 'Sample Roadmap',
  nameZh: '示例路线图',
  position: 10,
  projectId: 'project_1',
  createdAt: new Date('2026-09-24T00:00:00Z'),
  updatedAt: new Date('2026-09-24T00:00:00Z'),
};

const projectRow: RoadmapProjectRow = {
  id: 'project_1', key: 'project-one', nameEn: 'Project One', nameZh: '项目一', position: 10, roadmapEnabled: true, atlasEnabled: true,
  createdAt: new Date('2026-09-24T00:00:00Z'), updatedAt: new Date('2026-09-24T00:00:00Z'),
};

const columnRow: RoadmapColumnRow = {
  id: 'col_1',
  roadmapId: 'rm_1',
  status: 'reviewing',
  labelEn: 'Backlog',
  labelZh: '储备',
  position: 10,
};

const entryRow: RoadmapEntryRow = {
  id: 'ent_1',
  roadmapId: 'rm_1',
  key: 'sample-01',
  status: 'reviewing',
  type: 'feature',
  priority: 'middle',
  titleEn: 'Interest-based reply method',
  titleZh: '基于兴趣点的回复策略',
  summaryEn: 'Shape replies around the reader.',
  summaryZh: '围绕读者组织回复。',
  detailEn: null,
  detailZh: null,
  votes: null,
  comments: null,
  position: 10,
  createdAt: new Date('2026-09-24T00:00:00Z'),
  updatedAt: new Date('2026-09-24T00:00:00Z'),
};

type FakeState = {
  entryCountByStatus?: number;
  entryRows?: (RoadmapEntryRow & { links: RoadmapEntryLinkRow[] })[];
  boards?: (RoadmapWithProject & {
    columns: RoadmapColumnRow[];
    entries: (RoadmapEntryRow & { links: RoadmapEntryLinkRow[] })[];
  })[];
  roadmaps?: (RoadmapWithProject & { columns: RoadmapColumnRow[] })[];
  calls?: string[];
  entryWrites?: unknown[];
};

// 假写客户端：$transaction 直接以自身回调执行（不变式断言看 calls 序列）。
function fakeWriteClient(state: FakeState = {}): RoadmapPrismaWriteClient {
  const calls = state.calls ?? [];
  const board = () =>
    state.boards?.[0] ?? { ...roadmapRow, project: projectRow, columns: [columnRow], entries: [] };
  const tx: RoadmapPrismaTx = {
    roadmapProject: {
      findMany: async () => [projectRow],
      findUnique: async () => projectRow,
      create: async (args) => ({ ...projectRow, key: args.data.key, nameEn: args.data.nameEn, nameZh: args.data.nameZh, position: args.data.position, roadmapEnabled: args.data.roadmapEnabled, atlasEnabled: args.data.atlasEnabled }),
      update: async () => projectRow,
      delete: async () => projectRow,
    },
    roadmap: {
      findUnique: async () => board(),
      findMany: async () => state.roadmaps ?? [{ ...roadmapRow, project: projectRow, columns: [columnRow] }],
      count: async () => state.entryCountByStatus ?? 0,
      create: async (args) => ({
        ...roadmapRow,
        project: projectRow,
        projectId: projectRow.id,
        key: args.data.key,
        nameEn: args.data.nameEn,
        nameZh: args.data.nameZh,
        position: args.data.position,
        columns: [],
      }),
      update: async (args) => ({
        ...roadmapRow,
        nameEn: args.data.nameEn ?? roadmapRow.nameEn,
        nameZh: args.data.nameZh ?? roadmapRow.nameZh,
        position: args.data.position ?? roadmapRow.position,
      }),
      delete: async () => roadmapRow,
    },
    roadmapColumn: {
      upsert: async (args) => ({
        ...columnRow,
        status: args.create.status,
        labelEn: args.create.labelEn,
        labelZh: args.create.labelZh,
      }),
      delete: async () => {
        calls.push('column.delete');
        return columnRow;
      },
    },
    roadmapEntry: {
      count: async () => state.entryCountByStatus ?? 0,
      findUnique: async (args) =>
        state.entryRows?.find((row) => row.key === args.where.key) ?? null,
      create: async (args) => {
        calls.push('entry.create');
        (state.entryWrites ??= []).push(args.data);
        return {
          ...entryRow,
          key: args.data.key,
          detailEn: args.data.detailEn,
          detailZh: args.data.detailZh,
          position: args.data.position,
        };
      },
      update: async (args) => {
        calls.push('entry.update');
        (state.entryWrites ??= []).push(args.data);
        return {
          ...entryRow,
          status: args.data.status ?? entryRow.status,
          titleEn: args.data.titleEn ?? entryRow.titleEn,
          titleZh: args.data.titleZh ?? entryRow.titleZh,
          detailEn: args.data.detailEn !== undefined ? args.data.detailEn : entryRow.detailEn,
          detailZh: args.data.detailZh !== undefined ? args.data.detailZh : entryRow.detailZh,
          position: args.data.position ?? entryRow.position,
        };
      },
      delete: async () => {
        calls.push('entry.delete');
        return entryRow;
      },
    },
    roadmapEntryLink: {
      deleteMany: async () => {
        calls.push('links.deleteMany');
        return { count: 0 };
      },
      create: async (args) => {
        calls.push('links.create');
        return {
          id: 'lnk_new',
          entryId: args.data.entryId,
          labelEn: args.data.labelEn,
          labelZh: args.data.labelZh,
          href: args.data.href,
          position: args.data.position,
        };
      },
    },
  };

  return {
    ...tx,
    $transaction: (fn) => fn(tx),
  };
}

const draft: Omit<RoadmapEntry, 'roadmap' | 'order'> & { roadmapKey: string; order?: number } = {
  roadmapKey: 'sample-roadmap',
  key: 'sample-new',
  status: 'reviewing',
  type: 'feature',
  priority: 'high',
  title: { en: 'New entry', zh: '新条目' },
  summary: { en: 'Summary', zh: '摘要' },
};

describe('createPrismaRoadmapWriter', () => {
  it('creates an entry with links inside one transaction', async () => {
    const calls: string[] = [];
    const writer = createPrismaRoadmapWriter(fakeWriteClient({ calls }));

    const entry = await writer.createEntry({
      ...draft,
      links: [{ label: { en: 'Discussion', zh: '讨论' }, href: 'https://example.com' }],
    });

    expect(entry.key).toBe('sample-new');
    expect(entry.links).toHaveLength(1);
    expect(calls).toContain('entry.create');
    expect(calls).toContain('links.deleteMany');
    expect(calls).toContain('links.create');
  });

  it('rejects an entry whose title breaks bilingual parity', async () => {
    const writer = createPrismaRoadmapWriter(fakeWriteClient());

    await expect(
      writer.createEntry({ ...draft, title: { en: 'Only', zh: '' } }),
    ).rejects.toThrow(/both languages/);
  });

  it('rejects an entry status no column maps', async () => {
    const writer = createPrismaRoadmapWriter(fakeWriteClient());

    await expect(writer.createEntry({ ...draft, status: 'completed' })).rejects.toThrow(/no column/);
  });

  it('refuses to delete a column that still holds entries', async () => {
    const calls: string[] = [];
    const writer = createPrismaRoadmapWriter(
      fakeWriteClient({ entryCountByStatus: 2, calls }),
    );

    await expect(
      writer.deleteColumn({ roadmapKey: 'sample-roadmap', status: 'reviewing' }),
    ).rejects.toThrow(/still holds 2 entries/);
    expect(calls).not.toContain('column.delete');
  });

  it('rewrites links on update only when links are provided', async () => {
    const calls: string[] = [];
    const boards = [
      {
        ...roadmapRow,
        project: projectRow,
        columns: [columnRow],
        entries: [{ ...entryRow, links: [] }],
      },
    ];
    const writer = createPrismaRoadmapWriter(fakeWriteClient({ boards, calls }));

    await writer.updateEntry({
      key: 'sample-01',
      patch: { title: { en: 'Renamed', zh: '改名' } },
    });
    expect(calls).not.toContain('links.deleteMany');

    await writer.updateEntry({
      key: 'sample-01',
      patch: { links: [{ label: { en: 'Link', zh: '链接' }, href: 'https://example.com/2' }] },
    });
    expect(calls).toContain('links.deleteMany');
    expect(calls).toContain('links.create');
  });

  it('maps createRoadmap to a bilingual pair without columns', async () => {
    const writer = createPrismaRoadmapWriter(fakeWriteClient());

    const roadmap = await writer.createRoadmap({
      key: 'sample-fresh',
      name: { en: 'Fresh', zh: '新板' },
      projectKey: 'project-one',
    });

    expect(roadmap.key).toBe('sample-fresh');
    expect(roadmap.name).toEqual({ en: 'Fresh', zh: '新板' });
    expect(roadmap.columns).toEqual([]);
  });

  it('persists, clears and preserves detail across the three patch states', async () => {
    const boards = [{ ...roadmapRow, project: projectRow, columns: [columnRow], entries: [{ ...entryRow, links: [] }] }];

    const setWrites: unknown[] = [];
    const setWriter = createPrismaRoadmapWriter(fakeWriteClient({ boards, entryWrites: setWrites }));

    await setWriter.updateEntry({
      key: 'sample-01',
      patch: { detail: { en: 'Detail', zh: '详情' } },
    });
    expect(setWrites[0]).toMatchObject({ detailEn: 'Detail', detailZh: '详情' });

    const clearWrites: unknown[] = [];
    const clearWriter = createPrismaRoadmapWriter(
      fakeWriteClient({ boards, entryWrites: clearWrites }),
    );

    await clearWriter.updateEntry({ key: 'sample-01', patch: { detail: null } });
    expect(clearWrites[0]).toMatchObject({ detailEn: null, detailZh: null });

    const keepWrites: unknown[] = [];
    const keepWriter = createPrismaRoadmapWriter(
      fakeWriteClient({
        boards: [
          {
            ...roadmapRow,
            project: projectRow,
            columns: [columnRow],
            entries: [{ ...entryRow, detailEn: 'Kept', detailZh: '保留', links: [] }],
          },
        ],
        entryWrites: keepWrites,
      }),
    );

    await keepWriter.updateEntry({
      key: 'sample-01',
      patch: { title: { en: 'Renamed', zh: '改名' } },
    });
    expect(keepWrites[0]).toMatchObject({ detailEn: 'Kept', detailZh: '保留' });
  });

  it('derives a slug key when the draft omits one and adds suffixes on collision', async () => {
    const writer = createPrismaRoadmapWriter(fakeWriteClient({ entryWrites: [] }));
    const created = await writer.createEntry({
      roadmapKey: 'sample-roadmap',
      status: 'reviewing',
      type: 'feature',
      priority: 'high',
      title: { en: 'Hello World', zh: '你好' },
      summary: { en: 'S', zh: '摘' },
    });

    expect(created.key).toBe('hello-world');

    const taken = createPrismaRoadmapWriter(
      fakeWriteClient({
        entryWrites: [],
        entryRows: [{ ...entryRow, key: 'hello-world', links: [] }],
      }),
    );
    const second = await taken.createEntry({
      roadmapKey: 'sample-roadmap',
      status: 'reviewing',
      type: 'feature',
      priority: 'high',
      title: { en: 'Hello World', zh: '你好' },
      summary: { en: 'S', zh: '摘' },
    });

    expect(second.key).toBe('hello-world-2');
  });

  it('writes detail as a pair on create and returns ISO timestamps from the row', async () => {
    const entryWrites: unknown[] = [];
    const writer = createPrismaRoadmapWriter(fakeWriteClient({ entryWrites }));

    const entry = await writer.createEntry({
      ...draft,
      detail: { en: 'Detail', zh: '详情' },
    });

    expect(entryWrites[0]).toMatchObject({ detailEn: 'Detail', detailZh: '详情' });
    expect(entry.createdAt).toBe('2026-09-24T00:00:00.000Z');
    expect(entry.updatedAt).toBe('2026-09-24T00:00:00.000Z');
  });

  it('auto-scaffolds default roadmap and planning boards with columns on project creation', async () => {
    const createdRoadmaps: unknown[] = [];
    const createdColumns: unknown[] = [];
    const txClient = fakeWriteClient();
    txClient.roadmap.create = async (args) => {
      createdRoadmaps.push(args.data);
      return { ...roadmapRow, project: projectRow, key: args.data.key, nameEn: args.data.nameEn, nameZh: args.data.nameZh, position: args.data.position, columns: [] };
    };
    txClient.roadmapColumn.upsert = async (args) => {
      createdColumns.push(args.create);
      return { ...columnRow, status: args.create.status };
    };

    const writer = createPrismaRoadmapWriter(txClient);
    const project = await writer.createProject({
      key: 'fresh-project',
      name: { en: 'Fresh Project', zh: '新项目' },
    });

    expect(project.key).toBe('fresh-project');
    expect(project.roadmapEnabled).toBe(true);
    expect(project.atlasEnabled).toBe(true);
    expect(createdRoadmaps).toHaveLength(2);
    expect(createdRoadmaps[0]).toMatchObject({ key: 'fresh-project-roadmap', nameEn: 'Roadmap', nameZh: '路线图' });
    expect(createdRoadmaps[1]).toMatchObject({ key: 'fresh-project-atlas', nameEn: 'Planning Board', nameZh: '规划图' });
    expect(createdColumns).toHaveLength(7);
  });

  it('imports entries as an all-or-nothing append batch and rejects existing keys', async () => {
    const entryWrites: unknown[] = [];
    const calls: string[] = [];
    const writer = createPrismaRoadmapWriter(
      fakeWriteClient({
        entryWrites,
        calls,
      }),
    );

    const results = await writer.importEntries({
      entries: [
        {
          roadmapKey: 'sample-roadmap',
          key: 'new-key-1',
          status: 'reviewing',
          type: 'feature',
          priority: 'middle',
          title: { en: 'Appended One', zh: '追加一' },
          summary: { en: 'S', zh: '摘' },
          links: [{ label: { en: 'L', zh: '链接' }, href: 'https://example.com/i' }],
        },
        {
          roadmapKey: 'sample-roadmap',
          status: 'reviewing',
          type: 'feature',
          priority: 'middle',
          title: { en: 'Brand New', zh: '全新' },
          summary: { en: 'S', zh: '摘' },
        },
      ],
    });

    expect(results.map((entry) => entry.key)).toEqual(['new-key-1', 'brand-new']);
    expect(calls).not.toContain('entry.update');
    expect(calls).toContain('entry.create');
    expect(calls).toContain('links.create');

    const conflictWriter = createPrismaRoadmapWriter(
      fakeWriteClient({
        entryRows: [{ ...entryRow, key: 'existing-key', links: [] }],
      }),
    );

    await expect(
      conflictWriter.importEntries({
        entries: [
          {
            roadmapKey: 'sample-roadmap',
            key: 'existing-key',
            status: 'reviewing',
            type: 'feature',
            priority: 'middle',
            title: { en: 'Conflict', zh: '冲突' },
            summary: { en: 'S', zh: '摘' },
          },
        ],
      }),
    ).rejects.toThrow(/already exists; import only appends new entries and does not overwrite/);

    const badWrites: unknown[] = [];
    const badCalls: string[] = [];
    const badWriter = createPrismaRoadmapWriter(
      fakeWriteClient({ entryWrites: badWrites, calls: badCalls }),
    );

    await expect(
      badWriter.importEntries({
        entries: [
          {
            roadmapKey: 'sample-roadmap',
            status: 'reviewing',
            type: 'feature',
            priority: 'middle',
            title: { en: 'Fine', zh: '好' },
            summary: { en: 'S', zh: '摘' },
          },
          {
            roadmapKey: 'sample-roadmap',
            status: 'reviewing',
            type: 'feature',
            priority: 'middle',
            title: { en: 'Broken', zh: '' },
            summary: { en: 'S', zh: '摘' },
          },
        ],
      }),
    ).rejects.toThrow(/both languages/);
    expect(badWrites).toEqual([]);
    expect(badCalls).not.toContain('entry.create');
  });

  it('hands distinct incrementing positions to same-batch entries without explicit order', async () => {
    const entryWrites: unknown[] = [];
    const writer = createPrismaRoadmapWriter(fakeWriteClient({ entryWrites }));

    const item = (key: string, order?: number) => ({
      roadmapKey: 'sample-roadmap',
      key,
      status: 'reviewing' as const,
      type: 'feature' as const,
      priority: 'middle' as const,
      title: { en: key, zh: key },
      summary: { en: 'S', zh: '摘' },
      ...(order !== undefined ? { order } : {}),
    });

    const results = await writer.importEntries({
      entries: [item('auto-1'), item('auto-2'), item('explicit-3', 50), item('auto-4')],
    });

    expect(results.map((entry) => entry.order)).toEqual([10, 20, 50, 60]);
    expect(entryWrites.map((write) => (write as { position: number }).position)).toEqual([
      10, 20, 50, 60,
    ]);
  });

  it('rejects an empty manifest and repeated keys', async () => {
    const writer = createPrismaRoadmapWriter(fakeWriteClient());

    await expect(writer.importEntries({ entries: [] })).rejects.toThrow(/no entries/);

    const repeat = createPrismaRoadmapWriter(fakeWriteClient());

    await expect(
      repeat.importEntries({
        entries: [
          {
            roadmapKey: 'sample-roadmap',
            key: 'same',
            status: 'reviewing',
            type: 'feature',
            priority: 'middle',
            title: { en: 'A', zh: '甲' },
            summary: { en: 'S', zh: '摘' },
          },
          {
            roadmapKey: 'sample-roadmap',
            key: 'same',
            status: 'reviewing',
            type: 'feature',
            priority: 'middle',
            title: { en: 'B', zh: '乙' },
            summary: { en: 'S', zh: '摘' },
          },
        ],
      }),
    ).rejects.toThrow(/repeats the key/);
  });
});
