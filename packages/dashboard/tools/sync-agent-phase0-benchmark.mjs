// Run from any directory: node packages/dashboard/tools/sync-agent-phase0-benchmark.mjs [--local]
// Builds a read-only collector harness; all generated sources and DB writes stay in .scratch.
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { cpus, totalmem } from 'node:os';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const directory = join(root, '.scratch', 'sync-agent-phase0', 'benchmark-' + Date.now());
await mkdir(directory, { recursive: true });
const runner = join(directory, 'runner.mjs');
await build({ entryPoints: [fileURLToPath(new URL('../src/__tests__/fixtures/sync-agent-phase0-benchmark.ts', import.meta.url))],
  outfile: runner, platform: 'node', target: 'node24', format: 'esm', bundle: true,
  plugins: [{ name: 'server-only-marker', setup(builder) {
    builder.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'empty' }));
    builder.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '', loader: 'js' }));
  } }] });
const report = { measuredAt: new Date().toISOString(), platform: process.platform, node: process.version,
  logicalCpus: cpus().length, totalMemoryMiB: Math.round(totalmem() / 1024 / 1024),
  notes: ['Synthetic fixtures; receiver writes isolated in .scratch.', 'Each measurement runs in a fresh process after fixture preparation.',
    'Peak CPU sampled every 20ms in worker; one full logical core is 100%; sampler overhead included.',
    'Kernel peak RSS includes startup and sampler; wall/CPU includes export hashing, validation and serialization.',
    'Warm filesystem caches; three repetitions. local-scan covers current readable home, not a guaranteed maximum history.'], results: [] };
async function run(mode, path, size) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=2048', runner, mode, path, String(size)], {
      cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000,
    });
    let stdout = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.resume(); // Do not print raw source exceptions or private paths.
    child.on('error', () => reject(new Error('Benchmark process could not start')));
    child.on('close', code => {
      if (code !== 0) return reject(new Error('Benchmark process failed: ' + mode));
      resolve(stdout.trim() ? JSON.parse(stdout.trim()) : undefined);
    });
  });
}
async function measure(mode, path, size) {
  for (let repeat = 1; repeat <= 3; repeat++) {
    const row = { ...(await run(mode, path, size)), repeat };
    report.results.push(row); console.log(JSON.stringify(row));
    await writeFile(join(directory, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  }
}
for (const size of [100, 1000, 10000, 22800]) {
  const home = join(directory, 'scan-' + size);
  await run('prepare-scan', home, size); await measure('scan', home, size);
}
for (const size of [1, 10, 100, 288]) {
  const home = join(directory, 'store-' + size);
  await run('prepare-store', home, size);
  await measure('read-batches', home, size); await measure('load-imports', home, size);
}
if (process.argv.includes('--local')) await measure('local-scan', directory, 1);
console.log('Report: ' + join(directory, 'results.json'));
