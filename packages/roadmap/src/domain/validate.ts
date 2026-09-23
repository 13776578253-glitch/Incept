import {
  ROADMAP_ENTRY_PRIORITIES,
  ROADMAP_ENTRY_TYPES,
  ROADMAP_STATUSES,
  type LocalizedText,
  type Roadmap,
  type RoadmapEntry,
} from './types';

// 校验即拒：成对语言缺一/空串、枚举越界、列与条目结构不合法。纯规则，无 IO。

function fail(path: string, reason: string): never {
  throw new Error(`roadmap domain invalid at ${path}: ${reason}`);
}

export function assertLocalizedText(value: LocalizedText, path: string): void {
  if (!value || typeof value !== 'object') {
    fail(path, 'expected an { en, zh } pair');
  }

  for (const locale of ['en', 'zh'] as const) {
    const text = value[locale];

    if (typeof text !== 'string' || text.trim() === '') {
      fail(`${path}.${locale}`, 'every text carries both languages; a missing half is rejected');
    }
  }
}

export function validateRoadmap(roadmap: Roadmap): void {
  if (typeof roadmap.key !== 'string' || roadmap.key.trim() === '') {
    fail('roadmap.key', 'expected a non-empty string');
  }

  assertLocalizedText(roadmap.name, 'roadmap.name');

  if (!Array.isArray(roadmap.columns) || roadmap.columns.length === 0) {
    fail('roadmap.columns', 'a roadmap declares at least one column');
  }

  const seen = new Set<string>();

  for (const [index, column] of roadmap.columns.entries()) {
    if (!ROADMAP_STATUSES.includes(column.status)) {
      fail(`roadmap.columns[${index}].status`, `unknown status "${String(column.status)}"`);
    }

    if (seen.has(column.status)) {
      fail(`roadmap.columns[${index}].status`, `status "${column.status}" is mapped twice`);
    }

    seen.add(column.status);
    assertLocalizedText(column.label, `roadmap.columns[${index}].label`);
  }
}

export function validateEntry(entry: RoadmapEntry, roadmap: Roadmap): void {
  if (typeof entry.key !== 'string' || entry.key.trim() === '') {
    fail('entry.key', 'expected a non-empty string');
  }

  if (entry.roadmap !== roadmap.key) {
    fail(
      'entry.roadmap',
      `entry belongs to "${entry.roadmap}" but was validated against "${roadmap.key}"`,
    );
  }

  if (!Number.isFinite(entry.order)) {
    fail('entry.order', 'expected a finite number');
  }

  if (!ROADMAP_STATUSES.includes(entry.status)) {
    fail('entry.status', `unknown status "${String(entry.status)}"`);
  }

  if (!roadmap.columns.some((column) => column.status === entry.status)) {
    fail('entry.status', `roadmap "${roadmap.key}" has no column for "${entry.status}"`);
  }

  if (!ROADMAP_ENTRY_TYPES.includes(entry.type)) {
    fail('entry.type', `unknown type "${String(entry.type)}"`);
  }

  if (!ROADMAP_ENTRY_PRIORITIES.includes(entry.priority)) {
    fail('entry.priority', `unknown priority "${String(entry.priority)}"`);
  }

  assertLocalizedText(entry.title, 'entry.title');
  assertLocalizedText(entry.summary, 'entry.summary');

  if (entry.metrics) {
    for (const metric of ['votes', 'comments'] as const) {
      const value = entry.metrics[metric];

      if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
        fail(`entry.metrics.${metric}`, 'expected a non-negative integer when present');
      }
    }
  }

  for (const [index, link] of (entry.links ?? []).entries()) {
    assertLocalizedText(link.label, `entry.links[${index}].label`);

    if (typeof link.href !== 'string' || link.href.trim() === '') {
      fail(`entry.links[${index}].href`, 'expected a non-empty string');
    }
  }
}

export function validateBoard(roadmap: Roadmap, entries: readonly RoadmapEntry[]): void {
  validateRoadmap(roadmap);

  const keys = new Set<string>();

  for (const entry of entries) {
    if (keys.has(entry.key)) {
      fail('entry.key', `duplicate entry key "${entry.key}"`);
    }

    keys.add(entry.key);
    validateEntry(entry, roadmap);
  }
}
