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
  console.log('Usage: pnpm docs:import --file <path> | --dir <collection-directory> [--replace] [--dry-run]');
  console.log('  --file   Import one standalone or collection article source.');
  console.log('  --dir    Import one complete collection directory batch.');
  console.log('  --replace Allow updates to existing content when the batch is confirmed.');
  console.log('  --dry-run Validate and preview without writing a draft, media, or database data.');
}

function parseArgs(argv) {
  const args = {
    file: '',
    directory: '',
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

    if (current === '--dir') {
      args.directory = argv[index + 1] ?? '';
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

  if ((!args.file && !args.directory) || (args.file && args.directory)) {
    printUsage();
    process.exit(1);
  }

  const importerModule = await import(
    pathToFileURL(
      path.join(projectRoot, 'apps/web/src/features/docs/importer/index.ts'),
    ).href,
  );

  if (args.directory) {
    const draft = await importerModule.createDocsCollectionDirectoryDraft({
      directoryPath: args.directory,
      replace: args.replace,
      mediaMode: args.dryRun ? 'validate' : 'publish',
    });
    const collection = {
      directoryPath: draft.sourceFilePath,
      sources: draft.collectionSources ?? [],
      tree: draft.collectionTree ?? [],
      issues: draft.issues,
      mediaOperations: draft.media.operations,
    };

    console.log('');
    console.log('Docs collection directory scan');
    console.log(`- Directory: ${collection.directoryPath}`);
    console.log(`- Collection key: ${draft.source.meta.collectionKey ?? 'missing'}`);
    console.log(`- Locale: ${draft.source.meta.locale}`);
    console.log(`- Articles: ${collection.sources.length}`);
    printCollectionTree(collection.tree);
    console.log(`- Errors: ${collection.issues.filter((issue) => issue.level === 'error').length}`);
    console.log(`- Warnings: ${collection.issues.filter((issue) => issue.level === 'warning').length}`);

    if (draft.collectionChanges?.length) {
      console.log('');
      console.log('Batch changes');
      for (const change of draft.collectionChanges) {
        console.log(`- ${change.status}: ${change.key} (${change.type})`);
      }
    }

    if (collection.mediaOperations.length > 0) {
      console.log('');
      console.log('Media operations');
      for (const operation of collection.mediaOperations) {
        console.log(`- ${operation.status}: ${operation.sourcePath}`);
        console.log(`  -> ${operation.targetUrl} (${operation.size} bytes)`);
      }
    }

    if (collection.issues.length > 0) {
      console.log('');
      console.log('Validation issues:');
      for (const issue of collection.issues) {
        console.log(`  - [${issue.level}] ${issue.code}: ${issue.message}${issue.path ? ` (${issue.path})` : ''}`);
      }
    }

    if (!args.dryRun) {
      importerModule.writeDocsImportDraft(draft, projectRoot);
      console.log(`- Preview URL: http://localhost:3000/${draft.source.meta.locale}/docs/import-preview/${draft.id}`);
    }

    return;
  }

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

function printCollectionTree(nodes, depth = 0) {
  for (const node of nodes) {
    const marker = node.type === 'folder' ? 'folder' : 'article';
    console.log(`${'  '.repeat(depth)}- ${String(node.sortOrder).padStart(2, '0')} ${node.name} (${marker})`);
    printCollectionTree(node.children, depth + 1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
