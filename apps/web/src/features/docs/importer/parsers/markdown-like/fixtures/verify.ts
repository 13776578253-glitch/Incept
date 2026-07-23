import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseMarkdownLikeDocsSource } from '../parse';
import { parseMarkdownLikeDocument } from '../document';
import { MarkdownLikeParseError } from '../errors';
import { invalidMarkdownLikeFixtures, validMarkdownLikeFixtures } from './manifest';

const fixturesDirectory = path.dirname(fileURLToPath(import.meta.url));

async function readFixture(kind: 'valid' | 'invalid', fileName: string) {
  return readFile(path.join(fixturesDirectory, kind, fileName), 'utf8');
}

export async function runMarkdownLikeFixtureChecks() {
  for (const fixture of validMarkdownLikeFixtures) {
    const raw = await readFixture('valid', fixture.fileName);
    const parsed = parseMarkdownLikeDocument(raw);

    assert.deepEqual(parsed.issues, [], `${fixture.fileName} should parse without issues.`);
    assert.deepEqual(
      parsed.document.sections.map((section) => section.id),
      fixture.expectedSectionIds,
      `${fixture.fileName} should preserve section IDs.`,
    );
    assert.deepEqual(
      parsed.document.sections.flatMap((section) => section.blocks.map((block) => block.type)),
      fixture.expectedBlockTypes,
      `${fixture.fileName} should preserve block types.`,
    );

    const source = parseMarkdownLikeDocsSource(raw);
    assert.equal(source.meta.locale, fixture.expectedSource.locale);
    assert.equal(source.meta.slug, fixture.expectedSource.slug);
    assert.equal(source.meta.documentKey, fixture.expectedSource.documentKey);
    assert.equal(source.meta.accessRole, fixture.expectedSource.accessRole);
    assert.equal(source.body.sections[0]?.blocks[0]?.type, 'paragraph');
  }

  for (const fixture of invalidMarkdownLikeFixtures) {
    const raw = await readFixture('invalid', fixture.fileName);
    const parsed = parseMarkdownLikeDocument(raw);
    const issueShape = parsed.issues.map(({ code, line }) => ({ code, line }));

    assert.deepEqual(issueShape, fixture.expectedIssues, `${fixture.fileName} should report issues.`);
    assert.throws(
      () => parseMarkdownLikeDocsSource(raw),
      (error: unknown) => error instanceof MarkdownLikeParseError,
      `${fixture.fileName} should reject its public parser entry point.`,
    );
  }
}
