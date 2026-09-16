import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

// 与 media-store 的白名单一致。这里刻意不导入 app 模块：生成器只处理路径与 JSON，
// 不需要为此承担类型耦合，代价是这份三元素白名单要与之同步。
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac'];

function loadEnvironment() {
  const envFilePath = path.join(projectRoot, 'apps', 'web', '.env.local');

  try {
    process.loadEnvFile(envFilePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function printUsage() {
  console.log('Usage: pnpm music:manifest [--dry-run]');
  console.log('  Scans MUSIC_CONTENT_ROOT for audio files and writes <root>/music.json.');
  console.log('  Existing entries are kept as-is, so hand-edited titles, dates and positions survive.');
  console.log('  --dry-run  Report what would be written without touching the manifest.');
}

async function collectAudioFiles(root, directory = root) {
  const dirents = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const dirent of dirents) {
    const absolute = path.join(directory, dirent.name);

    if (dirent.isDirectory()) {
      files.push(...(await collectAudioFiles(root, absolute)));
      continue;
    }

    if (dirent.isFile() && AUDIO_EXTENSIONS.includes(path.extname(dirent.name).toLowerCase())) {
      // 清单里的路径一律用正斜杠，保证跨平台一致。
      files.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  }

  return files.sort();
}

function trackKeyFromFile(file) {
  const withoutExtension = file.slice(0, file.length - path.extname(file).length);

  return withoutExtension
    .split('/')
    .join('-')
    .toLowerCase()
    .replace(/[^0-9a-z\u4e00-\u9fff_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function uniqueTrackKey(base, taken) {
  const fallback = base === '' ? 'track' : base;

  if (!taken.has(fallback)) return fallback;

  let suffix = 2;
  while (taken.has(`${fallback}-${suffix}`)) suffix += 1;

  return `${fallback}-${suffix}`;
}

function titleFromFile(file) {
  const base = path.basename(file, path.extname(file));

  return base.replace(/[-_]+/g, ' ').trim() || base;
}

async function main() {
  loadEnvironment();

  const dryRun = process.argv.slice(2).includes('--dry-run');
  const configuredRoot = process.env.MUSIC_CONTENT_ROOT?.trim();

  if (!configuredRoot) {
    console.error('MUSIC_CONTENT_ROOT is not set. Add it to apps/web/.env.local.');
    process.exit(1);
  }

  const contentRoot = path.resolve(configuredRoot);
  const manifestPath = path.join(contentRoot, 'music.json');
  const files = await collectAudioFiles(contentRoot);

  if (files.length === 0) {
    console.error(`No ${AUDIO_EXTENSIONS.join(' / ')} files found under ${contentRoot}.`);
    process.exit(1);
  }

  const existing = await fs
    .readFile(manifestPath, 'utf8')
    .then((raw) => JSON.parse(raw))
    .catch(() => null);
  const previousEntries = Array.isArray(existing?.tracks) ? existing.tracks : [];
  const previousByFile = new Map(previousEntries.map((entry) => [entry.file, entry]));

  const takenKeys = new Set();
  let kept = 0;
  let added = 0;

  const entries = files.map((file, index) => {
    const previous = previousByFile.get(file);

    if (previous?.trackKey) {
      takenKeys.add(previous.trackKey);
    }

    return { file, previous, index };
  }).map(({ file, previous, index }) => {
    if (previous) {
      kept += 1;
    } else {
      added += 1;
    }

    const trackKey = previous?.trackKey ?? uniqueTrackKey(trackKeyFromFile(file), takenKeys);
    takenKeys.add(trackKey);

    return {
      trackKey,
      file,
      title: previous?.title ?? titleFromFile(file),
      ...(previous?.artist ? { artist: previous.artist } : {}),
      ...(previous?.publishedAt ? { publishedAt: previous.publishedAt } : {}),
      position: previous?.position ?? index + 1,
    };
  });

  // 清单里有、磁盘上已不在的条目：保留而不是删除。
  // 删掉会让下一次导入把它们静默停用，而文件消失通常只是路径改了名或挪了位置。
  const missing = previousEntries.filter((entry) => !files.includes(entry.file));

  for (const entry of missing) {
    entries.push(entry);
  }

  console.log(`content root: ${contentRoot}`);
  console.log(`audio files:  ${files.length}`);
  console.log(`kept:         ${kept}`);
  console.log(`added:        ${added}`);

  if (missing.length > 0) {
    console.log(`\n${missing.length} entr(ies) are in the manifest but missing on disk and were kept as-is:`);
    for (const entry of missing) console.log(`  ${entry.file}`);
    console.log('Remove them by hand if the files are really gone.');
  }

  if (dryRun) {
    console.log('\ndry run: music.json was not written.');
    return;
  }

  await fs.writeFile(manifestPath, `${JSON.stringify({ tracks: entries }, null, 2)}\n`, 'utf8');
  console.log(`\nwrote ${manifestPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
