import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const fixtureModule = await import(
  pathToFileURL(
    path.join(
      projectRoot,
      'apps/web/src/features/docs/importer/parsers/markdown-like/fixtures/verify.ts',
    ),
  ).href,
);

await fixtureModule.runMarkdownLikeFixtureChecks();
console.log('Markdown-like parser fixtures passed.');
