// @vitest-environment node
import {
  findMusicDuplicateCandidates,
  isMusicUniqueConflict,
  planMusicUploadDecision,
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

const libraries = [library(), library({ id: 'lib-picks', key: '精选', position: 2 })];

it('creates a row when the content is new', () => {
  expect(
    planMusicUploadDecision({
      contentHash: 'hash-new',
      libraryKeys: ['default'],
      tracks: [track()],
      libraries,
      memberships: [{ libraryId: 'lib-default', trackId: 'track-1' }],
    }),
  ).toEqual({ kind: 'create' });
});

it('treats a row without a hash as a different track', () => {
  expect(
    planMusicUploadDecision({
      contentHash: 'hash-new',
      libraryKeys: ['default'],
      tracks: [track({ contentHash: null })],
      libraries,
      memberships: [{ libraryId: 'lib-default', trackId: 'track-1' }],
    }),
  ).toEqual({ kind: 'create' });
});

it('reports an existing row when the content is already in the target library', () => {
  const decision = planMusicUploadDecision({
    contentHash: 'hash-1',
    libraryKeys: ['default'],
    tracks: [track()],
    libraries,
    memberships: [{ libraryId: 'lib-default', trackId: 'track-1' }],
  });

  expect(decision.kind).toBe('existing');
  expect(decision.kind === 'existing' ? decision.libraryKeys : []).toEqual(['default']);
});

it('adds a membership instead of a row when the content lives in another library', () => {
  const decision = planMusicUploadDecision({
    contentHash: 'hash-1',
    libraryKeys: ['精选'],
    tracks: [track()],
    libraries,
    memberships: [{ libraryId: 'lib-default', trackId: 'track-1' }],
  });

  expect(decision.kind).toBe('membership-added');
  expect(decision.kind === 'membership-added' ? decision.addLibraryKeys : []).toEqual(['精选']);
  // 返回的归属是合并后的结果，按曲库顺序排列
  expect(decision.kind === 'membership-added' ? decision.libraryKeys : []).toEqual([
    'default',
    '精选',
  ]);
});

it('reports a deactivated row without restoring it or adding a membership', () => {
  const decision = planMusicUploadDecision({
    contentHash: 'hash-1',
    libraryKeys: ['精选'],
    tracks: [track({ isActive: false })],
    libraries,
    memberships: [{ libraryId: 'lib-default', trackId: 'track-1' }],
  });

  expect(decision.kind).toBe('deactivated');
  expect(decision.kind === 'deactivated' ? decision.libraryKeys : []).toEqual(['default']);
});

it('flags a similar title with a different hash as a duplicate candidate only', () => {
  const hints = findMusicDuplicateCandidates(
    { title: '演示曲目 01', artist: null, durationSeconds: 11, contentHash: 'hash-new' },
    [track()],
  );

  expect(hints).toEqual([
    {
      trackKey: 'demo-01',
      title: '演示曲目 01',
      artist: null,
      durationSeconds: 10,
      reason: 'title-duration',
    },
  ]);
});

it('never flags the row that holds the very same bytes', () => {
  expect(
    findMusicDuplicateCandidates(
      { title: '演示曲目 01', artist: null, durationSeconds: 10, contentHash: 'hash-1' },
      [track()],
    ),
  ).toEqual([]);
});

it('ignores deactivated rows, far-apart durations and conflicting artists', () => {
  const base = { title: '演示曲目 01', durationSeconds: 10, contentHash: 'hash-new' };

  expect(findMusicDuplicateCandidates({ ...base, artist: null }, [track({ isActive: false })])).toEqual(
    [],
  );
  expect(findMusicDuplicateCandidates({ ...base, artist: null }, [track({ durationSeconds: 60 })])).toEqual(
    [],
  );
  expect(
    findMusicDuplicateCandidates({ ...base, artist: '别的歌手' }, [track({ artist: '原歌手' })]),
  ).toEqual([]);
  expect(
    findMusicDuplicateCandidates({ ...base, artist: null }, [track({ title: '完全不同的歌' })]),
  ).toEqual([]);
});

it('catches a title that has the artist glued onto it', () => {
  const glued = track({
    trackKey: 'gumi',
    title: 'GUMI,一之濑ユウ   心做し',
    artist: null,
    durationSeconds: 246,
  });
  const hints = findMusicDuplicateCandidates(
    { title: '心做し', artist: null, durationSeconds: 246, contentHash: 'hash-new' },
    [glued],
  );

  expect(hints.map((hint) => hint.trackKey)).toEqual(['gumi']);
});

it('caps the hint list', () => {
  const rows = Array.from({ length: 7 }, (_, index) =>
    track({ id: `track-${index}`, trackKey: `demo-${index}`, contentHash: `hash-${index}` }),
  );

  expect(
    findMusicDuplicateCandidates(
      { title: '演示曲目 01', artist: null, durationSeconds: 10, contentHash: 'hash-new' },
      rows,
    ),
  ).toHaveLength(5);
});

it('recognises the Prisma unique violation by its code', () => {
  expect(isMusicUniqueConflict({ code: 'P2002' })).toBe(true);
  expect(isMusicUniqueConflict(new Error('boom'))).toBe(false);
  expect(isMusicUniqueConflict({ code: 'P2025' })).toBe(false);
  expect(isMusicUniqueConflict(null)).toBe(false);
});
