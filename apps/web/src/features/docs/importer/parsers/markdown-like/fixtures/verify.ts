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
    for (const section of source.body.sections) {
      for (const block of section.blocks) {
        assert.ok(!('line' in block), `${fixture.fileName} should omit parser-only block locations.`);
      }
    }

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
      fixture.expectedNestedHeading,
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

  const raw = await readFixture('valid', 'math-and-table.docs.md');
  const mathSource = parseMarkdownLikeDocsSource(raw);
  const blocks = mathSource.body.sections[0].blocks;
  assert.deepEqual(blocks.map((block) => block.type), [
    'paragraph', 'equation', 'heading', 'quote', 'list', 'table', 'equation', 'code',
  ]);
  const [paragraph, equation, heading, quote, list, table, unnumbered, code] = blocks;
  assert.ok(paragraph.type === 'paragraph');
  assert.deepEqual(paragraph.content?.filter((item) => item.type === 'inlineMath'), [
    { type: 'inlineMath', tex: 'a_1+b_2' },
  ]);
  assert.ok(equation.type === 'equation');
  assert.equal(equation.id, 'eq-m0-01');
  assert.equal(equation.number, 'M0-01');
  assert.match(equation.tex, /\\begin\{aligned\}/);
  assert.doesNotMatch(equation.tex, /\\tag/);
  assert.ok(heading.type === 'heading' && heading.content?.some((item) => item.type === 'inlineMath'));
  assert.equal(heading.text, '令 P 为精确率');
  assert.ok(quote.type === 'quote' && quote.content?.some((item) => item.type === 'inlineMath'));
  assert.ok(list.type === 'list');
  assert.equal(list.items[0], '普通列表项');
  assert.ok(Array.isArray(list.items[1]) && list.items[1].some((item) => item.type === 'inlineMath'));
  assert.ok(table.type === 'table');
  assert.deepEqual(table.align, ['left', 'right', 'center']);
  assert.deepEqual(table.rows[0][0], [{ type: 'inlineMath', tex: 'P(A|B)' }]);
  assert.deepEqual(table.rows[0][2], [{ type: 'link', href: '#eq-m0-01', label: 'M0-01', external: false }]);
  assert.deepEqual(table.rows[1], [
    [{ type: 'inlineMath', tex: 'a\\|b' }],
    [{ type: 'inlineCode', code: 'a|b' }],
    [{ type: 'text', text: '左|右' }],
  ]);
  assert.deepEqual(table.rows[2][1], []);
  assert.ok(unnumbered.type === 'equation' && unnumbered.number === undefined);
  assert.ok(code.type === 'code');
  assert.match(code.code, /^\$\$\n\$literal\$\n/);

  const invalidMathAndTable = raw
    .replace('| $x_1+x_2$ | | 空单元格 |', '| 只有一列 |')
    .replace('x^2\n$$', () => 'x^2\n\\tag{m0-01}\n$$')
    .concat('\n$$\nx');
  const invalidLines = invalidMathAndTable.split('\n');
  assert.deepEqual(parseMarkdownLikeDocument(invalidMathAndTable).issues.map(({ code, line }) => ({ code, line })), [
    { code: 'invalid_table', line: invalidLines.indexOf('| 只有一列 |') + 1 },
    { code: 'duplicate_equation_number', line: invalidLines.indexOf('\\tag{m0-01}') + 1 },
    { code: 'unclosed_equation', line: invalidLines.lastIndexOf('$$') + 1 },
  ]);
}

function flattenOutline(items: DocsOutlineItemModel[]): DocsOutlineItemModel[] {
  return items.flatMap((item) => [item, ...(item.children ? flattenOutline(item.children) : [])]);
}
