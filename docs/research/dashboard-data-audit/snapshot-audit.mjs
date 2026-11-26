import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';

const measuredFields = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheCreationTokens', 'reasoningTokens', 'totalTokens'];
const count = (rows, field = 'totalTokens') => rows.reduce((sum, row) => sum + (row[field] ?? 0), 0);
const close = (left, right) => Math.abs(left - right) < 1e-8 * Math.max(1, Math.abs(left), Math.abs(right));
const dayAt = (iso) => new Date(Date.parse(iso) + 8 * 3_600_000).toISOString().slice(0, 10);
const dayString = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value : undefined;
const input = process.argv[2] ?? process.env.INCEPT_DASHBOARD_CACHE_FILE ?? join(homedir(), '.incept', 'dashboard-snapshots.json');
const bytes = readFileSync(input);
const parseStart = performance.now();
const stored = JSON.parse(bytes.toString('utf8'));
const result = { fileBytes: bytes.byteLength, parseMs: Math.round(performance.now() - parseStart), windows: {} };

for (const range of ['all', '30d', '14d', '7d']) {
  const data = stored.snapshots?.[range];
  if (!data?.totals || !data.dateRange) continue;
  const started = performance.now();
  const serialized = JSON.stringify(data);
  const serializeMs = Math.round(performance.now() - started);
  const { totals, costs, dateRange, daily, monthly, models, sources, sessions, projects } = data;
  const activeModels = models.filter(row => row.slotStatus !== 'configured' && row.totalTokens > 0);
  const peak = daily.filter(row => row.date < dateRange.to).reduce((best, row) => !best || row.totalTokens > best.totalTokens ? row : best, null);
  const endDay = daily.find(row => row.date === dateRange.to);
  const prompt = totals.inputTokens + totals.cacheReadTokens + totals.cacheCreationTokens;
  const topTokens = count([...activeModels].sort((a, b) => b.totalTokens - a.totalTokens).slice(0, 5));
  const safeDay = (row) => row ? { day: dayString(row.date), tokens: row.totalTokens } : null;
  const sourceIds = ['antigravity', 'codex', 'commandcode', 'deepseekHarness', 'claudeCode', 'opencode', 'geminiCli', 'zcode'];
  const collectionModes = ['native', 'ccusage', 'indexed', 'imported', 'mixed'];
  result.windows[range] = {
    from: dayString(dateRange.from), to: dayString(dateRange.to), activeDays: dateRange.activeDays,
    calendarDays: dateRange.calendarDays, revision: Number.isSafeInteger(data.sync?.dataRevision) ? data.sync.dataRevision : null,
    checkedUtcDate: dayString(data.checkedAt?.slice(0, 10)), checkedDashboardDate: data.checkedAt ? dayAt(data.checkedAt) : null,
    tokens: Object.fromEntries(measuredFields.map(key => [key, totals[key]])),
    measuredModels: activeModels.length, configuredSlots: models.filter(row => row.slotStatus === 'configured').length,
    sessions: sessions.length, projects: projects.length, dailyRows: daily.length, monthlyRows: monthly.length,
    sourceModes: sources.filter(row => sourceIds.includes(row.sourceId) && row.totalTokens > 0).map(row => ({ source: row.sourceId,
      mode: collectionModes.includes(row.collectionMode) ? row.collectionMode : null, tokens: row.totalTokens })),
    anonymousSessionEvidence: {
      crossDay: sessions.filter(row => dayAt(row.firstActivity) !== dayAt(row.lastActivity)).length,
      multiModel: sessions.filter(row => row.modelsUsed.length > 1).length,
      dayMarked: sessions.filter(row => row.timestampPrecision === 'day').length,
      dayMarkedSessionTokens: count(sessions.filter(row => row.timestampPrecision === 'day')),
      incomplete: sessions.filter(row => row.historyIncomplete === true).length,
    },
    coverage: { priced: costs.pricedTokens, unpriced: costs.unpricedTokens, unpricedModelGroups: costs.unpricedModels.length,
      tokenCoverage: costs.tokenCoverageRate, legacyCostUsd: costs.totalCost },
    historicalPeak: safeDay(peak), endingDay: safeDay(endDay),
    top5: { tokens: topTokens, others: totals.totalTokens - topTokens },
    checks: {
      components: count(measuredFields.slice(0, -1).map(key => ({ totalTokens: totals[key] }))) === totals.totalTokens,
      groupTokenFields: Object.fromEntries(Object.entries({ daily, monthly, models, sources, projects, sessions })
        .map(([group, rows]) => [group, measuredFields.every(key => count(rows, key) === totals[key])])),
      dailyToMonth: monthly.every(month => measuredFields.every(key => count(daily.filter(day => day.date.startsWith(month.month)), key) === month[key])),
      partitionedCost: [daily, monthly, models, sources, projects, sessions].every(rows => close(count(rows, 'cost'), totals.cost)),
      coverage: costs.pricedTokens + costs.unpricedTokens === totals.totalTokens && count(costs.unpricedModels) === costs.unpricedTokens,
      cacheHitRate: close(totals.cacheHitRate, prompt > 0 ? totals.cacheReadTokens / prompt : 0),
      outputToInputRatio: close(totals.outputToInputRatio, prompt > 0 ? (totals.outputTokens + totals.reasoningTokens) / prompt : 0),
      modelShares: close(count(activeModels, 'shareOfTokens'), totals.totalTokens > 0 ? 1 : 0),
      sessionsAndProjects: totals.sessionCount === sessions.length && totals.projectCount === projects.length,
    },
    payload: { jsonBytes: Buffer.byteLength(serialized), gzipBytes: gzipSync(serialized).byteLength, serializeMs,
      summaryBytes: Buffer.byteLength(JSON.stringify({ ...data, projects: [], sessions: [], collectionIssues: undefined, sync: undefined })),
      detailBytes: Buffer.byteLength(JSON.stringify({ projects, sessions })) },
  };
}

console.log(JSON.stringify(result, null, 2));
