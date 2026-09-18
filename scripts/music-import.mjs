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
  console.log('Usage: pnpm music:import [--manifest <path>] [--dry-run] [--validate] [--allow-empty]');
  console.log('  --manifest    Path to music.json. Defaults to <MUSIC_CONTENT_ROOT>/music.json.');
  console.log('  --dry-run     Validate the manifest and report the plan without writing media or database rows.');
  console.log('  --validate    Compare the mirror and the database against the manifest. Writes nothing.');
  console.log('  --allow-empty Accept a manifest with no tracks. Without this flag an empty manifest is');
  console.log('                rejected, because importing one deactivates every existing track.');
}

function parseArgs(argv) {
  const args = { manifest: '', dryRun: false, validate: false, allowEmpty: false };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === '--manifest') {
      args.manifest = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (current === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (current === '--validate') {
      args.validate = true;
      continue;
    }

    if (current === '--allow-empty') {
      args.allowEmpty = true;
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

function describeCopiedMedia(operations) {
  const copied = operations.filter((operation) => operation.status === 'publish');

  if (copied.length === 0) {
    console.log('  (none: every file was already present in the mirror)');
    return;
  }

  for (const operation of copied) {
    console.log(`  ${operation.targetUrl} (${operation.size} bytes)`);
  }
}

async function main() {
  loadEnvironment();

  const args = parseArgs(process.argv.slice(2));

  const runner = await import(
    pathToFileURL(path.join(projectRoot, 'apps/web/src/server/music/import-runner.ts')).href
  );

  const plan = await runner.planMusicImport({
    manifestPath: args.manifest || undefined,
    allowEmpty: args.allowEmpty,
  });

  console.log(`content root: ${plan.contentRoot}`);
  console.log(`manifest:     ${plan.manifestPath}`);
  console.log(`entries:      ${plan.entries.length}`);
  console.log(
    `libraries:    ${
      plan.mode === 'legacy'
        ? 'none declared (legacy manifest: the default library is used)'
        : `${plan.libraries.length} declared`
    }`,
  );

  if (args.validate) {
    const issues = await runner.validateMusicMirror({ plan });

    if (issues.length === 0) {
      console.log('\nThe mirror and the database agree with the manifest.');
      return;
    }

    console.log(`\n${issues.length} inconsistency(ies):`);

    for (const issue of issues) {
      console.log(`  ${issue.kind}: ${issue.detail}`);
    }

    process.exitCode = 1;
    return;
  }

  const operations = await runner.publishMusicImportMedia({
    plan,
    mode: args.dryRun ? 'dry-run' : 'publish',
  });

  const copied = operations.filter((operation) => operation.status === 'publish').length;
  const reused = operations.filter((operation) => operation.status === 'reuse').length;

  console.log(`\nmedia: ${copied} to copy, ${reused} reused`);

  if (args.dryRun) {
    console.log('dry run: no media and no database rows were written.');
    return;
  }

  let summary;

  try {
    summary = await runner.commitMusicImport({ plan, operations });
  } catch (error) {
    // history：数据库部分在单事务里，失败时没有行被改动 / 镜像已经复制好了，因为按内容寻址，重跑必然复用它们 —— 所以这里只报告清单，不删除文件
    console.error('\nThe database write failed. No rows were changed.');
    console.error('Media copied by this run is content-addressed and will be reused on the next run:');
    describeCopiedMedia(operations);
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `tracks:       ${summary.created} created, ${summary.updated} updated, ${summary.unchanged} unchanged, ${summary.deactivated} deactivated`,
  );
  console.log(
    `libraries:    ${summary.libraries.created} created, ${summary.libraries.updated} updated, ${summary.libraries.unchanged} unchanged, ${summary.libraries.deactivated} deactivated`,
  );
  console.log(`memberships:  ${summary.memberships.added} added, ${summary.memberships.removed} removed`);

  for (const warning of summary.warnings) {
    console.log(`  warning: ${warning}`);
  }

  console.log('\nmedia copied by this run:');
  describeCopiedMedia(operations);
}

await main();
