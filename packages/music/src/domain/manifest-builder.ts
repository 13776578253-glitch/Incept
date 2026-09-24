import { extensionOf, slugifyMusicKey, titleFromFileName, uniqueMusicKey } from './keys';

export type ManifestLibraryEntry = {
  key: string;
  title: string;
  position: number;
};

export type ManifestTrackEntry = {
  trackKey: string;
  file: string;
  title: string;
  artist?: string;
  publishedAt?: string;
  position: number;
  libraries: string[];
};

export type MusicManifestDocument = {
  libraries: ManifestLibraryEntry[];
  tracks: ManifestTrackEntry[];
};

// 上一版清单：顶层 libraries 与单条的 libraries 都可能缺失
export type PreviousManifestTrackEntry = Omit<ManifestTrackEntry, 'libraries'> & {
  libraries?: string[];
};

export type PreviousMusicManifest = {
  libraries?: ManifestLibraryEntry[];
  tracks: PreviousManifestTrackEntry[];
};

export type MusicManifestBuildReport = {
  files: number;
  kept: number;
  added: number;
  missing: string[];
  librariesAdded: string[];
  librariesRemoved: string[];
};

export type MusicManifestBuildResult = {
  document: MusicManifestDocument;
  report: MusicManifestBuildReport;
};

const DEFAULT_LIBRARY_KEY = 'default';
// 与 docs 导入器同一约定：数字前缀决定顺序，前缀不属于名字
const NUMBERED_FOLDER_PATTERN = /^(\d+)-(.+)$/;

function trackKeyFromFile(file: string): string {
  const extension = extensionOf(file);
  const withoutExtension = extension === '' ? file : file.slice(0, file.length - extension.length);

  return slugifyMusicKey(withoutExtension.split('/').join('-'));
}

function titleFromFile(file: string): string {
  return titleFromFileName(file);
}

function numberedFolderParts(folder: string): { prefix: number; base: string } {
  const match = NUMBERED_FOLDER_PATTERN.exec(folder);

  if (!match) {
    throw new Error(
      `The folder "${folder}" contains audio files but is not numbered. Rename it (for example "01-${folder}") so the library has a stable order.`,
    );
  }

  return { prefix: Number(match[1]), base: match[2] };
}

// 首段路径就是曲库；直接在根目录的文件归入 default
function membershipKeyForFile(file: string): string {
  const segments = file.split('/');

  if (segments.length === 1) {
    return DEFAULT_LIBRARY_KEY;
  }

  const key = slugifyMusicKey(numberedFolderParts(segments[0]).base);

  if (key === '') {
    throw new Error(`The folder "${segments[0]}" has no usable characters for a library key.`);
  }

  return key;
}

// 缺失磁盘的条目：宽松派生一次，key 不在允许集合就回落到 default
function missingMembershipKey(file: string, allowedKeys: Set<string>): string {
  const segments = file.split('/');

  if (segments.length === 1) {
    return DEFAULT_LIBRARY_KEY;
  }

  const match = NUMBERED_FOLDER_PATTERN.exec(segments[0]);
  const key = slugifyMusicKey(match ? match[2] : segments[0]);

  return key !== '' && allowedKeys.has(key) ? key : DEFAULT_LIBRARY_KEY;
}

function deriveFolderLibraries(files: string[]): {
  derivedByKey: Map<string, ManifestLibraryEntry>;
} {
  const folders = new Map<string, { prefix: number; base: string }>();
  let hasRootFile = false;

  for (const file of files) {
    const segments = file.split('/');

    if (segments.length === 1) {
      hasRootFile = true;
      continue;
    }

    if (!folders.has(segments[0])) {
      folders.set(segments[0], numberedFolderParts(segments[0]));
    }
  }

  const entries = [...folders.entries()]
    .map(([folder, info]) => ({ folder, prefix: info.prefix, base: info.base }))
    .sort((left, right) => left.prefix - right.prefix || left.base.localeCompare(right.base));

  const derivedByKey = new Map<string, ManifestLibraryEntry>();
  const prefixOwner = new Map<number, string>();
  const keyOwner = new Map<string, string>();
  let position = 0;

  for (const entry of entries) {
    const previousOwner = prefixOwner.get(entry.prefix);

    if (previousOwner) {
      throw new Error(
        `Two folders use the same number ${String(entry.prefix).padStart(2, '0')}: "${previousOwner}" and "${entry.folder}".`,
      );
    }

    prefixOwner.set(entry.prefix, entry.folder);

    const key = slugifyMusicKey(entry.base);

    if (key === '') {
      throw new Error(`The folder "${entry.folder}" has no usable characters for a library key.`);
    }

    if (key === DEFAULT_LIBRARY_KEY) {
      throw new Error(
        `The folder "${entry.folder}" derives the reserved library key "${DEFAULT_LIBRARY_KEY}". Rename the folder.`,
      );
    }

    const duplicateOwner = keyOwner.get(key);

    if (duplicateOwner) {
      throw new Error(
        `Two folders derive the same library key "${key}": "${duplicateOwner}" and "${entry.folder}".`,
      );
    }

    keyOwner.set(key, entry.folder);
    position += 1;
    derivedByKey.set(key, { key, title: entry.base, position });
  }

  if (hasRootFile) {
    position += 1;
    derivedByKey.set(DEFAULT_LIBRARY_KEY, {
      key: DEFAULT_LIBRARY_KEY,
      title: DEFAULT_LIBRARY_KEY,
      position,
    });
  }

  return { derivedByKey };
}

// 文件夹派生的曲库 key：这些库不能从清单移除，下一次生成会带回来
export function deriveFolderLibraryKeys(files: string[]): Set<string> {
  return new Set(deriveFolderLibraries(files).derivedByKey.keys());
}

// 构建：给定扫描到的文件与上一版清单，产出新的清单文档。文件系统与打印由调用方负责
export function buildMusicManifest(input: {
  files: string[];
  previous: PreviousMusicManifest | null;
}): MusicManifestBuildResult {
  const files = [...input.files].sort();
  const previousTracks = input.previous?.tracks ?? [];
  const previousLibraries = input.previous?.libraries ?? [];
  const previousTrackByFile = new Map(previousTracks.map((track) => [track.file, track]));
  const previousLibraryByKey = new Map(previousLibraries.map((library) => [library.key, library]));

  const takenKeys = new Set(previousTracks.map((track) => track.trackKey));
  const tracks: ManifestTrackEntry[] = [];
  let kept = 0;
  let added = 0;

  const { derivedByKey } = deriveFolderLibraries(files);
  // 清单里允许出现的曲库 key：目录派生的、上一版声明的，加上 default
  const allowedKeys = new Set<string>([
    ...derivedByKey.keys(),
    ...previousLibraryByKey.keys(),
    DEFAULT_LIBRARY_KEY,
  ]);

  const requireAllowedKey = (key: string, file: string): string => {
    if (allowedKeys.has(key)) {
      return key;
    }

    throw new Error(
      `The track "${file}" refers to the library "${key}", which no folder derives and the previous manifest does not declare. Fix the key, add the numbered folder, or declare the library.`,
    );
  };

  for (const [index, file] of files.entries()) {
    const previousTrack = previousTrackByFile.get(file);

    if (previousTrack) {
      kept += 1;
    } else {
      added += 1;
    }

    // 手写的 libraries 优先于目录派生
    const libraries = previousTrack?.libraries?.length
      ? previousTrack.libraries.map((key) => requireAllowedKey(key, file))
      : [membershipKeyForFile(file)];

    const trackKey = previousTrack?.trackKey ?? uniqueMusicKey(trackKeyFromFile(file), takenKeys);
    takenKeys.add(trackKey);

    tracks.push({
      trackKey,
      file,
      title: previousTrack?.title ?? titleFromFile(file),
      ...(previousTrack?.artist ? { artist: previousTrack.artist } : {}),
      ...(previousTrack?.publishedAt ? { publishedAt: previousTrack.publishedAt } : {}),
      position: previousTrack?.position ?? index + 1,
      libraries,
    });
  }

  // 清单里有、磁盘上已不在的条目：保留而不是删除
  const onDisk = new Set(files);
  const missing = previousTracks.filter((track) => !onDisk.has(track.file));

  for (const track of missing) {
    tracks.push({
      trackKey: track.trackKey,
      file: track.file,
      title: track.title,
      ...(track.artist ? { artist: track.artist } : {}),
      ...(track.publishedAt ? { publishedAt: track.publishedAt } : {}),
      position: track.position,
      libraries: track.libraries?.length
        ? track.libraries.map((key) => requireAllowedKey(key, track.file))
        : [missingMembershipKey(track.file, allowedKeys)],
    });
  }

  const referencedKeys = new Set<string>();

  for (const track of tracks) {
    for (const key of track.libraries) {
      referencedKeys.add(key);
    }
  }

  let nextPosition =
    Math.max(
      0,
      ...previousLibraries.map((library) => library.position),
      ...[...derivedByKey.values()].map((library) => library.position),
    ) + 1;

  const libraries = [...referencedKeys].map((key) => {
    const previous = previousLibraryByKey.get(key);

    // 手写的标题与顺序优先；数字前缀只决定新曲库的初始 position
    if (previous) {
      return { key, title: previous.title, position: previous.position };
    }

    const derived = derivedByKey.get(key);

    if (derived) {
      return { key, title: derived.title, position: derived.position };
    }

    // 只有 default 会走到这里：其他 key 已由 requireAllowedKey 拦下
    return { key, title: DEFAULT_LIBRARY_KEY, position: nextPosition++ };
  });

  libraries.sort((left, right) => left.position - right.position || left.key.localeCompare(right.key));

  const referenced = new Set(libraries.map((library) => library.key));

  return {
    document: { libraries, tracks },
    report: {
      files: files.length,
      kept,
      added,
      missing: missing.map((track) => track.file),
      librariesAdded: libraries
        .filter((library) => !previousLibraryByKey.has(library.key))
        .map((library) => library.key),
      librariesRemoved: previousLibraries
        .filter((library) => !referenced.has(library.key))
        .map((library) => library.key),
    },
  };
}
