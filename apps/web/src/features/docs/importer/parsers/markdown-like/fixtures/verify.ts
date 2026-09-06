import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseMarkdownLikeDocsSource } from '../parse';
import { parseMarkdownLikeDocument } from '../document';
import { MarkdownLikeParseError } from '../errors';
import { buildDocsOutline } from '../../../../shared/outline';
import type { DocsOutlineItemModel } from '../../../../shared/types';
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
    assert.equal(source.meta.routeType, fixture.expectedSource.routeType);
    assert.equal(source.meta.collectionKey, fixture.expectedSource.collectionKey);
    assert.equal(source.meta.collectionSlug, fixture.expectedSource.collectionSlug);
    assert.equal(source.meta.position, fixture.expectedSource.position);
    assert.equal(source.body.sections[0]?.blocks[0]?.type, 'paragraph');

    const outline = buildDocsOutline(source.body.sections);
    for (const [sectionIndex, section] of source.body.sections.entries()) {
      const headingBlocks = section.blocks.filter((block) => block.type === 'heading');
      const outlineHeadings = flattenOutline(outline[sectionIndex]?.children ?? []);

      assert.deepEqual(
        outlineHeadings.map((item) => item.id),
        headingBlocks.map((block) => block.id),
        `${fixture.fileName} should preserve heading anchor IDs in outline order.`,
      );
      assert.deepEqual(
        outlineHeadings.map((item) => item.level),
        headingBlocks.map((block) => block.level),
        `${fixture.fileName} should preserve heading levels in outline order.`,
      );
    }

    const nestedHeadings = outline[0]?.children?.[0]?.children?.[0]?.children;
    assert.equal(
      nestedHeadings?.[0]?.label,
      'Fine detail',
      `${fixture.fileName} should nest level-four headings below level-three headings.`,
    );
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

function flattenOutline(items: DocsOutlineItemModel[]): DocsOutlineItemModel[] {
  return items.flatMap((item) => [item, ...(item.children ? flattenOutline(item.children) : [])]);
}
