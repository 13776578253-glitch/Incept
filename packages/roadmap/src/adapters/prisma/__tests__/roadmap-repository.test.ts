import { describe, expect, it } from 'vitest';

import {
  createPrismaRoadmapRepository,
  toEntry,
  type RoadmapColumnRow,
  type RoadmapEntryRow,
  type RoadmapEntryLinkRow,
  type RoadmapProjectRow,
  type RoadmapWithChildren,
  type RoadmapWithColumns,
} from '../roadmap-repository';

const baseRow = {
  id: 'rm_1',
  key: 'sample-roadmap',
  nameEn: 'Sample Roadmap',
  nameZh: '示例路线图',
  position: 10,
  projectId: 'project_1',
  createdAt: new Date('2026-09-23T00:00:00Z'),
  updatedAt: new Date('2026-09-23T00:00:00Z'),
};

const projectRow: RoadmapProjectRow = {
  id: 'project_1', key: 'project-one', nameEn: 'Project One', nameZh: '项目一', position: 10,
  createdAt: new Date('2026-09-23T00:00:00Z'), updatedAt: new Date('2026-09-23T00:00:00Z'),
};

const columnRow: RoadmapColumnRow = {
  id: 'col_1',
  roadmapId: 'rm_1',
  status: 'reviewing',
  labelEn: 'Backlog',
  labelZh: '储备',
  position: 10,
};

const entryRow: RoadmapEntryRow & { links: RoadmapEntryLinkRow[] } = {
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
  votes: 293,
  comments: null,
  position: 10,
  createdAt: new Date('2026-09-23T00:00:00Z'),
  updatedAt: new Date('2026-09-23T00:00:00Z'),
  links: [],
};

function fakeClient(options: {
  roadmaps?: RoadmapWithColumns[];
  board?: RoadmapWithChildren | null;
}) {
  return {
    roadmapProject: {
      findMany: async () => [projectRow],
      findUnique: async () => projectRow,
    },
    roadmap: {
      findMany: async () => options.roadmaps ?? [],
      findUnique: async () => options.board ?? null,
    },
  };
}

describe('createPrismaRoadmapRepository', () => {
  it('maps roadmap rows to bilingual pairs and orders by position', async () => {
    const repository = createPrismaRoadmapRepository(
      fakeClient({
        roadmaps: [
          { ...baseRow, project: projectRow, columns: [{ ...columnRow, position: 20 }, { ...columnRow, id: 'col_0', status: 'active', position: 10 }] },
          {
            ...baseRow,
            id: 'rm_2',
            key: 'sample-atlas',
            nameEn: 'Sample Atlas Board',
            nameZh: '示例图谱板',
            position: 20,
            projectId: 'project_2',
            project: { ...projectRow, id: 'project_2', key: 'project-two', nameEn: 'Project Two', nameZh: '项目二' },
            columns: [{ ...columnRow, id: 'col_2', status: 'completed', labelEn: 'Shipped', labelZh: '已发布' }],
          },
        ],
      }),
    );

    const roadmaps = await repository.listRoadmaps();

    expect(roadmaps.map((roadmap) => roadmap.key)).toEqual(['sample-roadmap', 'sample-atlas']);
    expect(roadmaps[0].name).toEqual({ en: 'Sample Roadmap', zh: '示例路线图' });
    expect(roadmaps[0].project).toEqual({ key: 'project-one', name: { en: 'Project One', zh: '项目一' } });
    expect(roadmaps[0].columns.map((column) => column.status)).toEqual(['active', 'reviewing']);
  });

  it('maps a board with entries: position becomes order and links sort by position', async () => {
    const repository = createPrismaRoadmapRepository(
      fakeClient({
        board: {
          ...baseRow,
          project: projectRow,
          columns: [columnRow],
          entries: [
            {
              ...entryRow,
              key: 'sample-02',
              position: 20,
              votes: null,
              comments: null,
              links: [
                {
                  id: 'lnk_2',
                  entryId: 'ent_1',
                  labelEn: 'Second',
                  labelZh: '第二',
                  href: 'https://example.com/2',
                  position: 20,
                },
                {
                  id: 'lnk_1',
                  entryId: 'ent_1',
                  labelEn: 'First',
                  labelZh: '第一',
                  href: 'https://example.com/1',
                  position: 10,
                },
              ],
            },
            { ...entryRow, position: 10 },
          ],
        },
      }),
    );

    const board = await repository.listBoard('sample-roadmap');

    expect(board).not.toBeNull();
    expect(board?.entries.map((entry) => entry.key)).toEqual(['sample-01', 'sample-02']);
    expect(board?.entries[0].roadmap).toBe('sample-roadmap');
    expect(board?.entries[0].order).toBe(10);
    expect(board?.entries[1].links?.map((link) => link.href)).toEqual([
      'https://example.com/1',
      'https://example.com/2',
    ]);
  });

  it('returns null for an unknown roadmap key', async () => {
    const repository = createPrismaRoadmapRepository(fakeClient({}));

    expect(await repository.listBoard('missing')).toBeNull();
  });

  it('hides roadmaps without a project and returns null for their board', async () => {
    const repository = createPrismaRoadmapRepository(fakeClient({
      roadmaps: [{ ...baseRow, project: null, columns: [columnRow] }],
      board: { ...baseRow, project: null, columns: [columnRow], entries: [] },
    }));
    expect(await repository.listRoadmaps()).toEqual([]);
    expect(await repository.listBoard(baseRow.key)).toBeNull();
  });

  it('rejects rows that break bilingual parity', async () => {
    const repository = createPrismaRoadmapRepository(
      fakeClient({
        board: {
          ...baseRow,
          project: projectRow,
          columns: [{ ...columnRow, labelZh: '   ' }],
          entries: [],
        },
      }),
    );

    await expect(repository.listBoard('sample-roadmap')).rejects.toThrow(/both languages/);
  });

  it('rejects rows with an unknown status or priority', async () => {
    const statusRepository = createPrismaRoadmapRepository(
      fakeClient({ board: { ...baseRow, project: projectRow, columns: [{ ...columnRow, status: 'shipped' }], entries: [] } }),
    );
    await expect(statusRepository.listBoard('sample-roadmap')).rejects.toThrow(/unknown status/);

    const priorityRepository = createPrismaRoadmapRepository(
      fakeClient({
        board: { ...baseRow, project: projectRow, columns: [columnRow], entries: [{ ...entryRow, priority: 'urgent' }] },
      }),
    );
    await expect(priorityRepository.listBoard('sample-roadmap')).rejects.toThrow(/unknown priority/);
  });

  it('maps detail as a pair, omits it when both columns are null, and stamps ISO timestamps', () => {
    const withDetail = toEntry(
      { ...entryRow, detailEn: 'Detail', detailZh: '详情' },
      'sample-roadmap',
    );
    const withoutDetail = toEntry(entryRow, 'sample-roadmap');
    const halfPair = toEntry({ ...entryRow, detailEn: 'D', detailZh: null }, 'sample-roadmap');

    expect(withDetail.detail).toEqual({ en: 'Detail', zh: '详情' });
    expect(withoutDetail.detail).toBeUndefined();
    expect(halfPair.detail).toEqual({ en: 'D', zh: '' });
    expect(withDetail.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(withDetail.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
