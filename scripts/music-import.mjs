// 纯转发（Phase 4）：用法与参数由包内 CLI 定义并逐字保留；路径知识留在本脚本（决策 13）
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { musicMirrorDirectory } from './music-paths.mjs';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;

const command = [
  'pnpm', '--filter', '@incept/music', 'exec', 'tsx', 'src/cli/import.ts',
  '--env-file', quote(path.join(projectRoot, 'apps', 'web', '.env.local')),
  '--mirror', quote(musicMirrorDirectory(projectRoot)),
  ...process.argv.slice(2).map(quote),
].join(' ');

const result = spawnSync(command, { stdio: 'inherit', shell: true, cwd: projectRoot });

process.exit(result.status ?? 1);
