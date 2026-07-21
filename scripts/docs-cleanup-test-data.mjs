import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function printUsage() {
  console.log('Usage: pnpm docs:cleanup-test-data [--dry-run] [--confirm]');
}

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    confirm: argv.includes('--confirm'),
  };
}

function printLocales(locales) {
  for (const locale of locales) {
    console.log(`  - ${locale.locale}/${locale.slug}: ${locale.title}`);
  }
}

function printPreview(preview) {
  console.log('');
  console.log('Docs test-data cleanup preview');
  console.log('');
  console.log(`Retained documents: ${preview.retainedDocuments.length}`);
  for (const document of preview.retainedDocuments) {
    console.log(`- ${document.documentKey} (document ${document.documentId}, ${document.accessRole} -> pro)`);
    printLocales(document.locales);
  }

  console.log('');
  console.log(`Test documents to delete: ${preview.testDocuments.length}`);
  for (const document of preview.testDocuments) {
    console.log(`- document ${document.documentId} (${document.kind}, ${document.accessRole})`);
    printLocales(document.locales);
  }

  console.log('');
  console.log(`Test collections to delete: ${preview.testCollections.length}`);
  for (const collection of preview.testCollections) {
    console.log(`- collection ${collection.collectionId} (${collection.itemCount} items)`);
    printLocales(collection.locales);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.dryRun && args.confirm) {
    printUsage();
    throw new Error('Use either --dry-run or --confirm, not both.');
  }

  const docsDbModule = await import(
    pathToFileURL(path.join(projectRoot, 'packages/db/src/docs/index.ts')).href,
  );
  const preview = await docsDbModule.previewDocsTestDataCleanup();

  printPreview(preview);

  if (!args.confirm) {
    console.log('');
    console.log('Dry run: no database rows were deleted. Re-run with --confirm to delete this exact test-data set.');
    return;
  }

  await docsDbModule.cleanupDocsTestData();

  console.log('');
  console.log('Docs cleanup applied. Retained document keys now use pro access: first-real-single, auth-and-crawling-basics.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
