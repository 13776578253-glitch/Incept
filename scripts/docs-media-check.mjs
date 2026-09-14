import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'incept-docs-media-'));
const previousContentRoot = process.env.DOCS_CONTENT_ROOT;
const generatedMediaPaths = [];

function sourceFor(imageSrc) {
  return `---
locale: en
slug: media-check
title: Media check
summary: Verifies local media resolution.
---

# Media

![First image](${imageSrc})
![Second image](${imageSrc})
`;
}

async function writeSource(name, imageSrc) {
  const sourcePath = path.join(tempRoot, name);
  await fs.writeFile(sourcePath, sourceFor(imageSrc), 'utf8');
  return sourcePath;
}

try {
  const importerModule = await import(
    pathToFileURL(
      path.join(projectRoot, 'apps/web/src/features/docs/importer/source-loader.ts'),
    ).href,
  );

  const assetsDirectory = path.join(tempRoot, 'assets');
  await fs.mkdir(assetsDirectory);
  await fs.writeFile(path.join(assetsDirectory, 'diagram.png'), crypto.randomBytes(64));
  await fs.writeFile(path.join(assetsDirectory, 'not-an-image.txt'), 'not an image');

  process.env.DOCS_CONTENT_ROOT = tempRoot;
  const validSourcePath = await writeSource('valid.docs.md', './assets/diagram.png');
  const dryRun = await importerModule.loadDocsImportSource('valid.docs.md', {
    mediaMode: 'validate',
  });

  assert.deepEqual(dryRun.issues, []);
  assert.equal(dryRun.media.operations.length, 1);
  assert.equal(dryRun.media.operations[0]?.status, 'publish');
  assert.match(dryRun.media.operations[0]?.targetUrl ?? '', /^\/_docs-media\/[a-f0-9]{64}\.png$/);
  assert.equal(
    dryRun.source.body.sections[0]?.blocks.filter((block) => block.type === 'image')[0]?.src,
    dryRun.media.operations[0]?.targetUrl,
  );

  const conventionSourcePath = await writeSource('convention.docs.md', 'diagram.png');
  const convention = await importerModule.loadDocsImportSource(conventionSourcePath, {
    mediaMode: 'validate',
  });
  assert.deepEqual(convention.issues, []);
  assert.equal(convention.media.operations[0]?.targetUrl, dryRun.media.operations[0]?.targetUrl);

  const published = await importerModule.loadDocsImportSource(validSourcePath, {
    mediaMode: 'publish',
  });
  assert.deepEqual(published.issues, []);
  assert.equal(published.media.operations[0]?.status, 'publish');
  const generatedPath = path.join(
    projectRoot,
    'apps/web/public',
    published.media.operations[0]?.targetUrl.slice(1) ?? '',
  );
  generatedMediaPaths.push(generatedPath);
  await fs.access(generatedPath);

  const reused = await importerModule.loadDocsImportSource(validSourcePath, {
    mediaMode: 'validate',
  });
  assert.equal(reused.media.operations[0]?.status, 'reuse');

  const externalSourcePath = await writeSource('external.docs.md', 'https://example.com/diagram.png');
  const external = await importerModule.loadDocsImportSource(externalSourcePath, {
    mediaMode: 'validate',
  });
  assert.deepEqual(external.issues, []);
  assert.deepEqual(external.media.operations, []);

  const unsupportedSourcePath = await writeSource('unsupported.docs.md', './assets/not-an-image.txt');
  const unsupported = await importerModule.loadDocsImportSource(unsupportedSourcePath, {
    mediaMode: 'validate',
  });
  assert.equal(unsupported.issues[0]?.code, 'unsupported_local_media_type');
  assert.equal(unsupported.issues[0]?.path, 'source.line:10');

  const traversalSourcePath = await writeSource('traversal.docs.md', '../../outside.png');
  const traversal = await importerModule.loadDocsImportSource(traversalSourcePath, {
    mediaMode: 'validate',
  });
  assert.equal(traversal.issues[0]?.code, 'local_media_path_outside_root');

  delete process.env.DOCS_CONTENT_ROOT;
  const missingRoot = await importerModule.loadDocsImportSource(validSourcePath, {
    mediaMode: 'validate',
  });
  assert.equal(missingRoot.issues[0]?.code, 'markdown_like_media_configuration');

  console.log('Docs media checks passed.');
} finally {
  for (const generatedPath of generatedMediaPaths) {
    await fs.rm(generatedPath, { force: true });
  }
  await fs.rm(tempRoot, { recursive: true, force: true });

  if (previousContentRoot === undefined) {
    delete process.env.DOCS_CONTENT_ROOT;
  } else {
    process.env.DOCS_CONTENT_ROOT = previousContentRoot;
  }
}
