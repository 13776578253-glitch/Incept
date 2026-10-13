import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist/dashboard-usage-worker.mjs');
const result = await build({ entryPoints: [join(root, 'src/adapters/runtime/worker-entry.ts')], outfile: output, write: false,
  bundle: true, platform: 'node', format: 'esm', target: 'node22',
  plugins: [{ name: 'server-only-marker', setup(builder) {
    builder.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'empty' }));
    builder.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '', loader: 'js' }));
  } }] });
await mkdir(join(root, 'dist'), { recursive: true });
const temporary = output + '.' + randomUUID() + '.tmp';
try {
  await writeFile(temporary, result.outputFiles[0].contents, { flag: 'wx' });
  await rename(temporary, output);
} finally { await unlink(temporary).catch(() => {}); }
console.log('Dashboard collection worker built');
