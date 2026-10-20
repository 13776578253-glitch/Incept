import { NextResponse } from 'next/server';

import type { RoadmapEntryPatch } from '../ports';

import {
  badRequest,
  guardOwner,
  parseEntryPatch,
  parseBoolean,
  parseLocalizedText,
  parseOrder,
  readJsonBody,
  type RoadmapRouteContext,
  type RoadmapRouteDeps,
  parseImportManifest,
} from './shared';

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

// 批量导入条目路由：单事务批量追加人工维护的 JSON 清单。仅解析请求体，绝不自动派生本地文件。
// history: 增加当前上下文（projectKey/surface/roadmapKey）校验与自动绑定，字段不匹配或表面禁用时直接阻断。
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
