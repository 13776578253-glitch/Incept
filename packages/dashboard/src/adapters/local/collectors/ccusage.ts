import 'server-only';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dashboardDate, type SourceDescriptionKey } from '../../../domain';
import type { UnitPricing } from '../types';
import { emptyCollection, normalizeFile, usageEvent } from './common';
import { ccusageBinary } from './ccusage-runtime';

const execute = promisify(execFile);
const agents: Partial<Record<SourceDescriptionKey, string>> = {
  claudeCode: 'claude', codex: 'codex', geminiCli: 'gemini', antigravity: 'antigravity', opencode: 'opencode', zcode: 'zcode',
};
type Runner = (args: string[]) => Promise<string>;
type DailyCacheEntry = { from: string; to: string; expiresAt: number; dates: string[] };
type SessionCacheEntry = { expiresAt: number; value: Record<string, unknown> };
const dailyCache = new Map<string, DailyCacheEntry>();
const sessionCache = new Map<string, SessionCacheEntry>();
const CURRENT_DAY_TTL_MS = 15_000;
const HISTORICAL_SLICE_TTL_MS = 5 * 60_000;
let cacheEpoch = 0;

export function clearCcusageFallbackCache() {
  cacheEpoch += 1;
  dailyCache.clear();
  sessionCache.clear();
}

// Query daily session slices so a fallback never assigns an entire historical
// session to its last active day. Calls remain read-only and use cached pricing.
export async function collectCcusageFallback(sources: SourceDescriptionKey[], window: { from: string; to: string },
  pricing: Map<string, UnitPricing>, coveredSessions: Set<string>, runner?: Runner,
  dateHints?: Partial<Record<SourceDescriptionKey, string[]>>, coveredFiles = new Set<string>()) {
  const result = emptyCollection();
  if (!sources.length) return result;
  const binary = ccusageBinary();
  if (!runner && !binary) { result.errors.push('ccusage is unavailable; retained existing indexed records for unreadable sources.'); return result; }
  const useCache = !runner && !!binary;
  const epoch = cacheEpoch;
  const run: Runner = runner ?? (async args => {
    const isNode = /\.[cm]?js$/i.test(binary!);
    const output = await execute(isNode ? process.execPath : binary!, isNode ? [binary!, ...args] : args,
      { timeout: 10_000, maxBuffer: 32 * 1024 * 1024, windowsHide: true });
    return output.stdout;
  });
  for (const sourceId of sources) {
    const agent = agents[sourceId];
    if (!agent) continue;
    const common = ['--json', '--offline', '--timezone', 'Asia/Singapore'];
    const sourceEvents = [], sourceSessions = new Set<string>();
    try {
      const hints = dateHints?.[sourceId];
      const dailyKey = binary ? `${binary}\0${agent}` : agent;
      const cachedDaily = !hints && useCache ? dailyCache.get(dailyKey) : undefined;
      let discoveredDates: string[] | undefined;
      if (cachedDaily && cachedDaily.expiresAt > Date.now() && cachedDaily.from <= window.from && cachedDaily.to >= window.to) {
        discoveredDates = cachedDaily.dates;
      } else if (!hints) {
        const daily = JSON.parse(await run([agent, 'daily', ...common, '--since', window.from.replaceAll('-', ''), '--until', window.to.replaceAll('-', '')]));
        const rows = daily.daily ?? daily.data;
        discoveredDates = (Array.isArray(rows) ? rows : []).map((row: { date?: unknown }) => row.date)
          .filter((date: unknown): date is string => typeof date === 'string');
        if (useCache && epoch === cacheEpoch && Array.isArray(rows)) {
          dailyCache.set(dailyKey, { from: window.from, to: window.to, expiresAt: Date.now() + CURRENT_DAY_TTL_MS, dates: discoveredDates });
        }
      }
      const days = (hints ?? discoveredDates ?? [])
        .filter((date: unknown): date is string => typeof date === 'string' && date >= window.from && date <= window.to);
      const uniqueDays = [...new Set<string>(days)];
      const slices: Array<{ date: string; value: Record<string, any> }> = [];
      const fetchedSlices: Array<{ date: string; value: Record<string, any> }> = [];
      const uncachedDays: string[] = [];
      for (const date of uniqueDays) {
        const cached = useCache ? sessionCache.get(`${binary}\0${agent}\0${date}`) : undefined;
        if (cached && cached.expiresAt > Date.now()) {
          slices.push({ date, value: cached.value as Record<string, any> });
        } else {
          uncachedDays.push(date);
        }
      }
      for (let index = 0; index < uncachedDays.length; index += 4) {
        const batch = await Promise.all(uncachedDays.slice(index, index + 4).map(async date => ({ date,
          value: JSON.parse(await run([agent, 'session', ...common, '--since', date.replaceAll('-', ''), '--until', date.replaceAll('-', '')])),
        })));
        fetchedSlices.push(...batch);
        slices.push(...batch);
      }
      for (const { date, value } of slices) {
        for (const session of value.sessions ?? value.data ?? []) {
          const sessionId = String(session.sessionId ?? session.session ?? '');
          if (!sessionId || coveredSessions.has(sourceId + ':' + sessionId)) continue;
          if (session.sessionFile && coveredFiles.has(normalizeFile(session.sessionFile))) continue;
          const breakdowns = session.modelBreakdowns ?? session.breakdown ?? (session.models && !Array.isArray(session.models)
            ? Object.entries(session.models).map(([modelName, stats]) => ({ ...(stats as Record<string, unknown>), modelName })) : undefined);
          if (!Array.isArray(breakdowns)) throw new Error('ccusage report lacks per-model session usage');
          for (const model of breakdowns) {
            const modelName = model.modelName ?? model.model;
            if (!modelName) continue;
            sourceEvents.push(usageEvent({ sourceId, sourceLabel: sourceId === 'claudeCode' ? 'Claude Code' : agent === 'gemini' ? 'Gemini CLI' : agent === 'codex' ? 'Codex CLI' : sourceId === 'opencode' ? 'OpenCode' : sourceId === 'zcode' ? 'ZCode' : 'Antigravity',
              sessionId, modelName, timestampMs: Date.parse(date + 'T12:00:00+08:00'),
              timestampPrecision: 'day',
              sessionTitle: session.title, cwd: session.projectPath ?? session.directory ?? session.cwd,
              inputTokens: Number(model.inputTokens ?? 0), outputTokens: Math.max(0, Number(model.outputTokens ?? 0) - Number(model.reasoningOutputTokens ?? 0)),
              reasoningTokens: Number(model.reasoningTokens ?? model.thinkingTokens ?? model.reasoningOutputTokens ?? 0),
              cacheReadTokens: Number(model.cacheReadTokens ?? 0), cacheCreationTokens: Number(model.cacheCreationTokens ?? 0),
              recordedCost: model.missingPricing ? undefined : model.cost ?? model.totalCost ?? model.costUSD }, pricing));
          }
          sourceSessions.add(sourceId + ':' + sessionId);
        }
      }
      if (useCache && epoch === cacheEpoch && fetchedSlices.length) {
        const completedAt = Date.now(), today = dashboardDate(completedAt);
        for (const { date, value } of fetchedSlices) {
          sessionCache.set(`${binary}\0${agent}\0${date}`, {
            expiresAt: completedAt + (date >= today ? CURRENT_DAY_TTL_MS : HISTORICAL_SLICE_TTL_MS),
            value,
          });
        }
      }
      result.events.push(...sourceEvents);
      for (const session of sourceSessions) result.coveredSessions.add(session);
    } catch { result.errors.push('Unable to read ccusage fallback for ' + agent); }
  }
  return result;
}
