import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  console.log('Usage: pnpm music:manifest [--root <dir>] [--dry-run]');
  console.log('  Scans the content root for audio files and writes <root>/music.json.');
  console.log('  Libraries come from the first folder segment; hand-edited titles, dates, positions');
  console.log('  and library memberships are kept as they are.');
  console.log('  --root <dir>  Scan this directory instead of MUSIC_CONTENT_ROOT (for dry checks and tests).');
  console.log('  --dry-run     Report what would be written without touching the manifest.');
}

function parseArgs(argv) {
  const args = { root: '', dryRun: false };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === '--root') {
      args.root = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (current === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (current === '--help' || current === '-h') {
      printUsage();
      process.exit(0);
    }

    console.error(`Unknown argument: ${current}`);
    printUsage();
    process.exit(1);
  }

  return args;
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

async function main() {
  loadEnvironment();

  const args = parseArgs(process.argv.slice(2));
  const configuredRoot = (args.root || process.env.MUSIC_CONTENT_ROOT || '').trim();

  if (!configuredRoot) {
    console.error('MUSIC_CONTENT_ROOT is not set. Add it to apps/web/.env.local or pass --root <dir>.');
    process.exit(1);
  }

  const contentRoot = path.resolve(configuredRoot);
  const manifestPath = path.join(contentRoot, 'music.json');
  const files = await collectAudioFiles(contentRoot);

  if (files.length === 0) {
    console.error(`No ${AUDIO_EXTENSIONS.join(' / ')} files found under ${contentRoot}.`);
    process.exit(1);
  }

  const existingRaw = await fs.readFile(manifestPath, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });

  let previous = null;

  if (existingRaw !== null) {
    try {
      previous = JSON.parse(existingRaw);
    } catch {
      // 解析失败不能当作"没有上一版清单"：那会静默丢掉手写的标题、顺序与归属
      throw new Error(`${manifestPath} is not valid JSON. Fix or remove it before regenerating.`);
    }
  }

  const builder = await import(
    pathToFileURL(path.join(projectRoot, 'apps/web/src/server/music/manifest-builder.ts')).href
  );
  const { document, report } = builder.buildMusicManifest({ files, previous });

  console.log(`content root: ${contentRoot}`);
  console.log(`audio files:  ${report.files}`);
  console.log(`kept:         ${report.kept}`);
  console.log(`added:        ${report.added}`);
  console.log(`libraries:    ${document.libraries.length}`);

  if (report.librariesAdded.length > 0) {
    console.log(`libraries added:   ${report.librariesAdded.join(', ')}`);
  }

  if (report.librariesRemoved.length > 0) {
    console.log(`libraries removed: ${report.librariesRemoved.join(', ')}`);
    console.log('  No folder matches them and no track entry refers to them; the next import deactivates them.');
  }

  if (report.missing.length > 0) {
    console.log(`\n${report.missing.length} entr(ies) are in the manifest but missing on disk and were kept as-is:`);
    for (const file of report.missing) console.log(`  ${file}`);
    console.log('Remove them by hand if the files are really gone.');
  }

  if (args.dryRun) {
    console.log('\ndry run: music.json was not written.');
    return;
  }

  await fs.writeFile(manifestPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  console.log(`\nwrote ${manifestPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
