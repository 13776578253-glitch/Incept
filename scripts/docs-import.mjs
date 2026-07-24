import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function loadDocsImportEnvironment() {
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
  console.log('Usage: pnpm docs:import --file <path> [--replace] [--dry-run]');
}

function parseArgs(argv) {
  const args = {
    file: '',
    replace: false,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === '--file') {
      args.file = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (current === '--replace') {
      args.replace = true;
      continue;
    }

    if (current === '--dry-run') {
      args.dryRun = true;
      continue;
    }
  }

  return args;
}

async function main() {
  loadDocsImportEnvironment();
  const args = parseArgs(process.argv.slice(2));

  if (!args.file) {
    printUsage();
    process.exit(1);
  }

  const importerModule = await import(
    pathToFileURL(
      path.join(projectRoot, 'apps/web/src/features/docs/importer/index.ts'),
    ).href,
  );

  const draft = await importerModule.createDocsImportDraft({
    filePath: args.file,
    replace: args.replace,
    mediaMode: args.dryRun ? 'validate' : 'publish',
  });

  const preview = importerModule.toDocsImportPreviewModel(draft);
  const routePath =
    draft.source.meta.routeType === 'collectionArticle'
      ? `/${draft.source.meta.locale}/docs/series/${draft.source.meta.collectionSlug}/${draft.source.meta.slug}`
      : `/${draft.source.meta.locale}/docs/${draft.source.meta.slug}`;

  console.log('');
  console.log('Docs import draft created');
  console.log(`- Draft ID: ${draft.id}`);
  console.log(`- Source file: ${draft.sourceFilePath}`);
  console.log(`- Route type: ${draft.source.meta.routeType}`);
  console.log(`- Target route: ${routePath}`);
  console.log(`- Replace existing: ${draft.replace ? 'yes' : 'no'}`);
  console.log(`- Errors: ${preview.errorCount}`);
  console.log(`- Warnings: ${preview.warningCount}`);

  if (draft.media.operations.length > 0) {
    console.log('');
    console.log('Media operations');
    for (const operation of draft.media.operations) {
      console.log(`- ${operation.status}: ${operation.sourcePath}`);
      console.log(`  -> ${operation.targetUrl} (${operation.size} bytes)`);
    }
  }

  if (!args.dryRun) {
    importerModule.writeDocsImportDraft(draft, projectRoot);
    console.log(
      `- Preview URL: http://localhost:3000/${draft.source.meta.locale}/docs/import-preview/${draft.id}`,
    );
  } else {
    console.log('- Dry run: no draft file was written.');
  }

  if (draft.issues.length > 0) {
    console.log('');
    console.log('Validation issues:');
    for (const issue of draft.issues) {
      console.log(
        `  - [${issue.level}] ${issue.code}: ${issue.message}${issue.path ? ` (${issue.path})` : ''}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
