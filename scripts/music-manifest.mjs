import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

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

async function main() {
  loadEnvironment();

  const args = parseArgs(process.argv.slice(2));
  const configuredRoot = (args.root || process.env.MUSIC_CONTENT_ROOT || '').trim();

  if (!configuredRoot) {
    console.error('MUSIC_CONTENT_ROOT is not set. Add it to apps/web/.env.local or pass --root <dir>.');
    process.exit(1);
  }

  const contentRoot = path.resolve(configuredRoot);
  const domainMusic = (name) =>
    import(pathToFileURL(path.join(projectRoot, 'packages/music/src/domain', name)).href);
  const adaptersMusic = (name) =>
    import(pathToFileURL(path.join(projectRoot, 'packages/music/src/adapters', name)).href);

  const [builder, scan, manifestFile] = await Promise.all([
    domainMusic('manifest-builder.ts'),
    adaptersMusic('source-scan.ts'),
    adaptersMusic('manifest-file.ts'),
  ]);

  const files = await scan.collectMusicAudioFiles(contentRoot);

  if (files.length === 0) {
    console.error(
      `No ${scan.MUSIC_AUDIO_EXTENSIONS.join(' / ')} files found under ${contentRoot}.`,
    );
    process.exit(1);
  }

  // 读上一版清单：文件不存在算没有上一版，JSON 无效直接报错
  const { previous } = await manifestFile.readMusicManifestFile(contentRoot);

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

  await manifestFile.writeMusicManifestFile(contentRoot, document);
  console.log(`\nwrote ${manifestFile.getMusicManifestPath(contentRoot)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
