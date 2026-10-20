import 'server-only';
import { readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { type UnitPricing, type RawUsageEvent, type SessionIntegrity } from '../types';
import { lookupPricing, computeCostFromPricing, canPriceUsage } from '../pricing';
import { toLocalDateAndMonth, resolveProjectFromPath } from '../normalization';
import { walkFiles } from '../files';
import { hash } from '../imports/identity';
import { CODEX_AUTO_REVIEW_MODEL, isCodexAutoReviewModel } from './codex-purpose';

export type CodexSourcePolicy={autoReviewSessions?:string[]};
export function collectCodexEvents(home: string, pricingMap: Map<string, UnitPricing>, _ingestedFiles: Set<string>, policy:CodexSourcePolicy={}) {
  const events: RawUsageEvent[] = [];
  const parsedFiles = new Set<string>();
  type Watermark = { totals?: Record<string, number>; historyIncomplete?: boolean; timestampMs?: number };
  const integrity = new Map<string, SessionIntegrity>();
  const diagnose = (sessionId: string, reason: SessionIntegrity['reason'], filePath: string,
    timestampMs?: number, unattributedTokens = 0, recoveryAfterTimestampMs?: number) => {
    const key = JSON.stringify([sessionId, reason]);
    const previous = integrity.get(key);
    const times = [previous?.firstAffectedAtMs, previous?.lastAffectedAtMs, timestampMs].filter((value): value is number => value !== undefined);
    integrity.set(key, {
      source: 'codex', sessionId, reason, affectedRecords: (previous?.affectedRecords ?? 0) + 1,
      unattributedTokens: (previous?.unattributedTokens ?? 0) + unattributedTokens,
      sourceFiles: [...new Set([...(previous?.sourceFiles ?? []), filePath])].sort(),
      ...(times.length ? { firstAffectedAtMs: Math.min(...times), lastAffectedAtMs: Math.max(...times) } : {}),
      ...(recoveryAfterTimestampMs !== undefined ? { recoveryAfterTimestampMs: Math.max(previous?.recoveryAfterTimestampMs ?? 0, recoveryAfterTimestampMs) } : {}),
    });
  };
  const validCounter = (value: Record<string, number>) => typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.values(value).every(amount => Number.isSafeInteger(amount) && amount >= 0)
    && (value.cached_input_tokens ?? 0) <= (value.input_tokens ?? 0)
    && (value.reasoning_output_tokens ?? 0) <= (value.output_tokens ?? 0);
  const seen = new Map<string, Watermark>();
  const autoReviewSessions=new Set(policy.autoReviewSessions??[]),reviewSnapshots=new Set<string>();
  const samples: Array<{ sessionId: string; currentModel: string; currentCwd: string; filePath: string;
    lineIndex: number; timestamp?: string; timestampMs: number; estimated: boolean; total?: Record<string, number>; last: Record<string, number>; hasLast: boolean }> = [];
  let unreadable = 0;
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
      let malformedLines = 0;

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
            if(obj.payload?.id !== undefined) {
              if (typeof obj.payload.id !== 'string' || !obj.payload.id.trim()) throw new Error('Invalid session identity');
              sessionId = obj.payload.id;
            }
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
            const ts = typeof obj.timestamp === 'string' ? Date.parse(obj.timestamp) : NaN;
            const estimated = !Number.isFinite(ts) || ts <= 0;
            if (estimated) diagnose(sessionId, 'INVALID_TIMESTAMP', filePath);
            const autoReview=autoReviewSessions.has(sessionId)||isCodexAutoReviewModel(currentModel);
            if ((!autoReview && total && !validCounter(total)) || !validCounter(last)) {
              diagnose(sessionId, 'INVALID_COUNTER', filePath, estimated ? undefined : ts);
              continue;
            }
            samples.push({ sessionId, currentModel, currentCwd, filePath, lineIndex, total, last, hasLast: !!obj.payload.info!.last_token_usage,
              timestamp: obj.timestamp, timestampMs: estimated ? fileMtimeMs : ts, estimated });
          }
        } catch {
          malformedLines++;
        }
      }
      for (let index = 0; index < malformedLines; index++) diagnose(sessionId, 'MALFORMED_RECORD', filePath);
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
    if(autoReviewSessions.has(sessionId)||isCodexAutoReviewModel(currentModel)){
      // Explicit role/model identity selects measured per-call usage. Never infer this role from a reset.
      if(!sample.hasLast){diagnose(sessionId,'INDEPENDENT_USAGE_MISSING',filePath,sample.estimated?undefined:timestampMs);continue;}
      const repeated=total?hash([sessionId,total,last]):hash([sessionId,timestampMs,last]);
      if(reviewSnapshots.has(repeated))continue;reviewSnapshots.add(repeated);
      const inputTokens=(last.input_tokens??0)-(last.cached_input_tokens??0),cacheReadTokens=last.cached_input_tokens??0;
      const outputTokens=(last.output_tokens??0)-(last.reasoning_output_tokens??0),reasoningTokens=last.reasoning_output_tokens??0;
      if(inputTokens+cacheReadTokens+outputTokens+reasoningTokens===0)continue;
      const {dateKey,monthKey}=toLocalDateAndMonth(timestampMs),project=resolveProjectFromPath(currentCwd,'Codex Auto-review');
      events.push({eventId:hash(['codex-auto-review/1',sessionId,timestampMs,total??null,last]),sourceId:'codex',sourceLabel:'Codex Auto-review',
        sourceFile:filePath,sessionId,modelName:CODEX_AUTO_REVIEW_MODEL,timestampMs,dateKey,monthKey,projectKey:project.projectKey,
        projectName:project.projectName,workspacePath:project.workspacePath,inputTokens,outputTokens,cacheReadTokens,cacheCreationTokens:0,
        reasoningTokens,cost:0,costSource:'calculated',missingPricing:true});
      continue;
    }
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
    const previousTimestampMs = watermark.timestampMs;
    const reset = total && previousTotals && regresses(total, previousTotals);
    const opening = total && !previousTotals;
    if (opening && sample.hasLast && Object.keys(last).some(key => last[key] > (total[key] ?? 0))) {
      diagnose(sessionId, 'INVALID_COUNTER', filePath, sample.estimated ? undefined : timestampMs);
      continue;
    }
    // An unlocated cumulative prefix is not usage attributable to this event's day.
    const omitted = opening && sample.hasLast ? Math.max(0,
      (total.input_tokens ?? 0) + (total.output_tokens ?? 0) - (last.input_tokens ?? 0) - (last.output_tokens ?? 0)) : 0;
    if (omitted) diagnose(sessionId, 'OPENING_PREFIX_MISSING', filePath, sample.estimated ? undefined : timestampMs,
      omitted, sample.estimated ? undefined : timestampMs);
    if (opening && !sample.hasLast) diagnose(sessionId, 'OPENING_USAGE_UNCERTAIN', filePath,
      sample.estimated ? undefined : timestampMs, (total.input_tokens ?? 0) + (total.output_tokens ?? 0),
      sample.estimated ? undefined : timestampMs);
    const historyIncomplete = watermark.historyIncomplete || omitted > 0 || !!(opening && !sample.hasLast);
    const usage = opening && sample.hasLast ? last : total ? Object.fromEntries(Object.keys(total).map(key => [key,
      !reset && previousTotals ? total[key] - (previousTotals[key] ?? 0)
        : previousTotals ? Number(last[key] ?? 0) : total[key],
    ])) : last;
    if (reset) watermark = {};
    watermark.historyIncomplete = historyIncomplete;
    if (total) { watermark.totals = total; watermark.timestampMs = sample.estimated ? undefined : timestampMs; }
    epochs.add(watermark);
    watermarks.set(sessionId, epochs);
    fileWatermarks.set(fileKey, watermark);
    seen.set(eventKey, watermark);
    // This opening establishes a counter anchor only. Its cumulative usage has no reliable date.
    if (opening && !sample.hasLast) continue;
    if (!validCounter(usage)) {
      diagnose(sessionId, 'INVALID_COUNTER', filePath, sample.estimated ? undefined : timestampMs);
      continue;
    }
    const rawInput = Number(usage.input_tokens ?? 0);
    const cacheReadTokens = Number(usage.cached_input_tokens ?? 0);
    const uncachedInput = Math.max(0, rawInput - cacheReadTokens);
    const rawOutput = Number(usage.output_tokens ?? 0);
    const reasoningTokens = Number(usage.reasoning_output_tokens ?? 0);
    const outputTokens = Math.max(0, rawOutput - reasoningTokens);
    if(uncachedInput + cacheReadTokens + outputTokens + reasoningTokens === 0) continue;

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
      ...(total && previousTotals && !reset && !sample.estimated && previousTimestampMs !== undefined && previousTimestampMs < timestampMs
        ? { usageInterval: { kind: 'cumulative-delta' as const, afterTimestampMs: previousTimestampMs } } : {}),
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

  return { events, latestMtimeMs, parsedFiles, sessionIntegrity: [...integrity.values()].sort((a, b) =>
    a.sessionId.localeCompare(b.sessionId, 'en') || a.reason.localeCompare(b.reason, 'en')), errors: [
    ...(unreadable ? [`Codex: ${unreadable} files/directories could not be read.`] : []),
  ] };
}
