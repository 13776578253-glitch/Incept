import 'server-only';
import { readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { type UnitPricing, type RawUsageEvent } from '../types';
import { lookupPricing, computeCostFromPricing, canPriceUsage } from '../pricing';
import { toLocalDateAndMonth, resolveProjectFromPath } from '../normalization';
import { walkFiles } from '../files';
import { hash } from '../imports/identity';

export function collectCodexEvents(home: string, pricingMap: Map<string, UnitPricing>, _ingestedFiles: Set<string>) {
  const events: RawUsageEvent[] = [];
  const parsedFiles = new Set<string>();
  type Watermark = { totals?: Record<string, number>; historyIncomplete?: boolean };
  const seen = new Map<string, Watermark>();
  const samples: Array<{ sessionId: string; currentModel: string; currentCwd: string; filePath: string;
    lineIndex: number; timestamp?: string; timestampMs: number; estimated: boolean; total?: Record<string, number>; last: Record<string, number>; hasLast: boolean }> = [];
  let unreadable = 0, malformed = 0, estimatedTimes = 0;
  let incompleteStarts = 0, uncertainStarts = 0, unlocatedTokens = 0;
  let latestMtimeMs = 0;

  const codexDirs = [
    join(home, '.codex', 'sessions'),
    join(home, '.codex', 'archived_sessions'),
  ];

  for(const dir of codexDirs) {
    const jsonlFiles = walkFiles(dir, (f) => f.endsWith('.jsonl') || f.endsWith('.jsonl.zst'), () => unreadable++);
    for(const filePath of jsonlFiles) {
      const normPath = filePath.toLowerCase().replace(/\//g, '\\');

      let content = '';
      let fileMtimeMs = Date.now();
      try {
        const st = statSync(filePath);
        fileMtimeMs = st.mtimeMs;
        if(st.mtimeMs > latestMtimeMs) latestMtimeMs = st.mtimeMs;
        content = filePath.endsWith('.zst') ? zstdDecompressSync(readFileSync(filePath)).toString('utf8') : readFileSync(filePath, 'utf8');
      } catch {
        unreadable++;
        continue;
      }

      let currentModel = 'unknown';
      let currentCwd = '';
      let sessionId = basename(filePath.replace(/\.zst$/, ''), '.jsonl').replace(/^rollout-/, '');

      for(const [lineIndex, line] of content.split('\n').entries()) {
        if(!line.trim()) continue;
        try {
          const obj = JSON.parse(line) as {
            timestamp?: string;
            type?: string;
            payload?: {
              id?: string;
              cwd?: string;
              model?: string;
              type?: string;
              info?: {
                last_token_usage?: {
                  input_tokens?: number;
                  cached_input_tokens?: number;
                  output_tokens?: number;
                  reasoning_output_tokens?: number;
                };
                total_token_usage?: Record<string, number>;
              };
            };
          };
          if(obj.type === 'session_meta') {
            if(obj.payload?.id) sessionId = obj.payload.id;
            if(obj.payload?.cwd) currentCwd = obj.payload.cwd;
          } else if(obj.type === 'turn_context') {
            if(obj.payload?.model) currentModel = obj.payload.model;
            if(obj.payload?.cwd) currentCwd = obj.payload.cwd;
          } else if(
            obj.type === 'event_msg' &&
            obj.payload?.type === 'token_count' &&
            (obj.payload.info?.last_token_usage || obj.payload.info?.total_token_usage)
          ) {
            const total = obj.payload.info!.total_token_usage;
            const last = obj.payload.info!.last_token_usage ?? {};
            parsedFiles.add(normPath);
            if (filePath.endsWith('.zst')) parsedFiles.add(normPath.slice(0, -4));
            const ts = obj.timestamp ? Date.parse(obj.timestamp) : fileMtimeMs;
            const estimated = !obj.timestamp || !Number.isFinite(ts) || ts <= 0;
            samples.push({ sessionId, currentModel, currentCwd, filePath, lineIndex, total, last, hasLast: !!obj.payload.info!.last_token_usage,
              timestamp: obj.timestamp, timestampMs: estimated ? fileMtimeMs : ts, estimated });
          }
        } catch {
          malformed++;
        }
      }
    }
  }

  // Resolve the complete session timeline before differencing resumed files.
  const watermarks = new Map<string, Set<Watermark>>();
  const fileWatermarks = new Map<string, Watermark>();
  const regresses = (total: Record<string, number>, previous: Record<string, number>) =>
    Object.keys(total).some(key => total[key] < (previous[key] ?? 0));
  const totalSize = (total?: Record<string, number>) => total?.total_tokens
    ?? ((total?.input_tokens ?? 0) + (total?.output_tokens ?? 0));
  samples.sort((a, b) => a.timestampMs - b.timestampMs || totalSize(a.total) - totalSize(b.total)
    || a.filePath.localeCompare(b.filePath, 'en') || a.lineIndex - b.lineIndex);
  for (const sample of samples) {
    const { sessionId, currentModel, currentCwd, filePath, timestampMs, total, last } = sample;
    const eventKey = hash([sessionId, sample.timestamp, total ?? last]);
    const fileKey = JSON.stringify([sessionId, filePath]);
    // Skip archive copies before they can change the session watermark.
    const duplicate = seen.get(eventKey);
    if (duplicate) { fileWatermarks.set(fileKey, duplicate); continue; }
    const epochs = watermarks.get(sessionId) ?? new Set<Watermark>();
    // A reset starts another counter epoch. Bind each file to its epoch
    // so interleaved old/new streams cannot reset one another repeatedly.
    let watermark = fileWatermarks.get(fileKey) ?? [...epochs]
      .filter(value => !total || !value.totals || !regresses(total, value.totals))
      .sort((a, b) => totalSize(b.totals) - totalSize(a.totals))[0]
      ?? [...epochs].at(-1) ?? {};
    const previousTotals = watermark.totals;
    const reset = total && previousTotals && regresses(total, previousTotals);
    const opening = total && !previousTotals;
    // An unlocated cumulative prefix is not usage attributable to this event's day.
    const omitted = opening && sample.hasLast ? Math.max(0,
      (total.input_tokens ?? 0) + (total.output_tokens ?? 0) - (last.input_tokens ?? 0) - (last.output_tokens ?? 0)) : 0;
    if (omitted) { incompleteStarts++; unlocatedTokens += omitted; if(process.env.INCEPT_CAPTURE_DEBUG)console.error('CODEX_OPENING_OMITTED',sessionId,omitted,filePath); }
    if (opening && !sample.hasLast) uncertainStarts++;
    const historyIncomplete = watermark.historyIncomplete || omitted > 0 || !!(opening && !sample.hasLast);
    const usage = opening && sample.hasLast ? last : total ? Object.fromEntries(Object.keys(total).map(key => [key,
      !reset && previousTotals ? total[key] - (previousTotals[key] ?? 0)
        : previousTotals ? Number(last[key] ?? 0) : total[key],
    ])) : last;
    if (reset) watermark = {};
    watermark.historyIncomplete = historyIncomplete;
    if (total) watermark.totals = total;
    epochs.add(watermark);
    watermarks.set(sessionId, epochs);
    fileWatermarks.set(fileKey, watermark);
    seen.set(eventKey, watermark);
    const rawInput = Number(usage.input_tokens ?? 0);
    const cacheReadTokens = Number(usage.cached_input_tokens ?? 0);
    const uncachedInput = Math.max(0, rawInput - cacheReadTokens);
    const rawOutput = Number(usage.output_tokens ?? 0);
    const reasoningTokens = Number(usage.reasoning_output_tokens ?? 0);
    const outputTokens = Math.max(0, rawOutput - reasoningTokens);
    if(uncachedInput + cacheReadTokens + outputTokens + reasoningTokens === 0) continue;

    if (sample.estimated) estimatedTimes++;
    const { dateKey, monthKey } = toLocalDateAndMonth(timestampMs);
    const proj = resolveProjectFromPath(currentCwd, 'Codex CLI');
    const pricing = lookupPricing(pricingMap, currentModel);
    const cost = computeCostFromPricing(pricing, {
      inputTokens: uncachedInput,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens: 0,
      reasoningTokens,
    });

    events.push({
      eventId: hash(['codex', sessionId, timestampMs, total ?? last]),
      historyIncomplete: historyIncomplete || undefined,
      costSource: 'calculated',
      sourceId: 'codex',
      sourceFile: filePath,
      sourceLabel: 'Codex CLI',
      sessionId,
      projectKey: proj.projectKey,
      projectName: proj.projectName,
      workspacePath: proj.workspacePath,
      modelName: currentModel,
      timestampMs,
      dateKey,
      monthKey,
      inputTokens: uncachedInput,
      outputTokens,
      cacheCreationTokens: 0,
      cacheReadTokens,
      reasoningTokens,
      cost,
      missingPricing: !canPriceUsage(pricing, { inputTokens: uncachedInput, outputTokens, cacheReadTokens, cacheCreationTokens: 0, reasoningTokens: reasoningTokens }),
    });
  }

  return { events, latestMtimeMs, parsedFiles, errors: [
    ...(unreadable ? [`Codex: ${unreadable} files/directories could not be read.`] : []),
    ...(malformed ? [`Codex: ${malformed} malformed JSONL lines were skipped.`] : []),
    ...(estimatedTimes ? [`Codex: ${estimatedTimes} usage timestamps use file modification times.`] : []),
    ...(incompleteStarts ? [`Codex: ${incompleteStarts} session openings have incomplete history; ${unlocatedTokens} prior cumulative tokens were not assigned to their first event's day. Only last-turn usage was counted.`] : []),
    ...(uncertainStarts ? [`Codex: ${uncertainStarts} session openings lack both prior watermarks and last-turn usage; retained cumulative totals have uncertain date attribution.`] : []),
  ] };
}
