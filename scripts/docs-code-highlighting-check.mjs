import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const highlighterModule = await import(
  pathToFileURL(
    path.join(projectRoot, 'apps/web/src/features/docs/code-highlighting/highlight-code.ts'),
  ).href,
);

assert.equal(highlighterModule.normalizeDocsCodeLanguage('ts'), 'typescript');
assert.equal(highlighterModule.normalizeDocsCodeLanguage('shell'), 'bash');
assert.equal(highlighterModule.normalizeDocsCodeLanguage('ps1'), 'powershell');
assert.equal(highlighterModule.normalizeDocsCodeLanguage('unknown-language'), null);

const highlighted = await highlighterModule.highlightDocsCode(
  'const value = "three themes";',
  'typescript',
);

assert.ok(highlighted);
assert.equal(highlighted.lines.length, 1);
assert.equal(highlighted.style['--shiki-light'], '#000000');
assert.equal(highlighted.style['--shiki-dark'], '#D4D4D4');
assert.equal(highlighted.style['--shiki-warm'], '#575279');
assert.equal(highlighted.style['--shiki-light-bg'], '#FFFFFF');
assert.equal(highlighted.style['--shiki-dark-bg'], '#1E1E1E');
assert.equal(highlighted.style['--shiki-warm-bg'], '#faf4ed');
assert.ok(
  highlighted.lines[0]?.some((token) => token.style['--shiki-dark'] && token.style['--shiki-warm']),
);

assert.equal(await highlighterModule.highlightDocsCode('plain text', 'unknown-language'), null);

const powerShellHighlight = await highlighterModule.highlightDocsCode(
  'Get-ChildItem -LiteralPath .',
  'pwsh',
);
assert.ok(powerShellHighlight);
assert.equal(powerShellHighlight.lines.length, 1);

for (const palette of ['vscode', 'github', 'vitesse']) {
  const paletteHighlight = await highlighterModule.highlightDocsCode(
    'const palette = true;',
    'ts',
    palette,
  );

  assert.ok(paletteHighlight, `${palette} should highlight TypeScript.`);
  assert.equal(paletteHighlight.style['--shiki-warm-bg'], '#faf4ed');
  assert.ok(paletteHighlight.style['--shiki-light-bg']);
  assert.ok(paletteHighlight.style['--shiki-dark-bg']);
}

console.log('Docs code highlighting checks passed.');
