import { describe, expect, it } from 'vitest';

import type { RoadmapEntry } from '../../domain';
import type { RoadmapBoard, RoadmapEntryPatch, RoadmapWriter } from '../../ports';
import type { RoadmapRouteContext, RoadmapRouteDeps } from '../shared';
import {
  createRoadmapColumnItemRoute,
  createRoadmapColumnsRoute,
  createRoadmapEntryItemRoute,
  createRoadmapEntriesRoute,
  createRoadmapItemRoute,
  createRoadmapsRoute,
} from '../roadmap-routes';

const board: RoadmapBoard = {
  roadmap: {
    key: 'sample-roadmap',
    name: { en: 'Sample Roadmap', zh: '示例路线图' },
    columns: [{ status: 'reviewing', label: { en: 'Backlog', zh: '储备' } }],
  },
  entries: [],
};

const createdEntry: RoadmapEntry = {
  key: 'sample-new',
  roadmap: 'sample-roadmap',
  order: 10,
  status: 'reviewing',
  type: 'feature',
  priority: 'high',
  title: { en: 'New entry', zh: '新条目' },
  summary: { en: 'Summary', zh: '摘要' },
};

function fakeDeps(
  authorized: boolean,
  calls: string[] = [],
  updates: RoadmapEntryPatch[] = [],
): RoadmapRouteDeps {
  const writer: RoadmapWriter = {
    createRoadmap: async (input) => ({ ...board.roadmap, key: input.key, columns: [] }),
    updateRoadmap: async () => board.roadmap,
    deleteRoadmap: async ({ key }) => {
      calls.push('roadmap.delete');
      return { key };
    },
    upsertColumn: async (input) => {
      calls.push('column.upsert');
      return { status: input.status, label: input.label };
    },
    deleteColumn: async (input) => {
      calls.push('column.delete');
      return input;
    },
    createEntry: async (input) => {
      calls.push('entry.create');
      return { ...createdEntry, key: input.key };
    },
    updateEntry: async ({ key, patch }) => {
      calls.push('entry.update');
      updates.push(patch);
      return { ...createdEntry, key };
    },
    deleteEntry: async ({ key }) => {
      calls.push('entry.delete');
      return { key };
    },
  };

  return {
    authorizeOwner: async () => authorized,
    reader: {
      listRoadmaps: async () => [board.roadmap],
      listBoard: async () => board,
    },
    writer,
  };
}

function request(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/internal/roadmap/anything', {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const context = (params: Record<string, string>): RoadmapRouteContext => ({
  params: Promise.resolve(params),
});

const validEntryBody = {
  roadmapKey: 'sample-roadmap',
  key: 'sample-new',
  status: 'reviewing',
  type: 'feature',
  priority: 'high',
  title: { en: 'New entry', zh: '新条目' },
  summary: { en: 'Summary', zh: '摘要' },
};

describe('roadmap route handlers', () => {
  it('returns 404 for every route when the caller is not the owner', async () => {
    const deps = fakeDeps(false);
    const calls: Promise<Response>[] = [
      createRoadmapsRoute(deps).GET(request('GET')),
      createRoadmapsRoute(deps).POST(request('POST', {})),
      createRoadmapItemRoute(deps).PATCH(request('PATCH', {}), context({ key: 'k' })),
      createRoadmapItemRoute(deps).DELETE(request('DELETE'), context({ key: 'k' })),
      createRoadmapColumnsRoute(deps).POST(request('POST', {})),
      createRoadmapColumnItemRoute(deps).PATCH(
        request('PATCH', {}),
        context({ roadmapKey: 'r', status: 'reviewing' }),
      ),
      createRoadmapColumnItemRoute(deps).DELETE(
        request('DELETE'),
        context({ roadmapKey: 'r', status: 'reviewing' }),
      ),
      createRoadmapEntriesRoute(deps).POST(request('POST', {})),
      createRoadmapEntryItemRoute(deps).PATCH(request('PATCH', {}), context({ key: 'k' })),
      createRoadmapEntryItemRoute(deps).DELETE(request('DELETE'), context({ key: 'k' })),
    ];

    for (const pending of calls) {
      const response = await pending;

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Not found.' });
    }
  });

  it('creates an entry for the owner', async () => {
    const calls: string[] = [];
    const response = await createRoadmapEntriesRoute(fakeDeps(true, calls)).POST(
      request('POST', validEntryBody),
    );

    expect(response.status).toBe(201);
    expect(calls).toEqual(['entry.create']);
    const payload = (await response.json()) as { entry: RoadmapEntry };

    expect(payload.entry.key).toBe('sample-new');
  });

  it('rejects an entry body that breaks bilingual parity', async () => {
    const response = await createRoadmapEntriesRoute(fakeDeps(true)).POST(
      request('POST', { ...validEntryBody, title: { en: 'Only', zh: '' } }),
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: string };

    expect(payload.error).toMatch(/both languages/);
  });

  it('parses detail on PATCH: pair passes, explicit null clears, absent is untouched', async () => {
    const updates: RoadmapEntryPatch[] = [];
    const deps = fakeDeps(true, [], updates);

    await createRoadmapEntryItemRoute(deps).PATCH(
      request('PATCH', { detail: { en: 'Detail', zh: '详情' } }),
      context({ key: 'sample-new' }),
    );
    await createRoadmapEntryItemRoute(deps).PATCH(
      request('PATCH', { detail: null }),
      context({ key: 'sample-new' }),
    );
    await createRoadmapEntryItemRoute(deps).PATCH(
      request('PATCH', { title: { en: 'T', zh: '题' } }),
      context({ key: 'sample-new' }),
    );

    expect(updates[0].detail).toEqual({ en: 'Detail', zh: '详情' });
    expect(updates[1].detail).toBeNull();
    expect('detail' in updates[2]).toBe(false);
  });

  it('rejects a detail that breaks bilingual parity', async () => {
    const response = await createRoadmapEntryItemRoute(fakeDeps(true)).PATCH(
      request('PATCH', { detail: { en: 'Only', zh: '' } }),
      context({ key: 'sample-new' }),
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: string };

    expect(payload.error).toMatch(/both languages/);
  });

  it('lists boards for the owner and deletes through the writer', async () => {
    const deps = fakeDeps(true);
    const listResponse = await createRoadmapsRoute(deps).GET(request('GET'));

    expect(listResponse.status).toBe(200);
    expect(((await listResponse.json()) as { boards: RoadmapBoard[] }).boards).toHaveLength(1);

    const calls: string[] = [];
    const deleteResponse = await createRoadmapItemRoute(fakeDeps(true, calls)).DELETE(
      request('DELETE'),
      context({ key: 'sample-roadmap' }),
    );

    expect(deleteResponse.status).toBe(200);
    expect(calls).toEqual(['roadmap.delete']);
  });
});
