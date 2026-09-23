import { describe, expect, it } from 'vitest';

import type { Roadmap, RoadmapEntry } from '../types';
import { validateBoard, validateEntry, validateRoadmap } from '../validate';

const roadmap: Roadmap = {
  key: 'sample',
  name: { en: 'Sample', zh: '示例' },
  columns: [
    { status: 'unstarted', label: { en: 'Next', zh: '接下来' } },
    { status: 'active', label: { en: 'Now', zh: '进行中' } },
  ],
};

const entry: RoadmapEntry = {
  key: 'e-1',
  roadmap: 'sample',
  order: 10,
  status: 'unstarted',
  type: 'feature',
  priority: 'middle',
  title: { en: 'Title', zh: '标题' },
  summary: { en: 'Summary', zh: '摘要' },
};

describe('validateRoadmap', () => {
  it('accepts a valid roadmap', () => {
    expect(() => validateRoadmap(roadmap)).not.toThrow();
  });

  it('rejects a roadmap without columns', () => {
    expect(() => validateRoadmap({ ...roadmap, columns: [] })).toThrow(/at least one column/);
  });

  it('rejects a column whose status is mapped twice', () => {
    expect(() =>
      validateRoadmap({
        ...roadmap,
        columns: [...roadmap.columns, { status: 'active', label: { en: 'Again', zh: '再来' } }],
      }),
    ).toThrow(/mapped twice/);
  });

  it('rejects a name missing its zh half', () => {
    expect(() => validateRoadmap({ ...roadmap, name: { en: 'Sample', zh: '' } })).toThrow(
      /both languages/,
    );
  });
});

describe('validateEntry', () => {
  it('accepts a valid entry', () => {
    expect(() => validateEntry(entry, roadmap)).not.toThrow();
  });

  it('rejects a title missing its zh half', () => {
    expect(() => validateEntry({ ...entry, title: { en: 'Title', zh: '   ' } }, roadmap)).toThrow(
      /both languages/,
    );
  });

  it('rejects an unknown status', () => {
    expect(() =>
      validateEntry({ ...entry, status: 'shipped' as never }, roadmap),
    ).toThrow(/unknown status/);
  });

  it('rejects a status no column maps', () => {
    expect(() => validateEntry({ ...entry, status: 'completed' }, roadmap)).toThrow(/no column/);
  });

  it('rejects an entry that belongs to another roadmap', () => {
    expect(() => validateEntry({ ...entry, roadmap: 'other' }, roadmap)).toThrow(
      /validated against/,
    );
  });

  it('rejects an unknown type or priority', () => {
    expect(() => validateEntry({ ...entry, type: 'bug' as never }, roadmap)).toThrow(
      /unknown type/,
    );
    expect(() => validateEntry({ ...entry, priority: 'urgent' as never }, roadmap)).toThrow(
      /unknown priority/,
    );
  });

  it('rejects negative or fractional metrics', () => {
    expect(() => validateEntry({ ...entry, metrics: { votes: -1 } }, roadmap)).toThrow(
      /non-negative integer/,
    );
    expect(() => validateEntry({ ...entry, metrics: { comments: 1.5 } }, roadmap)).toThrow(
      /non-negative integer/,
    );
    expect(() => validateEntry({ ...entry, metrics: {} }, roadmap)).not.toThrow();
  });

  it('rejects a link missing its label half or href', () => {
    expect(() =>
      validateEntry({ ...entry, links: [{ label: { en: 'Link', zh: '' }, href: 'https://x' }] }, roadmap),
    ).toThrow(/both languages/);
    expect(() =>
      validateEntry({ ...entry, links: [{ label: { en: 'Link', zh: '链接' }, href: ' ' }] }, roadmap),
    ).toThrow(/non-empty string/);
  });
});

describe('validateBoard', () => {
  it('rejects duplicate entry keys', () => {
    expect(() => validateBoard(roadmap, [entry, { ...entry, key: 'e-1' }])).toThrow(
      /duplicate entry key/,
    );
  });
});
