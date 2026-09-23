import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function loadEnvironment() {
  const envFilePath = path.join(projectRoot, 'apps', 'web', '.env.local');

  try {
    process.loadEnvFile(envFilePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

function printUsage() {
  console.log('Usage: pnpm music:cleanup [--apply]');
  console.log('  --apply  Delete the unreferenced mirror files instead of only listing them.');
  console.log('');
  console.log('A mirror file no row references is an orphan: it comes from a failed upload, a deactivated');
  console.log('track, or a per-row delete. The API never removes content-addressed media itself, because a');
  console.log('concurrent upload may already be reusing that file, so reclamation happens here:');
  console.log('run this while nothing is uploading (close the settings page, no imports running).');
}

function parseArgs(argv) {
  const args = { apply: false };

  for (const current of argv) {
    if (current === '--apply') {
      args.apply = true;
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
  const runner = await import(
    pathToFileURL(path.join(projectRoot, 'packages/music/src/application/import-runner.ts')).href
  );

  // 路径装配（决策 5）：清理只关心镜像目录，不需要内容根
  const paths = {
    mirrorDirectory: path.join(projectRoot, 'apps', 'web', 'public', '_music-media'),
  };

  const report = await runner.inspectMusicMirrorCleanup({ paths });

  console.log(`mirror files:     ${report.mirrorFiles}`);
  console.log(`kept by a row:    ${report.referencedFiles}`);
  console.log(`unreferenced:     ${report.orphans.length}`);

  if (report.orphans.length === 0) {
    console.log('\nNothing to clean up: every mirror file is referenced by a row.');
    return;
  }

  console.log('');

  for (const name of report.orphans) {
    console.log(`  ${name}`);
  }

  if (!args.apply) {
    console.log('\nreport only: pass --apply to delete these files.');
    return;
  }

  const result = await runner.applyMusicMirrorCleanup({ paths, orphans: report.orphans });

  console.log(`\nremoved ${result.removed.length} file(s).`);

  for (const name of result.failed) {
    console.log(`  not removed (already gone?): ${name}`);
  }
}

await main();
