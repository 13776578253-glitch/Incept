import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function printUsage() {
  console.log('Usage: pnpm docs:archive --locale <en|zh> --slug <slug> [--dry-run]');
}

function parseArgs(argv) {
  const args = {
    locale: '',
    slug: '',
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === '--locale') {
      args.locale = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (current === '--slug') {
      args.slug = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (current === '--dry-run') {
      args.dryRun = true;
      continue;
    }
  }

  return args;
}

function validateArgs(args) {
  if (!args.locale || !args.slug) {
    printUsage();
    process.exit(1);
  }

  if (!['en', 'zh'].includes(args.locale)) {
    console.error(`Unsupported locale "${args.locale}". Expected "en" or "zh".`);
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  validateArgs(args);

  const docsDbModule = await import(
    pathToFileURL(path.join(projectRoot, 'packages/db/src/docs/index.ts')).href,
  );

  const target = await docsDbModule.findDocsArticleLocaleForArchive({
    locale: args.locale,
    slug: args.slug,
  });

  if (!target) {
    throw new Error(`No docs article locale was found for ${args.locale}/${args.slug}.`);
  }

  console.log('');
  console.log('Docs archive target');
  console.log(`- Document ID: ${target.documentId}`);
  console.log(`- Locale: ${target.locale}`);
  console.log(`- Slug: ${target.slug}`);
  console.log(`- Title: ${target.title}`);
  console.log(`- Current status: ${target.status}`);

  if (args.dryRun) {
    console.log('- Dry run: no database rows were updated.');
    return;
  }

  const result = await docsDbModule.archiveDocsArticleLocale({
    locale: args.locale,
    slug: args.slug,
  });

  console.log('');
  console.log(result.alreadyArchived ? 'Docs article was already archived' : 'Docs article archived');
  console.log(`- Document ID: ${result.documentId}`);
  console.log(`- Locale: ${result.locale}`);
  console.log(`- Slug: ${result.slug}`);
  console.log(`- Previous status: ${result.previousStatus}`);
  console.log('- Current status: archived');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
