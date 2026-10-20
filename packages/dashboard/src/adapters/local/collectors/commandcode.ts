import 'server-only';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { type UnitPricing, type RawUsageEvent } from '../types';
import { lookupPricing, computeCostFromPricing, canPriceUsage, readRecordedCost } from '../pricing';
import { toLocalDateAndMonth } from '../normalization';
import { hash } from '../imports/identity';
import { applyCommandCodeQuota } from '../pricing-schedule';

export const COMMANDCODE_PROJECT_MAP: Record<
  string,
  { projectKey: string; projectName: string; workspacePath: string }
> = {
  'd-desktop-code-code-incept': {
    projectKey: 'incept',
    projectName: 'Incept',
    workspacePath: 'd:\\Desktop\\code\\code\\Incept',
  },
  'd-desktop-code-code-incept-music': {
    projectKey: 'incept-music',
    projectName: 'Incept-music',
    workspacePath: 'd:\\Desktop\\code\\code\\Incept-music',
  },
  'd-desktop-code-code-incept-roadmap': {
    projectKey: 'incept-roadmap',
    projectName: 'Incept-roadmap',
    workspacePath: 'd:\\Desktop\\code\\code\\Incept-roadmap',
  },
  'd-desktop-code-code-incept-style': {
    projectKey: 'incept-style',
    projectName: 'Incept-style',
    workspacePath: 'd:\\Desktop\\code\\code\\Incept-style',
  },
  'd-desktop-3ds-max2025-work': {
    projectKey: '3ds-max2025-work',
    projectName: '3ds Max2025 work',
    workspacePath: 'd:\\Desktop\\3ds Max2025 work',
  },
  'd-desktop-osc-test': {
    projectKey: 'osc-test',
    projectName: 'OSC test',
    workspacePath: 'd:\\Desktop\\OSC test',
  },
  'd-desktop-vrc': {
    projectKey: 'vrc',
    projectName: 'VRC',
    workspacePath: 'd:\\Desktop\\VRC',
  },
  'c-users-86139': {
    projectKey: 'user-home',
    projectName: '86139 (Home)',
    workspacePath: 'C:\\Users\\86139',
  },
};

export function collectCommandCodeEvents(
  home: string,
  pricingMap: Map<string, UnitPricing>,
): { events: RawUsageEvent[]; latestMtimeMs: number; errors: string[] } {
  const events: RawUsageEvent[] = [];
  let unreadable = 0, malformed = 0, estimatedTimes = 0;
  let latestMtimeMs = 0;
  const projectsRoot = join(home, '.commandcode', 'projects');
  if(!existsSync(projectsRoot)) return { events, latestMtimeMs, errors: [] };

  let projectFolders: string[] = [];
  try {
    projectFolders = readdirSync(projectsRoot);
  } catch {
    return { events, latestMtimeMs, errors: ['CommandCode project directory could not be read.'] };
  }

  for(const folder of projectFolders) {
    const folderPath = join(projectsRoot, folder);
    let files: string[] = [];
    try {
      const st = statSync(folderPath);
      if(!st.isDirectory()) continue;
      if(st.mtimeMs > latestMtimeMs) latestMtimeMs = st.mtimeMs;
      files = readdirSync(folderPath);
    } catch {
      unreadable++;
      continue;
    }

    const mappedProject = COMMANDCODE_PROJECT_MAP[folder.toLowerCase()] ?? {
      projectKey: folder.toLowerCase(),
      projectName: folder,
      workspacePath: folder,
    };

    for(const file of files) {
      if(!file.endsWith('.jsonl') || file.endsWith('.checkpoints.jsonl')) continue;
      const fullPath = join(folderPath, file);
      const sessionId = file.replace(/\.jsonl$/, '');

      let sessionTitle: string | undefined;
      const metaPath = join(folderPath, `${sessionId}.meta.json`);
      if(existsSync(metaPath)) {
        try {
          const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { title?: string };
          if(meta.title?.trim()) sessionTitle = meta.title.trim();
        } catch {
          // ignore
        }
      }

      let rawContent = '';
      let fileMtimeMs = Date.now();
      try {
        const st = statSync(fullPath);
        fileMtimeMs = st.mtimeMs;
        if(st.mtimeMs > latestMtimeMs) latestMtimeMs = st.mtimeMs;
        rawContent = readFileSync(fullPath, 'utf8');
      } catch {
        unreadable++;
        continue;
      }

      const lines = rawContent.split('\n');
      for(const [lineIndex, line] of lines.entries()) {
        if(!line.trim() || !line.includes('"usage"')) continue;
        try {
          const obj = JSON.parse(line) as {
            id?: string;
            model?: string;
            timestamp?: number | string;
            message?: { meta?: { createdAt?: number | string } };
            usage?: {
              inputTokens?: number;
              outputTokens?: number;
              cacheReadTokens?: number;
              cacheWriteTokens?: number;
              costUsd?: number;
            };
          };
          if(!obj.usage || !obj.model) continue;

          const modelName = obj.model.trim();
          const rawInput = Number(obj.usage.inputTokens ?? 0);
          const cacheReadTokens = Number(obj.usage.cacheReadTokens ?? 0);
          const cacheCreationTokens = Number(obj.usage.cacheWriteTokens ?? 0);
          const outputTokens = Number(obj.usage.outputTokens ?? 0);
          // In CommandCode logs, usage.inputTokens includes cacheReadTokens
          const uncachedInput = Math.max(0, rawInput - cacheReadTokens);

          const rawTs = obj.timestamp ?? obj.message?.meta?.createdAt;
          const parsedTs =
            typeof rawTs === 'number'
              ? rawTs
              : typeof rawTs === 'string'
                ? Date.parse(rawTs)
                : fileMtimeMs;
          const timestampMs = Number.isFinite(parsedTs) && parsedTs > 0 ? parsedTs : fileMtimeMs;
          if (rawTs === undefined || !Number.isFinite(parsedTs) || parsedTs <= 0) estimatedTimes++;
          const { dateKey, monthKey } = toLocalDateAndMonth(timestampMs);

          const pricing = lookupPricing(pricingMap, modelName);
          const directCost = readRecordedCost(obj.usage.costUsd);
          const cost =
            directCost !== undefined
              ? directCost
              : computeCostFromPricing(pricing, {
                inputTokens: uncachedInput,
                outputTokens,
                cacheReadTokens,
                cacheCreationTokens,
                reasoningTokens: 0,
              });

          events.push(applyCommandCodeQuota({
            eventId: hash(['commandcode', sessionId, obj.id ?? 'line:' + lineIndex]),
            costSource: directCost === undefined ? 'calculated' : 'recorded',
            sourceFile: fullPath,
            sourceId: 'commandcode',
            sourceLabel: 'CommandCode',
            sessionId: `cc-${sessionId}`,
            sessionTitle,
            projectKey: mappedProject.projectKey,
            projectName: mappedProject.projectName,
            workspacePath: mappedProject.workspacePath,
            modelName,
            timestampMs,
            dateKey,
            monthKey,
            inputTokens: uncachedInput,
            outputTokens,
            cacheCreationTokens,
            cacheReadTokens,
            reasoningTokens: 0,
            cost,
            missingPricing: directCost === undefined && !canPriceUsage(pricing, { inputTokens: uncachedInput, outputTokens, cacheReadTokens, cacheCreationTokens: cacheCreationTokens, reasoningTokens: 0 }),
          }));
        } catch {
          malformed++;
        }
      }
    }
  }

  return { events, latestMtimeMs, errors: [
    ...(unreadable ? [`CommandCode: ${unreadable} files/directories could not be read.`] : []),
    ...(malformed ? [`CommandCode: ${malformed} malformed usage lines were skipped.`] : []),
    ...(estimatedTimes ? [`CommandCode: ${estimatedTimes} usage timestamps use file modification times.`] : []),
  ] };
}
