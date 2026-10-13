import 'server-only';
import { readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { type UnitPricing, type RawUsageEvent } from '../types';
import { lookupPricing, computeCostFromPricing, canPriceUsage } from '../pricing';
import { toLocalDateAndMonth, resolveProjectFromPath } from '../normalization';
import { walkFiles } from '../files';
import { hash } from '../imports/identity';

export function collectCodexEvents(home: string, pricingMap: Map<string, UnitPricing>, _ingestedFiles: Set<string>) {
  const events: RawUsageEvent[] = [];
  const parsedFiles = new Set<string>();
  const seen = new Set<string>();
  let unreadable = 0, malformed = 0, estimatedTimes = 0;
  let latestMtimeMs = 0;

  const codexDirs = [
    join(home, '.codex', 'sessions'),
    join(home, '.codex', 'archived_sessions'),
  ];

  for(const dir of codexDirs) {
    const jsonlFiles = walkFiles(dir, (f) => f.endsWith('.jsonl'), () => unreadable++);
    for(const filePath of jsonlFiles) {
      const normPath = filePath.toLowerCase().replace(/\//g, '\\');

      let content = '';
      let fileMtimeMs = Date.now();
      try {
        const st = statSync(filePath);
        fileMtimeMs = st.mtimeMs;
        if(st.mtimeMs > latestMtimeMs) latestMtimeMs = st.mtimeMs;
        content = readFileSync(filePath, 'utf8');
      } catch {
        unreadable++;
        continue;
      }

      let currentModel = 'unknown';
      let previousTotals: Record<string, number> | undefined;
      let currentCwd = '';
      let sessionId = basename(filePath, '.jsonl').replace(/^rollout-/, '');

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
            const reset = total && previousTotals && Object.keys(total).some(key => total[key] < (previousTotals![key] ?? 0));
            const usage = total ? Object.fromEntries(Object.keys(total).map(key => [key,
              !reset && previousTotals && total[key] >= (previousTotals[key] ?? 0)
                ? total[key] - (previousTotals[key] ?? 0)
                : previousTotals ? Number(last[key as keyof typeof last] ?? total[key]) : total[key],
            ])) : last;
            previousTotals = total;
            const eventKey = JSON.stringify([sessionId, obj.timestamp, total ?? last]);
            parsedFiles.add(normPath);
            if (seen.has(eventKey)) continue;
            seen.add(eventKey);
            const rawInput = Number(usage.input_tokens ?? 0);
            const cacheReadTokens = Number(usage.cached_input_tokens ?? 0);
            const uncachedInput = Math.max(0, rawInput - cacheReadTokens);
            const rawOutput = Number(usage.output_tokens ?? 0);
            const reasoningTokens = Number(usage.reasoning_output_tokens ?? 0);
            const outputTokens = Math.max(0, rawOutput - reasoningTokens);
            if(uncachedInput + cacheReadTokens + outputTokens + reasoningTokens === 0) continue;

            const ts = obj.timestamp ? Date.parse(obj.timestamp) : fileMtimeMs;
            const timestampMs = Number.isFinite(ts) && ts > 0 ? ts : fileMtimeMs;
            if (!obj.timestamp || !Number.isFinite(ts) || ts <= 0) estimatedTimes++;
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
            eventId: hash(['codex', sessionId, obj.timestamp ?? 'line:' + lineIndex]),
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
        } catch {
          malformed++;
        }
      }
    }
  }

  return { events, latestMtimeMs, parsedFiles, errors: [
    ...(unreadable ? [`Codex: ${unreadable} files/directories could not be read.`] : []),
    ...(malformed ? [`Codex: ${malformed} malformed JSONL lines were skipped.`] : []),
    ...(estimatedTimes ? [`Codex: ${estimatedTimes} usage timestamps use file modification times.`] : []),
  ] };
}
