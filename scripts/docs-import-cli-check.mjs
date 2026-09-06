import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'incept-docs-import-'));

const singleSource = `---
documentKey: cli-single-check
locale: zh
slug: cli-single-check
title: CLI single check
summary: Verifies the single article import command.
---

# Introduction

This is a CLI import check.
`;

const collectionArticle = (documentKey, slug, title, position) => `---
documentKey: ${documentKey}
locale: zh
routeType: collectionArticle
slug: ${slug}
title: ${title}
summary: Verifies the collection directory import command.
collectionKey: cli-collection-check
collectionSlug: cli-collection-check
collectionTitle: CLI collection check
position: ${position}
---

# ${title}

This is a collection article CLI check.
`;

function write(relativePath, contents) {
  const filePath = path.join(contentRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf8');
  return filePath;
}

function run(args) {
  return execFileSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['--filter', '@incept/db', 'exec', 'tsx', '../../scripts/docs-import.mjs', ...args],
    {
      cwd: projectRoot,
      env: { ...process.env, DOCS_CONTENT_ROOT: contentRoot },
      encoding: 'utf8',
      shell: process.platform === 'win32',
    },
  );
}

try {
  const singlePath = write('single-check.docs.md', singleSource);
  const collectionDirectory = path.join(contentRoot, 'cli-collection-check');
  write('cli-collection-check/01-overview.docs.md', collectionArticle(
    'cli-collection-overview',
    'cli-collection-overview',
    'Overview',
    1,
  ));
  write('cli-collection-check/02-guides/01-principal.docs.md', collectionArticle(
    'cli-collection-principal',
    'cli-collection-principal',
    'Principal',
    1,
  ));

  const singleOutput = run(['--file', singlePath, '--dry-run']);
  assert.match(singleOutput, /Docs import draft created/);
  assert.match(singleOutput, /Errors: 0/);
  assert.match(singleOutput, /Dry run: no draft file was written\./);

  const collectionOutput = run(['--dir', collectionDirectory, '--dry-run']);
  assert.match(collectionOutput, /Docs collection directory scan/);
  assert.match(collectionOutput, /Collection key: cli-collection-check/);
  assert.match(collectionOutput, /Articles: 2/);
  assert.match(collectionOutput, /01 overview\.docs\.md \(article\)/);
  assert.match(collectionOutput, /02 guides \(folder\)/);
  assert.match(collectionOutput, /Errors: 0/);

  console.log('Docs import CLI checks passed');
} finally {
  fs.rmSync(contentRoot, { recursive: true, force: true });
}
