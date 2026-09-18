// @vitest-environment node
import type {
  MusicLibraryRecord,
  MusicTrackRecord,
} from '@incept/db/music';
import { expect, it } from 'vitest';

import { inspectMusicLibraryConsistency } from '../import-runner';

function libraryRecord(overrides: Partial<MusicLibraryRecord> = {}): MusicLibraryRecord {
  return {
    id: 'lib-default',
    key: 'default',
    title: 'default',
    position: 1,
    isActive: true,
    ...overrides,
  };
}

function trackRecord(overrides: Partial<MusicTrackRecord> = {}): MusicTrackRecord {
  return {
    id: 'track-1',
    trackKey: 'demo-01',
    title: '演示曲目 01',
    artist: null,
    audioUrl: '/_music-media/one.wav',
    contentHash: 'hash-1',
    mimeType: 'audio/wav',
    fileSize: 1024,
    durationSeconds: 10,
    publishedAt: null,
    position: 1,
    isActive: true,
    ...overrides,
  };
}

it('reports nothing when the libraries and memberships agree', () => {
  const issues = inspectMusicLibraryConsistency({
    plan: { libraries: [{ key: 'default', title: 'default', position: 1 }], entries: [{ trackKey: 'demo-01', libraries: ['default'] }] },
    libraries: [libraryRecord()],
    memberships: [{ libraryId: 'lib-default', trackId: 'track-1' }],
    tracks: [trackRecord()],
  });

  expect(issues).toEqual([]);
});

it('reports a declared library that the database does not have', () => {
  const issues = inspectMusicLibraryConsistency({
    plan: { libraries: [{ key: '播客', title: '播客', position: 1 }], entries: [] },
    libraries: [],
    memberships: [],
    tracks: [],
  });

  expect(issues).toEqual([{ kind: 'libraryNotImported', detail: '播客' }]);
});

it('reports a declared library that exists but is inactive', () => {
  const issues = inspectMusicLibraryConsistency({
    plan: { libraries: [{ key: 'default', title: 'default', position: 1 }], entries: [] },
    libraries: [libraryRecord({ isActive: false })],
    memberships: [],
    tracks: [],
  });

  expect(issues).toHaveLength(1);
  expect(issues[0].kind).toBe('libraryNotImported');
  expect(issues[0].detail).toMatch(/inactive/u);
});

it('reports a declared library whose title or position drifted', () => {
  const issues = inspectMusicLibraryConsistency({
    plan: { libraries: [{ key: 'default', title: '默认', position: 3 }], entries: [] },
    libraries: [libraryRecord({ title: 'default', position: 1 })],
    memberships: [],
    tracks: [],
  });

  expect(issues).toHaveLength(1);
  expect(issues[0].kind).toBe('libraryNotImported');
  expect(issues[0].detail).toMatch(/title "default" → "默认"/u);
  expect(issues[0].detail).toMatch(/position 1 → 3/u);
});

it('reports an active library the manifest no longer declares', () => {
  const issues = inspectMusicLibraryConsistency({
    plan: { libraries: [{ key: 'default', title: 'default', position: 1 }], entries: [] },
    libraries: [libraryRecord(), libraryRecord({ id: 'lib-old', key: 'old', title: 'Old', position: 2 })],
    memberships: [],
    tracks: [],
  });

  expect(issues).toEqual([{ kind: 'willDeactivateLibrary', detail: 'old' }]);
});

it('reports the implicit default library when a legacy manifest has none, or has it inactive', () => {
  const missing = inspectMusicLibraryConsistency({
    plan: { libraries: null, entries: [{ trackKey: 'demo-01', libraries: ['default'] }] },
    libraries: [],
    memberships: [],
    tracks: [trackRecord()],
  });

  expect(missing).toEqual([
    { kind: 'libraryNotImported', detail: 'default (implicit)' },
    { kind: 'membershipMismatch', detail: 'demo-01: manifest has [default], database has []' },
  ]);

  const inactive = inspectMusicLibraryConsistency({
    plan: { libraries: null, entries: [{ trackKey: 'demo-01', libraries: ['default'] }] },
    libraries: [libraryRecord({ isActive: false })],
    memberships: [{ libraryId: 'lib-default', trackId: 'track-1' }],
    tracks: [trackRecord()],
  });

  expect(inactive).toHaveLength(1);
  expect(inactive[0].kind).toBe('libraryNotImported');
  expect(inactive[0].detail).toMatch(/inactive/u);
});

it('compares memberships in both directions for an authoritative manifest, and only for missing ones in a legacy manifest', () => {
  const authority = inspectMusicLibraryConsistency({
    plan: {
      libraries: [{ key: 'default', title: 'default', position: 1 }],
      entries: [{ trackKey: 'demo-01', libraries: ['default'] }],
    },
    libraries: [libraryRecord(), libraryRecord({ id: 'lib-old', key: 'old', title: 'Old', position: 2 })],
    memberships: [
      { libraryId: 'lib-default', trackId: 'track-1' },
      { libraryId: 'lib-old', trackId: 'track-1' },
    ],
    tracks: [trackRecord()],
  });

  expect(authority.map((issue) => issue.kind)).toEqual(['willDeactivateLibrary', 'membershipMismatch']);
  expect(authority[1].detail).toBe('demo-01: manifest has [default], database has [default, old]');

  const legacy = inspectMusicLibraryConsistency({
    plan: { libraries: null, entries: [{ trackKey: 'demo-01', libraries: ['default'] }] },
    libraries: [libraryRecord(), libraryRecord({ id: 'lib-old', key: 'old', title: 'Old', position: 2 })],
    memberships: [
      { libraryId: 'lib-default', trackId: 'track-1' },
      { libraryId: 'lib-old', trackId: 'track-1' },
    ],
    tracks: [trackRecord()],
  });

  // 旧清单模式不删成员关系：多出来的 old 不算问题
  expect(legacy).toEqual([]);
});
