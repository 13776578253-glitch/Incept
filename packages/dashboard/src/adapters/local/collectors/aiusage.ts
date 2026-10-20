import 'server-only';
import { existsSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { SourceDescriptionKey } from '../../../domain/index';
import { type UnitPricing, type RawUsageEvent } from '../types';
import { lookupPricing, computeCostFromPricing, canPriceUsage } from '../pricing';
import { toLocalDateAndMonth, resolveProjectFromPath } from '../normalization';
import { openSqliteReadOnly } from '../sqlite';
import { loadAntigravityWorkspaces } from './antigravity';
import { loadOpenCodeSessions } from './opencode';
import { hash } from '../imports/identity';
import { normalizeFile } from './common';

export function collectIndexedAgentEvents(home: string, pricingMap: Map<string, UnitPricing>) {
  const events: RawUsageEvent[] = [];
  const seen = new Map<string, RawUsageEvent>();
  let unpricedCodex = 0;

  let latestMtimeMs = 0;

  const ingestedFiles = new Set<string>();

  const antigravityWorkspaces = loadAntigravityWorkspaces(home);

  const openCodeSessions = loadOpenCodeSessions(home);

  const cacheDbPath = join(home, '.aiusage', 'cache.db');

  if(existsSync(cacheDbPath)) {
    try {
      const st = statSync(cacheDbPath);
      if(st.mtimeMs > latestMtimeMs) latestMtimeMs = st.mtimeMs;
    } catch {
      // ignore
    }
  }

  const db = openSqliteReadOnly(cacheDbPath);

  if(db) {
    try {
      const rows = db
        .prepare(
          'SELECT ts, tool, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost, session_id, source_file, cwd FROM records',
        )
        .all();

      // Select duplicate metadata deterministically; file/cost changes do not
      // change a session event's identity or accumulate between full snapshots.
      rows.sort((a, b) => String(a.source_file ?? '').localeCompare(String(b.source_file ?? ''), 'en')
        || Number(a.cost ?? 0) - Number(b.cost ?? 0));
      for(const row of rows) {
        const rawTool = String(row.tool ?? '').trim().toLowerCase();
        const modelName = String(row.model ?? '').trim();
        if(!modelName) continue;

        const sourceFile = String(row.source_file ?? '').trim();
        if(sourceFile) {
          ingestedFiles.add(sourceFile.toLowerCase().replace(/\//g, '\\'));
        }

        const toolSources: Record<string, SourceDescriptionKey> = { codex: 'codex', 'codex-cli': 'codex', antigravity: 'antigravity', claude: 'claudeCode', 'claude-code': 'claudeCode', opencode: 'opencode', zcode: 'zcode', gemini: 'geminiCli', 'gemini-cli': 'geminiCli', commandcode: 'commandcode' };
        let sourceId: SourceDescriptionKey = toolSources[rawTool];
        if (!sourceId) continue;
        let sourceLabel = sourceId === 'geminiCli' ? 'Gemini CLI' : sourceId === 'commandcode' ? 'CommandCode' : 'Codex CLI';
        if(rawTool === 'antigravity') {
          sourceId = 'antigravity';
          sourceLabel = 'Antigravity';
        } else if(rawTool === 'claude-code' || rawTool === 'claude') {
          sourceId = 'claudeCode';
          sourceLabel = 'Claude Code';
        } else if(rawTool === 'opencode') {
          sourceId = 'opencode';
          sourceLabel = 'OpenCode';
        } else if(rawTool === 'zcode') {
          sourceId = 'zcode';
          sourceLabel = 'ZCode';
        }

        const rawSessionId = String(row.session_id ?? '').trim() || 'default';
        const sessionId =
          rawTool === 'claude-code' ? basename(rawSessionId) : rawSessionId;

        let cwd = String(row.cwd ?? '').trim();
        let sessionTitle: string | undefined;

        if(!cwd && sourceId === 'antigravity') {
          cwd = antigravityWorkspaces.get(rawSessionId) ?? 'd:\\Desktop\\code\\code\\Incept';
        } else if(sourceId === 'opencode') {
          const meta = openCodeSessions.get(rawSessionId);
          if(meta?.title) sessionTitle = meta.title;
          if(!cwd && meta?.directory) cwd = meta.directory;
        } else if(!cwd && sourceId === 'claudeCode' && sourceFile) {
          const folder = basename(dirname(sourceFile));
          if(folder.toLowerCase().includes('incept-style')) {
            cwd = 'd:\\Desktop\\code\\code\\Incept-style';
          } else {
            cwd = folder;
          }
        }

        const proj = resolveProjectFromPath(cwd, sourceLabel);
        const timestampMs = Number(row.ts ?? Date.now());
        if(timestampMs > latestMtimeMs) latestMtimeMs = timestampMs;
        const { dateKey, monthKey } = toLocalDateAndMonth(timestampMs);

        const rawInput = Number(row.input_tokens ?? 0);
        const cacheReadTokens = Number(row.cache_read_tokens ?? 0);
        const cacheCreationTokens = Number(row.cache_write_tokens ?? 0);
        const rawOutput = Number(row.output_tokens ?? 0);
        const reasoningTokens = Number(row.thinking_tokens ?? 0);
        const outputTokens = sourceId === 'codex' ? Math.max(0, rawOutput - reasoningTokens) : rawOutput;

        // In Codex raw records, input_tokens includes cached_input_tokens
        const uncachedInput =
          sourceId === 'codex' ? Math.max(0, rawInput - cacheReadTokens) : rawInput;

        const pricing = lookupPricing(pricingMap, modelName);
        const recordedCost = Number(row.cost ?? 0);
        const tokens = {
          inputTokens: uncachedInput, outputTokens, cacheReadTokens, cacheCreationTokens, reasoningTokens,
        };
        const priced = canPriceUsage(pricing, tokens);
        // Codex indexed cost charges cached input twice. Recalculate when rates
        // are complete; otherwise exclude its cost while retaining unpriced tokens.
        const useRecorded = recordedCost > 0 && sourceId !== 'codex';
        const cost = useRecorded ? recordedCost : computeCostFromPricing(pricing, tokens);
        const eventKey = hash([timestampMs, sourceId, modelName, rawInput, cacheReadTokens,
          cacheCreationTokens, rawOutput, reasoningTokens, sessionId,
          sessionId === 'default' ? normalizeFile(sourceFile).replace(/\.zst$/, '') : undefined]);
        const duplicate = seen.get(eventKey);
        if (duplicate) {
          if (sourceFile && !duplicate.sourceFiles!.includes(sourceFile)) duplicate.sourceFiles!.push(sourceFile);
          if (useRecorded && duplicate.costSource !== 'recorded') {
            duplicate.cost = recordedCost;
            duplicate.costSource = 'recorded';
            duplicate.missingPricing = false;
          }
          continue;
        }
        if (sourceId === 'codex' && !priced) unpricedCodex++;

        events.push({
          eventId: eventKey,
          sourceFile,
          sourceFiles: sourceFile ? [sourceFile] : [],
          sourceId,
          sourceLabel,
          sessionId,
          sessionTitle,
          projectKey: proj.projectKey,
          projectName: proj.projectName,
          workspacePath: proj.workspacePath,
          modelName,
          timestampMs,
          dateKey,
          monthKey,
          inputTokens: uncachedInput,
          outputTokens,
          cacheCreationTokens,
          cacheReadTokens,
          reasoningTokens,
          cost,
          costSource: useRecorded ? 'recorded' : 'calculated',
          missingPricing: (sourceId === 'codex' || !useRecorded) && !priced,
        });
        seen.set(eventKey, events.at(-1)!);
      }
    } catch {
      // ignore sqlite errors
    } finally {
      db.close();
    }
  }

  return { events, latestMtimeMs, ingestedFiles, errors: unpricedCodex
    ? [`Codex index: ${unpricedCodex} records lack complete pricing; their tokens remain unpriced and recorded costs were excluded.`] : [] };
}
