// @vitest-environment node
import { planMusicImport } from '../domain';
import type {
  MusicLibraryRecord,
  MusicTrackImportEntry,
  MusicTrackRecord,
} from '../domain';
import { expect, it } from 'vitest';

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

function trackEntry(overrides: Partial<MusicTrackImportEntry> = {}): MusicTrackImportEntry {
  return {
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
    libraries: ['default'],
    ...overrides,
  };
}

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

it('legacy mode creates the default library and only adds memberships', () => {
  const plan = planMusicImport({
    libraries: null,
    tracks: [trackEntry()],
    existing: {
      tracks: [],
      libraries: [libraryRecord({ id: 'lib-podcast', key: '播客', title: '播客', position: 1 })],
      memberships: [],
    },
  });

  expect(plan.mode).toBe('legacy');
  expect(plan.libraryCreates).toEqual([{ key: 'default', title: 'default', position: 2 }]);
  expect(plan.libraryUpdates).toEqual([]);
  expect(plan.libraryDeactivations).toEqual([]);
  expect(plan.membershipAdds).toEqual([{ libraryKey: 'default', trackKey: 'demo-01' }]);
  expect(plan.membershipRemovals).toEqual([]);
  expect(plan.summary.libraries).toEqual({ created: 1, updated: 0, unchanged: 0, deactivated: 0 });
  expect(plan.summary.memberships).toEqual({ added: 1, removed: 0 });
});

it('legacy mode reactivates an existing default without touching its title or position', () => {
  const plan = planMusicImport({
    libraries: null,
    tracks: [trackEntry()],
    existing: {
      tracks: [],
      libraries: [libraryRecord({ title: '默认', position: 5, isActive: false })],
      memberships: [],
    },
  });

  expect(plan.libraryCreates).toEqual([]);
  expect(plan.libraryUpdates).toEqual([{ key: 'default', title: '默认', position: 5 }]);
  expect(plan.libraryDeactivations).toEqual([]);
});

it('legacy mode leaves other memberships alone', () => {
  const plan = planMusicImport({
    libraries: null,
    tracks: [trackEntry()],
    existing: {
      tracks: [trackRecord()],
      libraries: [libraryRecord()],
      memberships: [{ libraryId: 'lib-default', trackId: 'track-1' }],
    },
  });

  expect(plan.membershipAdds).toEqual([]);
  expect(plan.membershipRemovals).toEqual([]);
  expect(plan.summary.unchanged).toBe(1);
  expect(plan.summary.libraries.unchanged).toBe(1);
});

it('authority mode rewrites memberships and deactivates undeclared libraries', () => {
  const plan = planMusicImport({
    libraries: [
      { key: 'music', title: '音乐', position: 1 },
      { key: 'new', title: 'New', position: 3 },
    ],
    tracks: [trackEntry({ libraries: ['music'] })],
    existing: {
      tracks: [trackRecord()],
      libraries: [
        libraryRecord({ id: 'lib-music', key: 'music', title: 'Music', position: 1 }),
        libraryRecord({ id: 'lib-old', key: 'old', title: 'Old', position: 2 }),
      ],
      memberships: [{ libraryId: 'lib-old', trackId: 'track-1' }],
    },
  });

  expect(plan.mode).toBe('authority');
  expect(plan.libraryCreates).toEqual([{ key: 'new', title: 'New', position: 3 }]);
  expect(plan.libraryUpdates).toEqual([{ key: 'music', title: '音乐', position: 1 }]);
  expect(plan.libraryDeactivations).toEqual(['old']);
  expect(plan.membershipAdds).toEqual([{ libraryKey: 'music', trackKey: 'demo-01' }]);
  expect(plan.membershipRemovals).toEqual([{ libraryKey: 'old', trackKey: 'demo-01' }]);
  expect(plan.summary.libraries).toEqual({ created: 1, updated: 1, unchanged: 0, deactivated: 1 });
  expect(plan.summary.memberships).toEqual({ added: 1, removed: 1 });
});

it('authority mode keeps memberships that already match the manifest', () => {
  const plan = planMusicImport({
    libraries: [{ key: 'music', title: '音乐', position: 1 }],
    tracks: [trackEntry({ libraries: ['music'] })],
    existing: {
      tracks: [trackRecord()],
      libraries: [libraryRecord({ id: 'lib-music', key: 'music', title: '音乐', position: 1 })],
      memberships: [{ libraryId: 'lib-music', trackId: 'track-1' }],
    },
  });

  expect(plan.libraryCreates).toEqual([]);
  expect(plan.libraryUpdates).toEqual([]);
  expect(plan.libraryDeactivations).toEqual([]);
  expect(plan.membershipAdds).toEqual([]);
  expect(plan.membershipRemovals).toEqual([]);
  expect(plan.summary.unchanged).toBe(1);
  expect(plan.summary.libraries.unchanged).toBe(1);
});

it('warns when content changes under an unchanged trackKey', () => {
  const plan = planMusicImport({
    libraries: null,
    tracks: [trackEntry({ contentHash: 'hash-2' })],
    existing: {
      tracks: [trackRecord({ contentHash: 'hash-1' })],
      libraries: [libraryRecord()],
      memberships: [{ libraryId: 'lib-default', trackId: 'track-1' }],
    },
  });

  expect(plan.warnings[0]).toMatch(/content changed under an unchanged trackKey "demo-01"/u);
  expect(plan.trackUpdates).toHaveLength(1);
});

it('refuses a manifest that assigns the same content to two tracks', () => {
  expect(() =>
    planMusicImport({
      libraries: null,
      tracks: [trackEntry(), trackEntry({ trackKey: 'demo-02' })],
      existing: { tracks: [], libraries: [libraryRecord()], memberships: [] },
    }),
  ).toThrow(/one trackKey per piece of content/u);
});

it('refuses a manifest entry whose content is still held by a row outside the manifest', () => {
  expect(() =>
    planMusicImport({
      libraries: null,
      tracks: [trackEntry({ trackKey: 'fresh', contentHash: 'hash-1' })],
      existing: {
        tracks: [trackRecord({ trackKey: 'demo-01', contentHash: 'hash-1' })],
        libraries: [libraryRecord()],
        memberships: [],
      },
    }),
  ).toThrow(/"fresh" and "demo-01"|"demo-01" and "fresh"/u);
});

it('accepts a manifest that keeps one trackKey per piece of content', () => {
  const plan = planMusicImport({
    libraries: null,
    tracks: [trackEntry({ trackKey: 'fresh', contentHash: 'hash-9' })],
    existing: {
      tracks: [trackRecord({ trackKey: 'other', contentHash: 'hash-1' })],
      libraries: [libraryRecord()],
      memberships: [],
    },
  });

  expect(plan.trackCreates).toHaveLength(1);
  expect(plan.trackDeactivations).toEqual(['other']);
});
