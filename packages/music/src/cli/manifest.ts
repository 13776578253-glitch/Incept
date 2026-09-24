// 清单生成入口（原 scripts/music-manifest.mjs）：用法文案与参数行为逐字保留；env 由根转发脚本显式传入
// 功能面经 exports 出口消费（验收 C3）：生成器在 ./domain，扫描与清单文件在 ./adapters
import path from 'node:path';

import {
  MUSIC_AUDIO_EXTENSIONS,
  collectMusicAudioFiles,
  getMusicManifestPath,
  readMusicManifestFile,
  writeMusicManifestFile,
} from '@incept/music/adapters';
import { buildMusicManifest } from '@incept/music/domain';

import { exitWithUsage, failUnknownArgument, parseCommonArgs } from './args';
import { loadEnvironment } from './env';

function printUsage() {
  console.log('Usage: pnpm music:manifest [--root <dir>] [--dry-run]');
  console.log('  Scans the content root for audio files and writes <root>/music.json.');
  console.log('  Libraries come from the first folder segment; hand-edited titles, dates, positions');
  console.log('  and library memberships are kept as they are.');
  console.log('  --root <dir>  Scan this directory instead of MUSIC_CONTENT_ROOT (for dry checks and tests).');
  console.log('  --dry-run     Report what would be written without touching the manifest.');
}

function parseArgs(argv: string[]) {
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
      exitWithUsage(printUsage);
    }

    failUnknownArgument(current, printUsage);
  }

  return args;
}

async function main() {
  const { common, rest } = parseCommonArgs(process.argv.slice(2));

  loadEnvironment(common.envFile);

  const args = parseArgs(rest);
  const configuredRoot = (args.root || process.env.MUSIC_CONTENT_ROOT || '').trim();

  if (!configuredRoot) {
    console.error('MUSIC_CONTENT_ROOT is not set. Add it to apps/web/.env.local or pass --root <dir>.');
    process.exit(1);
  }

  const contentRoot = path.resolve(configuredRoot);
  const files = await collectMusicAudioFiles(contentRoot);

  if (files.length === 0) {
    console.error(
      `No ${MUSIC_AUDIO_EXTENSIONS.join(' / ')} files found under ${contentRoot}.`,
    );
    process.exit(1);
  }

  // 读上一版清单：文件不存在算没有上一版，JSON 无效直接报错
  const { previous } = await readMusicManifestFile(contentRoot);

  const { document, report } = buildMusicManifest({ files, previous });

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

  await writeMusicManifestFile(contentRoot, document);
  console.log(`\nwrote ${getMusicManifestPath(contentRoot)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
