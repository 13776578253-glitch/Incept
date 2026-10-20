import 'server-only';
import { readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { type UnitPricing, type RawUsageEvent } from '../types';
import { lookupPricing, computeCostFromPricing, canPriceUsage } from '../pricing';
import { toLocalDateAndMonth, resolveProjectFromPath } from '../normalization';
import { walkFiles } from '../files';
import { hash } from '../imports/identity';

export function collectGeminiEvents(home: string, pricingMap: Map<string, UnitPricing>) {
  const events: RawUsageEvent[] = [];
  const errors: string[] = [];
  const parsedFiles = new Set<string>();
  let latestMtimeMs = 0;

  const geminiTmpDir = join(home, '.gemini', 'tmp');

  const geminiChatFiles = walkFiles(
    geminiTmpDir,
    (f) => f.endsWith('.json') && basename(f).startsWith('session-'),
  );

  for(const chatFile of geminiChatFiles) {
    try {
      const st = statSync(chatFile);
      if(st.mtimeMs > latestMtimeMs) latestMtimeMs = st.mtimeMs;
      const raw = JSON.parse(readFileSync(chatFile, 'utf8')) as {
        sessionId?: string;
        startTime?: string;
        messages?: Array<{
          id?: string;
          timestamp?: string;
          type?: string;
          model?: string;
          tokens?: {
            input?: number;
            output?: number;
            cached?: number;
            thoughts?: number;
          };
        }>;
      };
      const sessionId = raw.sessionId || basename(chatFile, '.json');
      const folderName = basename(dirname(dirname(chatFile)));
      const proj = resolveProjectFromPath(folderName, 'Gemini CLI');

      for(const msg of raw.messages ?? []) {
        if(!msg.tokens || !msg.model) continue;
        const modelName = msg.model.trim();
        const rawInput = Number(msg.tokens.input ?? 0);
        const cacheReadTokens = Number(msg.tokens.cached ?? 0);
        const uncachedInput = Math.max(0, rawInput - cacheReadTokens);
        const outputTokens = Number(msg.tokens.output ?? 0);
        const reasoningTokens = Number(msg.tokens.thoughts ?? 0);
        if(uncachedInput + cacheReadTokens + outputTokens + reasoningTokens === 0) {
          continue;
        }

        const ts = msg.timestamp ? Date.parse(msg.timestamp) : st.mtimeMs;
        const timestampMs = Number.isFinite(ts) && ts > 0 ? ts : st.mtimeMs;
        const { dateKey, monthKey } = toLocalDateAndMonth(timestampMs);
        const pricing = lookupPricing(pricingMap, modelName);
        const cost = computeCostFromPricing(pricing, {
          inputTokens: uncachedInput,
          outputTokens,
          cacheReadTokens,
          cacheCreationTokens: 0,
          reasoningTokens,
        });

        parsedFiles.add(chatFile.toLowerCase().replace(/\//g, '\\'));
        events.push({
          eventId: msg.id ? hash(['geminiCli', sessionId, msg.id]) : undefined,
          sourceFile: chatFile,
          sourceId: 'geminiCli',
          sourceLabel: 'Gemini CLI',
          sessionId,
          projectKey: proj.projectKey,
          projectName: proj.projectName,
          workspacePath: proj.workspacePath,
          modelName,
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
    } catch (error) {
      errors.push(`Failed to parse Gemini session at ${chatFile}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { events, errors, latestMtimeMs, parsedFiles };
}
