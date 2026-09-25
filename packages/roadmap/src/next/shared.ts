import { NextResponse } from 'next/server';

import type {
  LocalizedText,
  RoadmapEntryPriority,
  RoadmapEntryType,
  RoadmapStatus,
} from '../domain';
import { ROADMAP_STATUSES } from '../domain';
import type {
  AuthorizeOwner,
  RoadmapBoard,
  RoadmapEntryPatch,
  RoadmapRepository,
  RoadmapWriter,
} from '../ports';

// 路由工厂的依赖注入（music 决策 6/10 同形）：门禁、读端口、写端口由宿主装配提供。
export type RoadmapRouteDeps = {
  authorizeOwner: AuthorizeOwner<Request>;
  reader: Pick<RoadmapRepository, 'listRoadmaps' | 'listBoard'>;
  writer: RoadmapWriter;
};

export type RoadmapRouteContext = {
  params: Promise<Record<string, string>>;
};

// 非 owner 一律 404，不暴露存在性（music 语义原样）。
export async function guardOwner(
  request: Request,
  authorizeOwner: AuthorizeOwner<Request>,
): Promise<NextResponse | null> {
  if (await authorizeOwner(request)) {
    return null;
  }

  return NextResponse.json({ error: 'Not found.' }, { status: 404 });
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();

    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function parseLocalizedText(value: unknown, field: string): LocalizedText {
  if (!value || typeof value !== 'object') {
    throw new Error(`"${field}" must carry both languages; a missing half is rejected.`);
  }

  const pair = value as Partial<LocalizedText>;

  if (
    typeof pair.en !== 'string' ||
    typeof pair.zh !== 'string' ||
    pair.en.trim() === '' ||
    pair.zh.trim() === ''
  ) {
    throw new Error(`"${field}" must carry both languages; a missing half is rejected.`);
  }

  return { en: pair.en, zh: pair.zh };
}

export function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`"${field}" must be one of: ${allowed.join(', ')}.`);
  }

  return value as T;
}

export function parseOrder(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`"${field}" must be a finite number.`);
  }

  return value;
}

export function parseLinks(value: unknown): { label: LocalizedText; href: string }[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error('"links" must be a list.');
  }

  return value.map((item, index) => {
    const link = (item ?? {}) as Record<string, unknown>;

    if (typeof link.href !== 'string' || link.href.trim() === '') {
      throw new Error(`"links[${index}].href" must be a non-empty string.`);
    }

    return { label: parseLocalizedText(link.label, `links[${index}].label`), href: link.href };
  });
}

export function parseEntryPatch(body: Record<string, unknown>): RoadmapEntryPatch {
  const patch: RoadmapEntryPatch = {};

  if (body.status !== undefined) {
    patch.status = parseEnum(body.status, ROADMAP_STATUSES, 'status') as RoadmapStatus;
  }
  if (body.type !== undefined) {
    patch.type = parseEnum(
      body.type,
      ['feature', 'improvement', 'maintenance'] as const,
      'type',
    ) as RoadmapEntryType;
  }
  if (body.priority !== undefined) {
    patch.priority = parseEnum(
      body.priority,
      ['high', 'middle', 'low', 'none'] as const,
      'priority',
    ) as RoadmapEntryPriority;
  }
  if (body.title !== undefined) {
    patch.title = parseLocalizedText(body.title, 'title');
  }
  if (body.summary !== undefined) {
    patch.summary = parseLocalizedText(body.summary, 'summary');
  }

  const order = parseOrder(body.order, 'order');

  if (order !== undefined) {
    patch.order = order;
  }

  if (body.detail !== undefined) {
    patch.detail = body.detail === null ? null : parseLocalizedText(body.detail, 'detail');
  }

  patch.links = parseLinks(body.links);

  return patch;
}

export type { RoadmapBoard };
