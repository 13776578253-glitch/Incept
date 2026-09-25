// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

// core 纯度守卫（折叠前提条件）：core 是纯逻辑状态机，源文件只允许本目录相对导入。
// 独立包时代由空 dependencies + types: [] 在模块解析层拒绝一切外部包（实测折叠后 TS2307 3→0，
// 禁令是清零而非降级），故本守卫是物理外壳拆除的执法替代：违规即红。
const coreDir = path.join(import.meta.dirname, '..', 'core');

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

function resolvesInsideCore(file: string, specifier: string): boolean {
  const resolved = path.resolve(coreDir, path.dirname(file), specifier);

  return resolved === coreDir || resolved.startsWith(coreDir + path.sep);
}

function checkFiles(files: string[], relativeDir: string, allowNodeBuiltins: boolean) {
  for (const name of files) {
    const file = path.join(relativeDir, name);
    const specifiers = importSpecifiers(fs.readFileSync(file, 'utf8'));

    for (const specifier of specifiers) {
      if (allowNodeBuiltins && specifier.startsWith('node:')) continue;

      // 裸名（react、node_modules 包）一律拒绝：path.resolve 会把裸名当相对段解析，必须先卡相对性
      expect(
        specifier.startsWith('.'),
        `${name} imports "${specifier}" — core only accepts ${allowNodeBuiltins ? './-relative and node: builtins' : './-relative imports'}`,
      ).toBe(true);
      expect(
        resolvesInsideCore(path.relative(coreDir, file), specifier),
        `${name} imports "${specifier}" — the import escapes the core directory`,
      ).toBe(true);
    }
  }
}

it('core source files import nothing outside their own directory', () => {
  const files = fs.readdirSync(coreDir).filter((name) => name.endsWith('.ts'));

  expect(files.length).toBeGreaterThan(0);
  checkFiles(files, coreDir, false);
});

it('core tests may only add node: builtins on top', () => {
  const testDir = path.join(coreDir, '__tests__');
  const files = fs.readdirSync(testDir).filter((name) => name.endsWith('.ts'));

  expect(files.length).toBeGreaterThan(0);
  checkFiles(files, testDir, true);
});
