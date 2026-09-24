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
} from '../roadmap-repository';

const roadmapRow: RoadmapRow = {
  id: 'rm_1',
  key: 'sample-roadmap',
  nameEn: 'Sample Roadmap',
  nameZh: '示例路线图',
  position: 10,
  createdAt: new Date('2026-09-24T00:00:00Z'),
  updatedAt: new Date('2026-09-24T00:00:00Z'),
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
  votes: null,
  comments: null,
  position: 10,
  createdAt: new Date('2026-09-24T00:00:00Z'),
  updatedAt: new Date('2026-09-24T00:00:00Z'),
};

type FakeState = {
  entryCountByStatus?: number;
  entryRows?: (RoadmapEntryRow & { links: RoadmapEntryLinkRow[] })[];
  boards?: (RoadmapRow & {
    columns: RoadmapColumnRow[];
    entries: (RoadmapEntryRow & { links: RoadmapEntryLinkRow[] })[];
  })[];
  roadmaps?: (RoadmapRow & { columns: RoadmapColumnRow[] })[];
  calls?: string[];
};

// 假写客户端：$transaction 直接以自身回调执行（不变式断言看 calls 序列）。
function fakeWriteClient(state: FakeState = {}): RoadmapPrismaWriteClient {
  const calls = state.calls ?? [];
  const board = () =>
    state.boards?.[0] ?? { ...roadmapRow, columns: [columnRow], entries: [] };
  const tx: RoadmapPrismaTx = {
    roadmap: {
      findUnique: async () => board(),
      findMany: async () => state.roadmaps ?? [{ ...roadmapRow, columns: [columnRow] }],
      create: async (args) => ({
        ...roadmapRow,
        key: args.data.key,
        nameEn: args.data.nameEn,
        nameZh: args.data.nameZh,
        position: args.data.position,
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
      create: async (args) => {
        calls.push('entry.create');
        return { ...entryRow, key: args.data.key, position: args.data.position };
      },
      update: async (args) => {
        calls.push('entry.update');
        return {
          ...entryRow,
          status: args.data.status ?? entryRow.status,
          titleEn: args.data.titleEn ?? entryRow.titleEn,
          titleZh: args.data.titleZh ?? entryRow.titleZh,
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
    });

    expect(roadmap.key).toBe('sample-fresh');
    expect(roadmap.name).toEqual({ en: 'Fresh', zh: '新板' });
    expect(roadmap.columns).toEqual([]);
  });
});
