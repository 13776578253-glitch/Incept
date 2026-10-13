import { build } from 'esbuild';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist');
await mkdir(output, { recursive: true });
await build({ entryPoints: [join(root, 'src/adapters/local/imports/cli.ts')], outfile: join(output, 'dashboard-data.mjs'),
  platform: 'node', target: 'node22', format: 'esm', bundle: true,
  plugins: [{ name: 'server-only-marker', setup(builder) {
    builder.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'empty' }));
    builder.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '', loader: 'js' }));
  } }] });
await writeFile(join(output, 'export-tokens.cmd'), `@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\nwhere node >nul 2>nul\r\nif errorlevel 1 (\r\n  echo Install Node.js 24 LTS first, then run this script again.\r\n  pause\r\n  exit /b 1\r\n)\r\nif "%~1"=="" (\r\n  node "%~dp0dashboard-data.mjs" export\r\n  if errorlevel 1 (echo Export failed.) else (echo Export complete. Copy the token-export JSON to your dashboard computer.)\r\n  pause\r\n) else (\r\n  node "%~dp0dashboard-data.mjs" %*\r\n)\r\n`);
await copyFile(join(root, 'tools/TRANSFER.md'), join(output, 'TRANSFER.md'));
console.log('Portable files created in ' + output);
