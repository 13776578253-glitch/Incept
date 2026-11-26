import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const requireDashboard = createRequire(new URL('../../../packages/dashboard/package.json', import.meta.url));
const { build } = requireDashboard('esbuild');
const asOf = process.argv[2] ?? '2026-11-24T20:00:00+08:00';
if (!Number.isFinite(Date.parse(asOf))) throw new Error('Expected an ISO as-of timestamp');

const entry = `
import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { collectCommandCodeEvents } from './packages/dashboard/src/adapters/local/collectors/commandcode';
import { collectAiusageAndRawAgentEvents } from './packages/dashboard/src/adapters/local/collectors/agents';
import { normalizeFile } from './packages/dashboard/src/adapters/local/collectors/common';
import { dashboardDate, dateWindow } from './packages/dashboard/src/domain/window';
import { summarizeUsageEvents } from './packages/dashboard/src/adapters/local/aggregation/summarize';

export function audit(asOf) {
  const cutoff = Date.parse(asOf);
  const home = homedir();
  const prices = new Map();
  const command = collectCommandCodeEvents(home, prices);
  const agents = collectAiusageAndRawAgentEvents(home, prices);
  const nativeCommandFiles = new Set(command.events.flatMap(event => event.sourceFile ? [normalizeFile(event.sourceFile)] : []));
  const remaining = agents.events.filter(event => event.sourceId !== 'commandcode' || !event.sourceFile
    || !nativeCommandFiles.has(normalizeFile(event.sourceFile)));
  const total = event => event.inputTokens + event.outputTokens + event.cacheReadTokens + event.cacheCreationTokens + event.reasoningTokens;
  const events = [...command.events, ...remaining].filter(event => event.timestampMs > 0 && event.timestampMs <= cutoff && total(event) > 0);
  const bySource = {};
  const mtimeByFile = new Map();
  const hour = ms => Math.floor(ms / 3_600_000);
  for (const event of events) {
    const source = bySource[event.sourceId] ??= { events: 0, tokens: 0, dayTagged: 0, intervalSameHour: 0,
      intervalCrossHour: 0, intervalCrossDay: 0, other: 0, observedSourceTimeEvents: 0, observedSourceTimeTokens: 0,
      possibleMtimeFallbackEvents: 0, unknownSourceTimeEvents: 0 };
    const tokens = total(event);
    source.events++;
    source.tokens += tokens;
    if (event.timestampPrecision === 'day') source.dayTagged += tokens;
    else if (event.usageInterval) {
      const after = event.usageInterval.afterTimestampMs;
      if (hour(after) === hour(event.timestampMs)) source.intervalSameHour += tokens;
      else source.intervalCrossHour += tokens;
      if (dashboardDate(after) !== dashboardDate(event.timestampMs)) source.intervalCrossDay += tokens;
    } else source.other += tokens;
    // These two current parsers use source time or the source file mtime. Coincident
    // values are conservatively treated as potential fallback, not attributed.
    const mayUseMtime = event.sourceId === 'commandcode' || event.sourceId === 'geminiCli';
    if (mayUseMtime && event.sourceFile && !mtimeByFile.has(event.sourceFile)) {
      try { mtimeByFile.set(event.sourceFile, statSync(event.sourceFile).mtimeMs); }
      catch { mtimeByFile.set(event.sourceFile, null); }
    }
    const mtime = mayUseMtime && event.sourceFile ? mtimeByFile.get(event.sourceFile) : null;
    if (event.sourceId === 'deepseekHarness' || (typeof mtime === 'number' && mtime !== event.timestampMs)) {
      source.observedSourceTimeEvents++;
      source.observedSourceTimeTokens += tokens;
    } else if (typeof mtime === 'number') source.possibleMtimeFallbackEvents++;
    else source.unknownSourceTimeEvents++;
  }
  const first = events.map(event => event.dateKey).sort()[0];
  const windows = {};
  for (const range of ['all', '30d', '7d']) {
    const window = dateWindow(range, cutoff, first);
    const selected = events.filter(event => event.dateKey >= window.from && event.dateKey <= window.to);
    const data = summarizeUsageEvents(selected, home, prices, 0, window);
    const peak = data.daily.filter(day => day.date < window.to)
      .reduce((best, day) => !best || day.totalTokens > best.totalTokens ? day : best, null);
    const ending = data.daily.at(-1);
    windows[range] = { window, tokens: data.totals.totalTokens,
      totalViaDays: data.daily.reduce((sum, day) => sum + day.totalTokens, 0),
      sessions: data.sessions.length, projects: data.projects.length,
      peak: peak && [peak.date, peak.totalTokens], ending: ending && [ending.date, ending.totalTokens],
      zeroDays: data.daily.filter(day => !day.totalTokens).length };
  }
  return { fixedAsOf: new Date(cutoff).toISOString(), bySource, windows,
    indexedEvents: agents.fallbackEvents.length, sourceIssueCount: agents.errors.length + command.errors.length };
}
`;

try {
  const result = await build({ stdin: { contents: entry, resolveDir: root, loader: 'ts' }, bundle: true,
    platform: 'node', format: 'esm', write: false, logLevel: 'silent',
    alias: { 'server-only': fileURLToPath(new URL('../../../packages/dashboard/src/__tests__/server-only-stub.ts', import.meta.url)) } });
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].contents).toString('base64');
  const { audit } = await import(moduleUrl);
  const started = performance.now();
  const data = audit(asOf);
  console.log(JSON.stringify({ ...data, wallMs: Math.round(performance.now() - started),
    processPeakRssMiB: Math.round(process.resourceUsage().maxRSS / 1024) }, null, 2));
} catch (error) {
  console.error('Local collector audit failed', error.name);
  process.exitCode = 1;
}
