import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const project = resolve(process.argv[2] ?? '.worktrees/web-redesign');
const output = resolve(process.argv[3] ?? '.scratch/dashboard-range-audit/owner-reader');
const ranges = (process.argv[4] ?? '7d,30d,all').split(',');
if (ranges.some(range => !['7d', '30d', 'all'].includes(range))) throw Error('Invalid audit range');
mkdirSync(output, { recursive: true });
const pkg = resolve(project, 'packages/dashboard');
const { build } = createRequire(resolve(pkg, 'package.json'))('esbuild');

// Keep all writes and import-store reads within the dedicated probe output.
process.env.INCEPT_DASHBOARD_HOME = process.env.DASHBOARD_AUDIT_SOURCE_HOME ?? homedir();
process.env.INCEPT_DASHBOARD_CACHE_FILE = resolve(output, 'scratch-snapshot.json');
process.env.INCEPT_DASHBOARD_IMPORTS_FILE = resolve(output, 'no-imports.db');
process.env.INCEPT_DASHBOARD_WORKER_FILE = resolve(output, 'worker.mjs');
process.env.INCEPT_SYNC_ENABLED = '0';
process.env.INCEPT_SYNC_REMOTE_ENABLED = '0';
process.env.INCEPT_SYNC_TRUSTED_MODE = '0';

const timer = `
const auditRound = value => Math.round(value * 10) / 10;
const auditSpan = (name, start, details = {}) => {
  console.log(JSON.stringify({stage: name, ms: auditRound(performance.now() - start), ...details}));
};
`;
const adapt = (contents, before, after) => {
  if (!contents.includes(before)) throw Error('Audit stage anchor no longer matches source');
  return contents.replace(before, after);
};
const observe = {
  name: 'dashboard-read-timing',
  setup(builder) {
    builder.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'empty' }));
    builder.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '' }));
    builder.onLoad({ filter: /(?:loader|refresh|snapshot-store|usage-route|ccusage)\.ts$/ }, args => {
      let contents = readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n');
      if (args.path.endsWith('loader.ts')) {
        contents = adapt(contents, 'const now = Date.now();', 'const loadStarted = performance.now(); const now = Date.now();');
        contents = adapt(contents, 'const commandcode = collectCommandCodeEvents(home, pricing);', `
          const sourceStarted = performance.now();
          const commandcode = collectCommandCodeEvents(home, pricing);
          auditSpan('native-commandcode', sourceStarted, { events: commandcode.events.length });
          const agentsStarted = performance.now();`);
        contents = adapt(contents, 'const commandFiles = new Set', `
          auditSpan('native-agents', agentsStarted, { events: agents.events.length });
          const commandFiles = new Set`);
        contents = adapt(contents, '  const snapshot = cachedSnapshot;', `
          auditSpan('raw-ready', loadStarted, { events: cachedSnapshot.events.length, range: options.range });
          const snapshot = cachedSnapshot;
          const filterStarted = performance.now();`);
        contents = adapt(contents, '  const data = summarizeUsageEvents(', `
          auditSpan('select-and-fallback', filterStarted, { selected: selected.length, range });
          const aggregateStarted = performance.now();
          const data = summarizeUsageEvents(`);
        contents = adapt(contents, '  const imported = loadImportedEvents(', `
          const importsStarted = performance.now();
          const imported = loadImportedEvents(`);
        contents = adapt(contents, '  const eligible = ', `
          auditSpan('imports-match', importsStarted, { range, events: imported.events.length });
          const eligible = `);
        contents = adapt(contents, '  const fallback = await collectCcusageFallback(', `
          const fallbackStarted = performance.now();
          const fallback = process.env.DASHBOARD_AUDIT_SKIP_FALLBACK === '1'
            ? { events: [], coveredSessions: new Set(), errors: [] }
            : await collectCcusageFallback(`);
        contents = adapt(contents, '  const selected = eligible.filter', `
          auditSpan('ccusage-fallback', fallbackStarted, { range, sources: snapshot.fallbackSources, added: fallback.events.length,
            errors: fallback.errors.length });
          const selected = eligible.filter`);
        contents = adapt(contents, '  return { ...data, range, checkedAt:', `
          auditSpan('aggregate', aggregateStarted, { sessions: data.sessions.length, models: data.models.length,
            days: data.daily.length, months: data.monthly.length, range });
          return { ...data, range, checkedAt:`);
      } else if (args.path.endsWith('ccusage.ts')) {
        contents = adapt(contents, '  const run: Runner = runner ?? (async args => {', `
          const stats: { type: string; ms: number }[] = [];
          const run: Runner = runner ?? (async args => {
            const start = performance.now();
            try {`);
        contents = adapt(contents, '    return output.stdout;', `
            return output.stdout;
            } finally { stats.push({ type: args[1], ms: auditRound(performance.now() - start) }); }`);
        contents = adapt(contents, '  for (const sourceId of sources) {', `
          for (const sourceId of sources) {
            const sourceStarted = performance.now(), first = stats.length;`);
        contents = adapt(contents, "    } catch { result.errors.push('Unable to read ccusage fallback for ' + agent); }", `
            } catch { result.errors.push('Unable to read ccusage fallback for ' + agent); }
            const calls = stats.slice(first);
            auditSpan('ccusage-source', sourceStarted, { sourceId, calls: calls.length,
              daily: calls.filter(c => c.type === 'daily').length, sessions: calls.filter(c => c.type === 'session').length,
              longestChildMs: Math.max(0, ...calls.map(c => c.ms)), accepted: sourceEvents.length });`);
      } else if (args.path.endsWith('snapshot-store.ts')) {
        // The production routine writes the complete Owner DTO. Suppress the disk
        // write here, while preserving the cost of encoding the returned payload.
        contents = adapt(contents, "  if (!data.range || context.database) return;\n  try { await publish(context, { [data.range]: data }); } catch { /* A cache failure must not discard a completed legacy collection. */ }",
          `  const start = performance.now(); const bytes = Buffer.byteLength(JSON.stringify(data)); auditSpan('publish-encode-only', start, { bytes, range: data.range });`);
      } else if (args.path.endsWith('refresh.ts')) {
        contents = adapt(contents, '  const cached = await readDashboardSnapshot(range);', `
          const lookupStarted = performance.now();
          const cached = await readDashboardSnapshot(range);
          auditSpan('snapshot-lookup', lookupStarted, { range, found: !!cached });`);
      } else if (args.path.endsWith('usage-route.ts')) {
        contents = adapt(contents, "    return Response.json(await refreshDashboardSnapshot({ range: range as UsageRange, force }), {",
          `    const data = await refreshDashboardSnapshot({ range: range as UsageRange, force });
            const start = performance.now();
            const response = Response.json(data, {`);
        contents = adapt(contents, "      headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' },\n    });\n  } catch {",
          `      headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' },
            });
            auditSpan('response-encode', start, { range });
            return response;
          } catch {`);
      }
      return { contents: timer + contents, loader: 'ts', resolveDir: dirname(args.path) };
    });
  },
};

const common = { bundle: true, platform: 'node', format: 'esm', target: 'node24', plugins: [observe] };
await build({ ...common, entryPoints: [resolve(pkg, 'src/adapters/runtime/worker-entry.ts')], outfile: process.env.INCEPT_DASHBOARD_WORKER_FILE });
const runner = resolve(output, 'route.mjs');
await build({ ...common,
  stdin: {
    contents: "export {dashboardUsageGet} from './src/next/usage-route'; export {closeUsageWorker} from './src/adapters/runtime/worker-client';",
    resolveDir: pkg,
    loader: 'ts',
  },
  outfile: runner,
});
const { dashboardUsageGet, closeUsageWorker } = await import(pathToFileURL(runner).href);
const keepAlive = setInterval(() => {}, 1000);
try {
  for (const range of ranges) {
    const start = performance.now();
    const response = await dashboardUsageGet(new Request('http://localhost/api/dashboard/usage?range=' + range), 'fixture-owner');
    const headers = performance.now();
    const stream = await response.arrayBuffer();
    const data = response.ok ? JSON.parse(Buffer.from(stream).toString('utf8')) : undefined;
    console.log(JSON.stringify({ stage: 'owner-handler', range, status: response.status,
      ttfbEquivalentMs: Math.round(headers - start), bytes: stream.byteLength,
      totals: data?.totals, dateRange: data?.dateRange }));
  }
  // Worker log output can be delivered after its response message.
  await new Promise(resolve => setTimeout(resolve, 100));
} finally {
  closeUsageWorker();
  clearInterval(keepAlive);
}
