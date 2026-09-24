// @vitest-environment node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)), '..');

function runCli(entry: string, args: string[]) {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const command = ['pnpm', 'exec', 'tsx', path.join('src', 'cli', entry), ...args.map(quote)].join(' ');

  return spawnSync(command, { cwd: packageRoot, encoding: 'utf8', shell: true });
}

// 最小 CLI smoke（验收 C5）：--help 退出码 0、未知参数退出码 1；用法文案逐字保持
describe('cli smoke', () => {
  for (const entry of ['manifest.ts', 'import.ts', 'cleanup.ts']) {
    it(`${entry} answers --help with exit code 0`, () => {
      const result = runCli(entry, ['--help']);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`pnpm music:${entry.replace('.ts', '')}`);
    });

    it(`${entry} rejects an unknown argument with exit code 1`, () => {
      const result = runCli(entry, ['--bogus']);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Unknown argument: --bogus');
    });
  }
});
