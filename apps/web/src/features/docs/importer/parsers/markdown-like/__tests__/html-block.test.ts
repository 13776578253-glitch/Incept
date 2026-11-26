import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveDocsImportMedia } from '../../../media';
import { parseMarkdownLikeDocument } from '../document';
import { parseMarkdownLikeDocsSource } from '../parse';

const baseFrontmatter = `---
locale: zh
slug: threejs-demo
title: Three.js Demo
summary: Interactive 3D scene embed test
---

# Visualization
`;

const tempDirs: string[] = [];
const originalDocsContentRoot = process.env.DOCS_CONTENT_ROOT;

afterEach(async () => {
  if (originalDocsContentRoot === undefined) {
    delete process.env.DOCS_CONTENT_ROOT;
  } else {
    process.env.DOCS_CONTENT_ROOT = originalDocsContentRoot;
  }

  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe('markdown-like :::html block', () => {
  it('parses inline :::html blocks with Three.js/HTML tags without triggering unsupported_html', () => {
    const raw = `${baseFrontmatter}
:::html title="Rotating Cube" height="420" caption="Orbiting wireframe cube"
<!doctype html>
<html>
  <body>
    <canvas id="scene"></canvas>
    <script type="module">
      import * as THREE from 'https://esm.sh/three@0.170.0';
      const scene = new THREE.Scene();
      console.log(scene);
    </script>
  </body>
</html>
:::
`;

    const parsed = parseMarkdownLikeDocument(raw);
    expect(parsed.issues).toEqual([]);

    const source = parseMarkdownLikeDocsSource(raw);
    const block = source.body.sections[0]?.blocks[0];
    expect(block?.type).toBe('html');
    if (block?.type === 'html') {
      expect(block.title).toBe('Rotating Cube');
      expect(block.height).toBe(420);
      expect(block.caption).toBe('Orbiting wireframe cube');
      expect(block.html).toContain('<canvas id="scene"></canvas>');
      expect(block.html).toContain("import * as THREE from 'https://esm.sh/three@0.170.0'");
    }
  });

  it('parses single-line and multi-line :::html src attributes', () => {
    const raw = `${baseFrontmatter}
:::html src="./scene.html" height="360" :::

:::html src="./assets/orbit.htm" caption="Orbit demo"
:::
`;

    const parsed = parseMarkdownLikeDocument(raw);
    expect(parsed.issues).toEqual([]);

    const source = parseMarkdownLikeDocsSource(raw);
    const [first, second] = source.body.sections[0]?.blocks ?? [];
    expect(first?.type).toBe('html');
    expect(second?.type).toBe('html');
    if (first?.type === 'html' && second?.type === 'html') {
      expect(first.sourceFile).toBe('./scene.html');
      expect(first.height).toBe(360);
      expect(first.html).toBe('');
      expect(second.sourceFile).toBe('./assets/orbit.htm');
      expect(second.caption).toBe('Orbit demo');
    }
  });

  it('reports invalid and unclosed :::html blocks cleanly', () => {
    const emptyBlock = `${baseFrontmatter}
:::html title="Empty"
:::
`;
    expect(parseMarkdownLikeDocument(emptyBlock).issues.map((item) => item.code)).toEqual([
      'invalid_html',
    ]);

    const bothSrcAndBody = `${baseFrontmatter}
:::html src="./scene.html"
<div>Hello</div>
:::
`;
    expect(parseMarkdownLikeDocument(bothSrcAndBody).issues.map((item) => item.code)).toEqual([
      'invalid_html',
    ]);

    const invalidHeight = `${baseFrontmatter}
:::html height="80"
<div>Too short</div>
:::
`;
    expect(parseMarkdownLikeDocument(invalidHeight).issues.map((item) => item.code)).toEqual([
      'invalid_html',
    ]);

    const unclosed = `${baseFrontmatter}
:::html
<div>Unclosed</div>
`;
    expect(parseMarkdownLikeDocument(unclosed).issues.map((item) => item.code)).toEqual([
      'unclosed_html',
      'empty_section',
    ]);
  });

  it('hydrates local .html assets inside DOCS_CONTENT_ROOT and rejects path traversal', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'incept-html-block-'));
    tempDirs.push(tempRoot);

    const contentRoot = path.join(tempRoot, 'content');
    const articleDir = path.join(contentRoot, 'articles');
    await fs.mkdir(articleDir, { recursive: true });

    const articlePath = path.join(articleDir, 'demo.docs.md');
    const validHtmlPath = path.join(articleDir, 'cube.html');
    const outsideHtmlPath = path.join(tempRoot, 'outside.html');

    await fs.writeFile(articlePath, '# stub\n', 'utf8');
    await fs.writeFile(validHtmlPath, '<div>Cube Visualization</div>', 'utf8');
    await fs.writeFile(outsideHtmlPath, '<div>Secret</div>', 'utf8');

    process.env.DOCS_CONTENT_ROOT = contentRoot;

    const validRaw = `${baseFrontmatter}
:::html src="./cube.html" height="320" :::
`;
    const validParsed = parseMarkdownLikeDocument(validRaw);
    const validSource = parseMarkdownLikeDocsSource(validRaw);
    const validHtmlLines = new Map(
      validParsed.document.sections.flatMap((section) =>
        section.blocks
          .filter((block) => block.type === 'html')
          .map((block) => [block.id, block.line] as const),
      ),
    );

    const resolvedValid = await resolveDocsImportMedia({
      source: validSource,
      sourceFilePath: articlePath,
      imageLinesById: new Map(),
      htmlLinesById: validHtmlLines,
      mode: 'validate',
    });

    expect(resolvedValid.issues).toEqual([]);
    const resolvedBlock = resolvedValid.source.body.sections[0]?.blocks[0];
    expect(resolvedBlock?.type).toBe('html');
    if (resolvedBlock?.type === 'html') {
      expect(resolvedBlock.html).toBe('<div>Cube Visualization</div>');
      expect(resolvedBlock.sourceFile).toBe('./cube.html');
    }

    const traversalRaw = `${baseFrontmatter}
:::html src="../../outside.html" :::
`;
    const traversalParsed = parseMarkdownLikeDocument(traversalRaw);
    const traversalSource = parseMarkdownLikeDocsSource(traversalRaw);
    const traversalLines = new Map(
      traversalParsed.document.sections.flatMap((section) =>
        section.blocks
          .filter((block) => block.type === 'html')
          .map((block) => [block.id, block.line] as const),
      ),
    );

    const resolvedTraversal = await resolveDocsImportMedia({
      source: traversalSource,
      sourceFilePath: articlePath,
      imageLinesById: new Map(),
      htmlLinesById: traversalLines,
      mode: 'validate',
    });

    expect(resolvedTraversal.issues.map((issue) => issue.code)).toEqual([
      'local_html_path_outside_root',
    ]);
  });
});
