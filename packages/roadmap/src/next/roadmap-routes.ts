import { NextResponse } from 'next/server';

import { ROADMAP_STATUSES } from '../domain';
import type { RoadmapEntryPatch } from '../ports';

import {
  badRequest,
  guardOwner,
  parseEntryPatch,
  parseBoolean,
  parseEnum,
  parseLocalizedText,
  parseOrder,
  readJsonBody,
  type RoadmapRouteContext,
  type RoadmapRouteDeps,
  parseImportManifest,
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
      const projectKey = typeof body.projectKey === 'string' ? body.projectKey.trim() : '';

      if (key === '') {
        return badRequest('"key" must be a non-empty string.');
      }
      if (projectKey === '') return badRequest('"projectKey" must be a non-empty string.');

      const roadmap = await deps.writer.createRoadmap({
        key,
        name: parseLocalizedText(body.name, 'name'),
        projectKey,
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
      const patch: { name?: ReturnType<typeof parseLocalizedText>; position?: number; projectKey?: string } = {};

      if (body.name !== undefined) {
        patch.name = parseLocalizedText(body.name, 'name');
      }

      const position = parseOrder(body.position, 'position');

      if (position !== undefined) {
        patch.position = position;
      }
      if (body.projectKey !== undefined) {
        if (typeof body.projectKey !== 'string' || body.projectKey.trim() === '') return badRequest('"projectKey" must be a non-empty string.');
        patch.projectKey = body.projectKey.trim();
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

export function createRoadmapProjectsRoute(deps: RoadmapRouteDeps) {
  async function GET(request: Request) {
    const denied = await guardOwner(request, deps.authorizeOwner);
    if (denied) return denied;
    return NextResponse.json({ projects: await deps.reader.listProjects() });
  }

  async function POST(request: Request) {
    const denied = await guardOwner(request, deps.authorizeOwner);
    if (denied) return denied;
    const body = await readJsonBody(request);
    if (!body) return badRequest('The request body must be a JSON object.');
    try {
      const key = typeof body.key === 'string' ? body.key.trim() : '';
      if (!key) return badRequest('"key" must be a non-empty string.');
      const project = await deps.writer.createProject({
        key,
        name: parseLocalizedText(body.name, 'name'),
        position: parseOrder(body.position, 'position'),
        ...(body.roadmapEnabled !== undefined ? { roadmapEnabled: parseBoolean(body.roadmapEnabled, 'roadmapEnabled') } : {}),
        ...(body.atlasEnabled !== undefined ? { atlasEnabled: parseBoolean(body.atlasEnabled, 'atlasEnabled') } : {}),
      });
      return NextResponse.json({ project }, { status: 201 });
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : 'The project was not created.');
    }
  }
  return { GET, POST };
}

export function createRoadmapProjectItemRoute(deps: RoadmapRouteDeps) {
  async function PATCH(request: Request, context: RoadmapRouteContext) {
    const denied = await guardOwner(request, deps.authorizeOwner);
    if (denied) return denied;
    const { key } = await context.params;
    const body = await readJsonBody(request);
    if (!body) return badRequest('The request body must be a JSON object.');
    try {
      const patch: { name?: ReturnType<typeof parseLocalizedText>; position?: number; roadmapEnabled?: boolean; atlasEnabled?: boolean } = {};
      if (body.name !== undefined) patch.name = parseLocalizedText(body.name, 'name');
      const position = parseOrder(body.position, 'position');
      if (position !== undefined) patch.position = position;
      if (body.roadmapEnabled !== undefined) patch.roadmapEnabled = parseBoolean(body.roadmapEnabled, 'roadmapEnabled');
      if (body.atlasEnabled !== undefined) patch.atlasEnabled = parseBoolean(body.atlasEnabled, 'atlasEnabled');
      if (!patch.name && patch.position === undefined && patch.roadmapEnabled === undefined && patch.atlasEnabled === undefined) return badRequest('The project update has no fields.');
      return NextResponse.json({ project: await deps.writer.updateProject({ key, patch }) });
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : 'The project was not updated.');
    }
  }
  async function DELETE(request: Request, context: RoadmapRouteContext) {
    const denied = await guardOwner(request, deps.authorizeOwner);
    if (denied) return denied;
    const { key } = await context.params;
    try {
      return NextResponse.json(await deps.writer.deleteProject({ key }));
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : 'The project was not deleted.');
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
      const rawKey = typeof body.key === 'string' ? body.key.trim() : '';

      if (roadmapKey === '') {
        return badRequest('"roadmapKey" must be a non-empty string.');
      }

      if (body.key !== undefined && rawKey === '') {
        return badRequest('"key" must be a non-empty string when provided.');
      }

      const patch = parseEntryPatch(body);

      if (!patch.status || !patch.type || !patch.priority || !patch.title || !patch.summary) {
        return badRequest(
          '"status", "type", "priority", "title" and "summary" are required when creating an entry.',
        );
      }

      const entry = await deps.writer.createEntry({
        roadmapKey,
        key: rawKey === '' ? undefined : rawKey,
        status: patch.status,
        type: patch.type,
        priority: patch.priority,
        title: patch.title,
        summary: patch.summary,
        detail: patch.detail ?? undefined,
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

// 导入（U5）：POST 批量 upsert 人工维护的 JSON 清单（仅条目）。反自动派生红线：本路由只解析
// 请求体，绝不读取或解析 docs/NEXT.md、docs/BACKLOG.md、docs/finish-task/（决策第 1 条原文）。
export function createRoadmapImportRoute(deps: RoadmapRouteDeps) {
  async function POST(request: Request) {
    const denied = await guardOwner(request, deps.authorizeOwner);

    if (denied) return denied;

    const body = await readJsonBody(request);

    if (!body) return badRequest('The request body must be a JSON object.');

    try {
      const url = new URL(request.url);
      const queryProjectKey = url.searchParams.get('projectKey')?.trim() || undefined;
      const querySurface = (url.searchParams.get('surface')?.trim() as 'roadmap' | 'atlas' | undefined) || undefined;
      const queryRoadmapKey = url.searchParams.get('roadmapKey')?.trim() || undefined;

      if (queryProjectKey) {
        const projects = await deps.reader.listProjects();
        const project = projects.find((item) => item.key === queryProjectKey);
        if (!project) {
          return badRequest(`Project "${queryProjectKey}" does not exist.`);
        }
        if (querySurface === 'roadmap' && !project.roadmapEnabled) {
          return badRequest(`Roadmap surface is disabled for project "${queryProjectKey}".`);
        }
        if (querySurface === 'atlas' && !project.atlasEnabled) {
          return badRequest(`Planning board surface is disabled for project "${queryProjectKey}".`);
        }
      }

      if (queryRoadmapKey) {
        const roadmaps = await deps.reader.listRoadmaps();
        const targetRoadmap = roadmaps.find((item) => item.key === queryRoadmapKey);
        if (!targetRoadmap) {
          return badRequest(`Roadmap "${queryRoadmapKey}" does not exist.`);
        }
        if (queryProjectKey && targetRoadmap.project.key !== queryProjectKey) {
          return badRequest(`Roadmap "${queryRoadmapKey}" does not belong to project "${queryProjectKey}".`);
        }
      }

      const manifest = parseImportManifest(body, {
        projectKey: queryProjectKey,
        surface: querySurface,
        roadmapKey: queryRoadmapKey,
      });
      const entries = await deps.writer.importEntries(manifest);

      return NextResponse.json({ entries });
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : 'The manifest was not imported.');
    }
  }

  return { POST };
}
