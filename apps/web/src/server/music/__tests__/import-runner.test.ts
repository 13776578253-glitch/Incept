// @vitest-environment node
import { expect, it } from 'vitest';

import { parseMusicManifest, resolveMusicManifest } from '../import-runner';

function manifestWith(trackOverrides: Record<string, unknown> = {}, libraries?: unknown) {
  const track = {
    trackKey: 'demo-01',
    file: '01-播客/episode-01.mp3',
    title: '第一集',
    position: 1,
    ...trackOverrides,
  };

  return JSON.stringify(libraries === undefined ? { tracks: [track] } : { libraries, tracks: [track] });
}

it('a manifest without a top-level libraries array stays unresolved until resolution', () => {
  const manifest = parseMusicManifest(manifestWith());

  expect(manifest.libraries).toBeNull();
  expect(manifest.tracks[0].libraries).toBeNull();

  const resolved = resolveMusicManifest(manifest);

  expect(resolved.mode).toBe('legacy');
  expect(resolved.libraries).toBeNull();
  expect(resolved.tracks[0].libraries).toEqual(['default']);
});

it('an authoritative manifest keeps an omitted field null and resolves it to the default library', () => {
  const raw = manifestWith({}, [{ key: 'default', title: 'default', position: 2 }]);
  const manifest = parseMusicManifest(raw);

  expect(manifest.libraries).toEqual([{ key: 'default', title: 'default', position: 2 }]);
  expect(manifest.tracks[0].libraries).toBeNull();

  expect(resolveMusicManifest(manifest).tracks[0].libraries).toEqual(['default']);
});

it('resolves declared track libraries in authoritative mode', () => {
  const raw = manifestWith(
    { libraries: ['播客', '音乐'] },
    [
      { key: '播客', title: '播客', position: 1 },
      { key: '音乐', title: '音乐', position: 2 },
    ],
  );

  const resolved = resolveMusicManifest(parseMusicManifest(raw));

  expect(resolved.mode).toBe('authority');
  expect(resolved.tracks[0].libraries).toEqual(['播客', '音乐']);
});

it('rejects a track that declares libraries while the manifest declares none', () => {
  expect(() => parseMusicManifest(manifestWith({ libraries: ['播客'] }))).toThrow(
    /has no top-level "libraries" array/u,
  );
});

it('rejects an empty libraries array on a track', () => {
  const raw = manifestWith({ libraries: [] }, [{ key: 'default', title: 'default', position: 1 }]);

  expect(() => parseMusicManifest(raw)).toThrow(/must not be empty/u);
});

it('rejects a repeated library key inside one track', () => {
  const raw = manifestWith({ libraries: ['音乐', '音乐'] }, [{ key: '音乐', title: '音乐', position: 1 }]);

  expect(() => parseMusicManifest(raw)).toThrow(/repeats the library key: 音乐/u);
});

it('rejects a reference to an undeclared library', () => {
  const raw = manifestWith({ libraries: ['拼错的'] }, [{ key: '音乐', title: '音乐', position: 1 }]);

  expect(() => parseMusicManifest(raw)).toThrow(/refers to an undeclared library: 拼错的/u);
});

it('rejects an omitted field when the default library is not declared', () => {
  const raw = manifestWith({}, [{ key: '音乐', title: '音乐', position: 1 }]);

  expect(() => parseMusicManifest(raw)).toThrow(/that library is not declared/u);
});

it('rejects duplicate, malformed or unordered library declarations', () => {
  const duplicated = manifestWith({}, [
    { key: '音乐', title: '音乐', position: 1 },
    { key: '音乐', title: '另一个', position: 2 },
  ]);
  expect(() => parseMusicManifest(duplicated)).toThrow(/duplicate library key: 音乐/u);

  expect(() => parseMusicManifest(manifestWith({}, [{ key: '  ', title: '音乐', position: 1 }]))).toThrow(
    /"key" must be a non-empty string/u,
  );
  expect(() => parseMusicManifest(manifestWith({}, [{ key: '音乐', title: '', position: 1 }]))).toThrow(
    /"title" must be a non-empty string/u,
  );
  expect(() =>
    parseMusicManifest(manifestWith({}, [{ key: '音乐', title: '音乐', position: 1.5 }])),
  ).toThrow(/"position" must be an integer/u);
  expect(() => parseMusicManifest(manifestWith({}, 'nope'))).toThrow(/"libraries" must be an array/u);
});
