// 导入入口（原 scripts/music-import.mjs）：用法文案与参数行为逐字保留
// env 与镜像目录由根转发脚本显式传入（--env-file / --mirror，D.1 甲）；功能面经 exports 出口消费（验收 C3）
import path from 'node:path';

import { planMusicImport, publishMusicImportMedia, commitMusicImport, validateMusicMirror } from '@incept/music/application';
import { resolveMusicContentRoot } from '@incept/music/adapters';

import { exitWithUsage, failUnknownArgument, parseCommonArgs } from './args';
import { loadEnvironment } from './env';

function printUsage() {
  console.log('Usage: pnpm music:import [--manifest <path>] [--dry-run] [--validate] [--allow-empty]');
  console.log('  --manifest    Path to music.json. Defaults to <MUSIC_CONTENT_ROOT>/music.json.');
  console.log('  --dry-run     Validate the manifest and report the plan without writing media or database rows.');
  console.log('  --validate    Compare the mirror and the database against the manifest. Writes nothing.');
  console.log('  --allow-empty Accept a manifest with no tracks. Without this flag an empty manifest is');
  console.log('                rejected, because importing one deactivates every existing track.');
}

function parseArgs(argv: string[]) {
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
      exitWithUsage(printUsage);
    }

    failUnknownArgument(current, printUsage);
  }

  return args;
}

function describeCopiedMedia(operations: Awaited<ReturnType<typeof publishMusicImportMedia>>) {
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
  const { common, rest } = parseCommonArgs(process.argv.slice(2));

  loadEnvironment(common.envFile);

  const args = parseArgs(rest);

  if (common.mirror === '') {
    console.error('A mirror directory is required: pass --mirror <path> (the root forwarding script supplies it).');
    process.exit(1);
  }

  const paths = {
    contentRoot: await resolveMusicContentRoot(process.env.MUSIC_CONTENT_ROOT),
    mirrorDirectory: path.resolve(common.mirror),
  };

  const plan = await planMusicImport({
    paths,
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
        : `${(plan.libraries ?? []).length} declared`
    }`,
  );

  if (args.validate) {
    const issues = await validateMusicMirror({ paths, plan });

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

  // 网页新增的内容不在清单里，而清单导入是权威的：先说清楚这次会停用多少它不认识的行
  const pendingIssues = await validateMusicMirror({ paths, plan });
  const deactivations = pendingIssues.filter(
    (issue) => issue.kind === 'willDeactivate' || issue.kind === 'willDeactivateLibrary',
  );

  if (deactivations.length > 0) {
    console.log(
      `\nwarning: this manifest does not describe ${deactivations.length} row(s) that are currently active; importing deactivates them:`,
    );

    for (const issue of deactivations) {
      console.log(`  ${issue.kind}: ${issue.detail}`);
    }

    console.log(
      '  Content created from the web UI is not in the manifest. Continue only if this manifest is meant to be authoritative.',
    );
  }

  const operations = await publishMusicImportMedia({
    paths,
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
    summary = await commitMusicImport({ plan, operations });
  } catch (error) {
    // 数据库写失败：数据库全部回滚，已复制的镜像按内容寻址，重跑直接复用
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
