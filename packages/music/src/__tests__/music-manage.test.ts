// @vitest-environment node
import {
  planMusicLibraryCreate,
  planMusicLibraryDelete,
  planMusicLibraryUpdate,
  planMusicTrackCreate,
  planMusicTrackUpdate,
} from '../domain';
import type { MusicLibraryRecord, MusicTrackRecord } from '../domain';
import { expect, it } from 'vitest';

function library(overrides: Partial<MusicLibraryRecord> = {}): MusicLibraryRecord {
  return {
    id: 'lib-default',
    key: 'default',
    title: 'default',
    position: 1,
    isActive: true,
    ...overrides,
  };
}

function track(overrides: Partial<MusicTrackRecord> = {}): MusicTrackRecord {
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

it('creates a track after the last position and rejects duplicates or unusable libraries', () => {
  const libraries = [library(), library({ id: 'lib-picks', key: '精选', position: 2 })];

  expect(
    planMusicTrackCreate({ trackKey: 'new-one', libraryKeys: ['精选'], tracks: [track()], libraries }),
  ).toEqual({ position: 2 });

  expect(() =>
    planMusicTrackCreate({ trackKey: 'demo-01', libraryKeys: ['default'], tracks: [track()], libraries }),
  ).toThrow(/already exists/u);

  expect(() =>
    planMusicTrackCreate({ trackKey: 'new-one', libraryKeys: [], tracks: [], libraries }),
  ).toThrow(/at least one library/u);

  expect(() =>
    planMusicTrackCreate({ trackKey: 'new-one', libraryKeys: ['default', 'default'], tracks: [], libraries }),
  ).toThrow(/same library twice/u);

  expect(() =>
    planMusicTrackCreate({ trackKey: 'new-one', libraryKeys: ['missing'], tracks: [], libraries }),
  ).toThrow(/does not exist or is deactivated/u);

  expect(() =>
    planMusicTrackCreate({
      trackKey: 'new-one',
      libraryKeys: ['old'],
      tracks: [],
      libraries: [library({ key: 'old', isActive: false })],
    }),
  ).toThrow(/does not exist or is deactivated/u);
});

it('validates a track patch', () => {
  const libraries = [library()];

  expect(planMusicTrackUpdate({ libraries, patch: { title: '第一集' } })).toEqual({ title: '第一集' });

  expect(() => planMusicTrackUpdate({ libraries, patch: { title: '   ' } })).toThrow(
    /title cannot be empty/u,
  );
  expect(() => planMusicTrackUpdate({ libraries, patch: { position: 0 } })).toThrow(
    /positive integer/u,
  );
  expect(() => planMusicTrackUpdate({ libraries, patch: { isActive: true } })).toThrow(
    /requires its library assignments/u,
  );
  expect(() => planMusicTrackUpdate({ libraries, patch: { libraryKeys: [] } })).toThrow(
    /at least one library/u,
  );
});

it('creates a library after the last position and rejects duplicates or an empty name', () => {
  const libraries = [library()];

  expect(planMusicLibraryCreate({ key: '精选', title: '精选', libraries })).toEqual({ position: 2 });
  expect(() => planMusicLibraryCreate({ key: 'default', title: 'x', libraries })).toThrow(
    /already exists/u,
  );
  expect(() => planMusicLibraryCreate({ key: 'x', title: '  ', libraries })).toThrow(
    /name cannot be empty/u,
  );
});

it('refuses to deactivate the last active library', () => {
  const libraries = [library()];

  expect(() =>
    planMusicLibraryUpdate({
      library: libraries[0],
      libraries,
      memberCount: 1,
      patch: { isActive: false, moveMembersTo: 'anything' },
    }),
  ).toThrow(/last active library/u);
});

it('requires a destination when a library with members is deactivated', () => {
  const libraries = [library(), library({ id: 'lib-picks', key: '精选', position: 2 })];

  expect(() =>
    planMusicLibraryUpdate({
      library: libraries[0],
      libraries,
      memberCount: 2,
      patch: { isActive: false },
    }),
  ).toThrow(/Choose where/u);

  expect(() =>
    planMusicLibraryUpdate({
      library: libraries[0],
      libraries,
      memberCount: 2,
      patch: { isActive: false, moveMembersTo: 'missing' },
    }),
  ).toThrow(/does not exist or is deactivated/u);

  expect(
    planMusicLibraryUpdate({
      library: libraries[0],
      libraries,
      memberCount: 2,
      patch: { isActive: false, moveMembersTo: '精选' },
    }),
  ).toEqual({ moveMembersTo: '精选' });
});

it('moves members only while deactivating, and allows an empty library to go', () => {
  const libraries = [library(), library({ id: 'lib-picks', key: '精选', position: 2 })];

  expect(() =>
    planMusicLibraryUpdate({
      library: libraries[0],
      libraries,
      memberCount: 0,
      patch: { moveMembersTo: '精选' },
    }),
  ).toThrow(/only applies when deactivating/u);

  expect(
    planMusicLibraryUpdate({ library: libraries[0], libraries, memberCount: 0, patch: { isActive: false } }),
  ).toEqual({ moveMembersTo: null });

  expect(() =>
    planMusicLibraryUpdate({ library: libraries[0], libraries, memberCount: 0, patch: { title: ' ' } }),
  ).toThrow(/name cannot be empty/u);
});

it('deletes only an empty library, and never the last active one', () => {
  const libraries = [library(), library({ id: 'lib-picks', key: '精选', position: 2 })];

  expect(() => planMusicLibraryDelete({ library: libraries[1], libraries, memberCount: 0 })).not.toThrow();
  expect(() => planMusicLibraryDelete({ library: libraries[0], libraries, memberCount: 0 })).not.toThrow();

  expect(() => planMusicLibraryDelete({ library: libraries[0], libraries, memberCount: 3 })).toThrow(
    /with tracks cannot be deleted/u,
  );

  expect(() =>
    planMusicLibraryDelete({ library: libraries[0], libraries: [libraries[0]], memberCount: 0 }),
  ).toThrow(/last active library/u);

  // 停用中的空库随时可删：它不参与"最后一个启用曲库"的判定
  expect(() =>
    planMusicLibraryDelete({
      library: library({ id: 'lib-old', key: 'old', isActive: false }),
      libraries: [library()],
      memberCount: 0,
    }),
  ).not.toThrow();
});
