import 'server-only';
import { dashboardDate } from '../../domain';
import type { ModelProviderFamily } from '../../domain/index';

export function classifyProvider(modelName: string): ModelProviderFamily {
  const lower = modelName.toLowerCase();
  if(lower.includes('gemini') || lower.startsWith('google/')) return 'gemini';
  if(lower.includes('claude') || lower.startsWith('anthropic/')) return 'claude';
  if(
    lower.startsWith('gpt-') ||
    lower.includes('codex') ||
    lower.startsWith('openai/') ||
    lower.startsWith('o1') ||
    lower.startsWith('o3') ||
    lower.startsWith('o4')
  ) {
    return 'openai';
  }
  if(lower.includes('deepseek')) return 'deepseek';
  if(lower.includes('xiaomi') || lower.includes('mimo')) return 'xiaomi';
  if(lower.includes('glm') || lower.includes('z-ai') || lower.includes('zai-org')) {
    return 'zhipu';
  }
  if(lower.includes('grok') || lower.startsWith('xai/')) return 'xai';
  return 'other';
}

export function toLocalDateAndMonth(timestampMs: number): { dateKey: string; monthKey: string } {
  const dateKey = dashboardDate(timestampMs);
  return { dateKey, monthKey: dateKey.slice(0, 7) };
}

export function resolveProjectFromPath(
  rawPath: string | undefined,
  fallbackSourceLabel: string,
): { projectKey: string; projectName: string; workspacePath?: string } {
  const cleaned = (rawPath ?? '').trim();
  if(!cleaned) {
    const slug = fallbackSourceLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return {
      projectKey: `${slug}-workspace`,
      projectName: `${fallbackSourceLabel} Workspace`,
    };
  }

  const normalized = cleaned.replace(/\//g, '\\').replace(/\\+$/, '');
  const parts = normalized.split('\\').filter(Boolean);
  const lastSegment = parts[parts.length - 1] || fallbackSourceLabel;
  const lowerLast = lastSegment.toLowerCase();

  if(lowerLast === 'incept') {
    return {
      projectKey: 'incept',
      projectName: 'Incept',
      workspacePath: normalized,
    };
  }
  if(lowerLast === '1002bot') {
    return {
      projectKey: '1002bot',
      projectName: '1002bot',
      workspacePath: normalized,
    };
  }

  return {
    projectKey: lowerLast.replace(/[^a-z0-9\u4e00-\u9fa5-_]+/g, '-'),
    projectName: lastSegment,
    workspacePath: normalized,
  };
}
