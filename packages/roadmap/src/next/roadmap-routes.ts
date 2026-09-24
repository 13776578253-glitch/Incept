import { NextResponse } from 'next/server';

import { ROADMAP_STATUSES } from '../domain';
import type { RoadmapEntryPatch } from '../ports';

import {
  badRequest,
  guardOwner,
  parseEntryPatch,
  parseEnum,
  parseLocalizedText,
  parseOrder,
  readJsonBody,
  type RoadmapRouteContext,
  type RoadmapRouteDeps,
} from './shared';

// 板集合：GET 供管理面板整板读取（列 + 条目），POST 建板。
export function createRoadmapsRoute(deps: RoadmapRouteDeps) {
  async function GET(request: Request) {
    const denied = await guardOwner(request, deps.authorizeOwner);

    if (denied) return denied;

    const roadmaps = await deps.reader.listRoadmaps();
    const boards = [];

    for (const roadmap of roadmaps) {
      const board = await deps.reader.listBoard(roadmap.key);

      if (board) boards.push(board);
    }

    return NextResponse.json({ boards });
  }

  async function POST(request: Request) {
    const denied = await guardOwner(request, deps.authorizeOwner);

    if (denied) return denied;

    const body = await readJsonBody(request);

    if (!body) return badRequest('The request body must be a JSON object.');

    try {
      const key = typeof body.key === 'string' ? body.key.trim() : '';

      if (key === '') {
        return badRequest('"key" must be a non-empty string.');
      }

      const roadmap = await deps.writer.createRoadmap({
        key,
        name: parseLocalizedText(body.name, 'name'),
        position: parseOrder(body.position, 'position'),
      });

      return NextResponse.json({ roadmap }, { status: 201 });
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : 'The roadmap was not created.');
    }
  }

  return { GET, POST };
}

// 单板：PATCH 改名/位次，DELETE 级联删除。
export function createRoadmapItemRoute(deps: RoadmapRouteDeps) {
  async function PATCH(request: Request, context: RoadmapRouteContext) {
    const denied = await guardOwner(request, deps.authorizeOwner);

    if (denied) return denied;

    const { key } = await context.params;
    const body = await readJsonBody(request);

    if (!body) return badRequest('The request body must be a JSON object.');

    try {
      const patch: { name?: ReturnType<typeof parseLocalizedText>; position?: number } = {};

      if (body.name !== undefined) {
        patch.name = parseLocalizedText(body.name, 'name');
      }

      const position = parseOrder(body.position, 'position');

      if (position !== undefined) {
        patch.position = position;
      }

      const roadmap = await deps.writer.updateRoadmap({ key, patch });

      return NextResponse.json({ roadmap });
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : 'The roadmap was not updated.');
    }
  }

  async function DELETE(request: Request, context: RoadmapRouteContext) {
    const denied = await guardOwner(request, deps.authorizeOwner);

    if (denied) return denied;

    const { key } = await context.params;

    try {
      const result = await deps.writer.deleteRoadmap({ key });

      return NextResponse.json(result);
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : 'The roadmap was not deleted.');
    }
  }

  return { PATCH, DELETE };
}

// 列：POST upsert（列身份 = roadmapKey + status，与写端口一致）。
export function createRoadmapColumnsRoute(deps: RoadmapRouteDeps) {
  async function POST(request: Request) {
    const denied = await guardOwner(request, deps.authorizeOwner);

    if (denied) return denied;

    const body = await readJsonBody(request);

    if (!body) return badRequest('The request body must be a JSON object.');

    try {
      const roadmapKey = typeof body.roadmapKey === 'string' ? body.roadmapKey.trim() : '';

      if (roadmapKey === '') {
        return badRequest('"roadmapKey" must be a non-empty string.');
      }

      const column = await deps.writer.upsertColumn({
        roadmapKey,
        status: parseEnum(body.status, ROADMAP_STATUSES, 'status'),
        label: parseLocalizedText(body.label, 'label'),
        position: parseOrder(body.position, 'position'),
      });

      return NextResponse.json({ column }, { status: 201 });
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : 'The column was not saved.');
    }
  }

  return { POST };
}

export function createRoadmapColumnItemRoute(deps: RoadmapRouteDeps) {
  async function PATCH(request: Request, context: RoadmapRouteContext) {
    return handleUpsert(request, context);
  }

  async function DELETE(request: Request, context: RoadmapRouteContext) {
    const denied = await guardOwner(request, deps.authorizeOwner);

    if (denied) return denied;

    const { roadmapKey, status } = await context.params;

    try {
      const result = await deps.writer.deleteColumn({
        roadmapKey,
        status: parseEnum(status, ROADMAP_STATUSES, 'status'),
      });

      return NextResponse.json(result);
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : 'The column was not deleted.');
    }
  }

  async function handleUpsert(request: Request, context: RoadmapRouteContext) {
    const denied = await guardOwner(request, deps.authorizeOwner);

    if (denied) return denied;

    const { roadmapKey, status } = await context.params;
    const body = await readJsonBody(request);

    if (!body) return badRequest('The request body must be a JSON object.');

    try {
      const column = await deps.writer.upsertColumn({
        roadmapKey,
        status: parseEnum(status, ROADMAP_STATUSES, 'status'),
        label: parseLocalizedText(body.label, 'label'),
        position: parseOrder(body.position, 'position'),
      });

      return NextResponse.json({ column });
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : 'The column was not saved.');
    }
  }

  return { PATCH, DELETE };
}

// 条目：POST 新建（links 随体整体写入）。
export function createRoadmapEntriesRoute(deps: RoadmapRouteDeps) {
  async function POST(request: Request) {
    const denied = await guardOwner(request, deps.authorizeOwner);

    if (denied) return denied;

    const body = await readJsonBody(request);

    if (!body) return badRequest('The request body must be a JSON object.');

    try {
      const roadmapKey = typeof body.roadmapKey === 'string' ? body.roadmapKey.trim() : '';
      const key = typeof body.key === 'string' ? body.key.trim() : '';

      if (roadmapKey === '' || key === '') {
        return badRequest('"roadmapKey" and "key" must be non-empty strings.');
      }

      const patch = parseEntryPatch(body);

      if (!patch.status || !patch.type || !patch.priority || !patch.title || !patch.summary) {
        return badRequest(
          '"status", "type", "priority", "title" and "summary" are required when creating an entry.',
        );
      }

      const entry = await deps.writer.createEntry({
        roadmapKey,
        key,
        status: patch.status,
        type: patch.type,
        priority: patch.priority,
        title: patch.title,
        summary: patch.summary,
        order: patch.order,
        links: patch.links ?? [],
      });

      return NextResponse.json({ entry }, { status: 201 });
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : 'The entry was not created.');
    }
  }

  return { POST };
}

export function createRoadmapEntryItemRoute(deps: RoadmapRouteDeps) {
  async function PATCH(request: Request, context: RoadmapRouteContext) {
    const denied = await guardOwner(request, deps.authorizeOwner);

    if (denied) return denied;

    const { key } = await context.params;
    const body = await readJsonBody(request);

    if (!body) return badRequest('The request body must be a JSON object.');

    try {
      const patch: RoadmapEntryPatch = parseEntryPatch(body);
      const entry = await deps.writer.updateEntry({ key, patch });

      return NextResponse.json({ entry });
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : 'The entry was not updated.');
    }
  }

  async function DELETE(request: Request, context: RoadmapRouteContext) {
    const denied = await guardOwner(request, deps.authorizeOwner);

    if (denied) return denied;

    const { key } = await context.params;

    try {
      const result = await deps.writer.deleteEntry({ key });

      return NextResponse.json(result);
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : 'The entry was not deleted.');
    }
  }

  return { PATCH, DELETE };
}
