// CLI 转发器：用法与参数由 @incept/music/cli 定义并逐字保留；路径知识留在本脚本（决策 13）
// history: 原独立 CLI 脚本已迁入包内，本脚本退化为纯转发层
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
