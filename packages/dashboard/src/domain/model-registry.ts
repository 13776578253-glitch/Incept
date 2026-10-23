import type { ModelProviderFamily } from './types';

export type ResolvedModelIdentity = {
  canonicalModelId: string;
  displayName: string;
  provider: string;
  providerFamily: ModelProviderFamily;
};

// Known canonical models and their aliases
const CANONICAL_ALIASES: Readonly<Record<string, {
  canonicalModelId: string;
  displayName: string;
  defaultProvider?: string;
  providerFamily: ModelProviderFamily;
}>> = {
  // DeepSeek V4.1 Flash
  'deepseek/deepseek-v4.1-flash': { canonicalModelId: 'deepseek-v4.1-flash', displayName: 'DeepSeek V4.1 Flash', defaultProvider: 'DeepSeek Official', providerFamily: 'deepseek' },
  'deepseek-v4-flash': { canonicalModelId: 'deepseek-v4.1-flash', displayName: 'DeepSeek V4.1 Flash', defaultProvider: 'DeepSeek Official', providerFamily: 'deepseek' },
  'deepseek-flash': { canonicalModelId: 'deepseek-v4.1-flash', displayName: 'DeepSeek V4.1 Flash', defaultProvider: 'DeepSeek Official', providerFamily: 'deepseek' },
  'deepseek-v4.1-flash': { canonicalModelId: 'deepseek-v4.1-flash', displayName: 'DeepSeek V4.1 Flash', defaultProvider: 'DeepSeek Official', providerFamily: 'deepseek' },
  'deepseek-v4.1-flash-fast': { canonicalModelId: 'deepseek-v4.1-flash', displayName: 'DeepSeek V4.1 Flash', defaultProvider: 'DeepSeek Official', providerFamily: 'deepseek' },
  'workbuddy/deepseek-v4.1-flash': { canonicalModelId: 'deepseek-v4.1-flash', displayName: 'DeepSeek V4.1 Flash', defaultProvider: 'WorkBuddy', providerFamily: 'workbuddy' },
  'workbuddy-ai/deepseek-v4.1-flash': { canonicalModelId: 'deepseek-v4.1-flash', displayName: 'DeepSeek V4.1 Flash', defaultProvider: 'WorkBuddy', providerFamily: 'workbuddy' },
  'ccs-deepseek/deepseek-flash': { canonicalModelId: 'deepseek-v4.1-flash', displayName: 'DeepSeek V4.1 Flash', defaultProvider: 'CommandCode', providerFamily: 'deepseek' },

  // Codex Auto-review
  'codex-auto-review-unpriced': { canonicalModelId: 'codex-auto-review', displayName: 'Codex Auto-review', defaultProvider: 'Codex', providerFamily: 'openai' },
  'codex-auto-review': { canonicalModelId: 'codex-auto-review', displayName: 'Codex Auto-review', defaultProvider: 'Codex', providerFamily: 'openai' },

  // Kimi
  'workbuddy/kimi-k3-1': { canonicalModelId: 'kimi-k3', displayName: 'Kimi K3', defaultProvider: 'WorkBuddy', providerFamily: 'other' },
  'kimi-k3-1': { canonicalModelId: 'kimi-k3', displayName: 'Kimi K3', defaultProvider: 'Moonshot', providerFamily: 'other' },
  'kimi-k3': { canonicalModelId: 'kimi-k3', displayName: 'Kimi K3', defaultProvider: 'Moonshot', providerFamily: 'other' },

  // Xiaomi Mimo
  'xiaomi/mimo-v2.6-pro': { canonicalModelId: 'mimo-v2.6-pro', displayName: 'Mimo V2.6 Pro', defaultProvider: 'Xiaomi', providerFamily: 'xiaomi' },
  'mimo-v2.6-pro': { canonicalModelId: 'mimo-v2.6-pro', displayName: 'Mimo V2.6 Pro', defaultProvider: 'Xiaomi', providerFamily: 'xiaomi' },

  // GPT-6.1 Sol
  'gpt-6.1-sol': { canonicalModelId: 'gpt-6.1-sol', displayName: 'GPT-6.1 Sol', defaultProvider: 'OpenAI', providerFamily: 'openai' },
  'openai/gpt-6.1-sol': { canonicalModelId: 'gpt-6.1-sol', displayName: 'GPT-6.1 Sol', defaultProvider: 'OpenAI', providerFamily: 'openai' },
  'gpt/gpt-6.1-sol': { canonicalModelId: 'gpt-6.1-sol', displayName: 'GPT-6.1 Sol', defaultProvider: 'OpenAI', providerFamily: 'openai' },

  // GPT-6 Sol
  'gpt-6-sol': { canonicalModelId: 'gpt-6-sol', displayName: 'GPT-6 Sol', defaultProvider: 'OpenAI', providerFamily: 'openai' },
  'openai/gpt-6-sol': { canonicalModelId: 'gpt-6-sol', displayName: 'GPT-6 Sol', defaultProvider: 'OpenAI', providerFamily: 'openai' },
  'gpt/gpt-6-sol': { canonicalModelId: 'gpt-6-sol', displayName: 'GPT-6 Sol', defaultProvider: 'OpenAI', providerFamily: 'openai' },

  // GPT-6 Luna
  'gpt-6-luna': { canonicalModelId: 'gpt-6-luna', displayName: 'GPT-6 Luna', defaultProvider: 'OpenAI', providerFamily: 'openai' },
  'openai/gpt-6-luna': { canonicalModelId: 'gpt-6-luna', displayName: 'GPT-6 Luna', defaultProvider: 'OpenAI', providerFamily: 'openai' },
  'gpt/gpt-6-luna': { canonicalModelId: 'gpt-6-luna', displayName: 'GPT-6 Luna', defaultProvider: 'OpenAI', providerFamily: 'openai' },
};

export function resolveModelIdentity(
  rawModelName: string,
  sourceId?: string,
  customAliases?: Record<string, string>,
): ResolvedModelIdentity {
  const trimmed = (rawModelName ?? '').trim();
  let lower = trimmed.toLowerCase();

  // Apply custom local overrides if provided
  if (customAliases) {
    const custom = customAliases[lower] ?? customAliases[lower.split('/').pop()!];
    if (custom) lower = custom.trim().toLowerCase();
  }

  // 1. Direct match in explicit registry
  const direct = CANONICAL_ALIASES[lower];
  if (direct) {
    let provider = direct.defaultProvider ?? 'Other';
    let providerFamily = direct.providerFamily;

    if (lower.startsWith('workbuddy/') || lower.startsWith('workbuddy-ai/')) {
      provider = 'WorkBuddy';
      providerFamily = 'workbuddy';
    } else if (lower.startsWith('ccs-deepseek/')) {
      provider = 'CommandCode';
    }

    return {
      canonicalModelId: direct.canonicalModelId,
      displayName: direct.displayName,
      provider,
      providerFamily,
    };
  }

  // 2. Protected experimental / special models (DO NOT merge into base version)
  if (lower === 'gemini-3.8-flash-n' || lower === 'gemini-3.8-flash-exp-a' || lower === 'gemini-3.8-flash-tiered') {
    return {
      canonicalModelId: lower,
      displayName: lower,
      provider: 'Google',
      providerFamily: 'gemini',
    };
  }

  // 3. Prefix-based normalization for other models (e.g. strip redundant provider prefix)
  const prefixes: Array<{ prefix: string; provider: string; family: ModelProviderFamily }> = [
    { prefix: 'deepseek/', provider: 'DeepSeek Official', family: 'deepseek' },
    { prefix: 'openai/', provider: 'OpenAI', family: 'openai' },
    { prefix: 'gpt/', provider: 'OpenAI', family: 'openai' },
    { prefix: 'anthropic/', provider: 'Anthropic', family: 'claude' },
    { prefix: 'google/', provider: 'Google', family: 'gemini' },
    { prefix: 'xiaomi/', provider: 'Xiaomi', family: 'xiaomi' },
    { prefix: 'workbuddy/', provider: 'WorkBuddy', family: 'workbuddy' },
    { prefix: 'workbuddy-ai/', provider: 'WorkBuddy', family: 'workbuddy' },
    { prefix: 'zhipu/', provider: 'Zhipu', family: 'zhipu' },
    { prefix: 'xai/', provider: 'xAI', family: 'xai' },
  ];

  for (const { prefix, provider, family } of prefixes) {
    if (lower.startsWith(prefix)) {
      const stripped = lower.slice(prefix.length).trim();
      if (stripped.length > 0) {
        // Recursively check if the stripped name matches a canonical alias (e.g. deepseek/deepseek-v4-flash)
        const inner = CANONICAL_ALIASES[stripped];
        if (inner) {
          return {
            canonicalModelId: inner.canonicalModelId,
            displayName: inner.displayName,
            provider,
            providerFamily: family,
          };
        }
        return {
          canonicalModelId: stripped,
          displayName: formatDisplayName(stripped),
          provider,
          providerFamily: family,
        };
      }
    }
  }

  // 4. Fallback: preserve original name and classify provider by heuristics
  const family = inferFamily(lower);
  const provider = defaultProviderForFamily(family, sourceId);
  return {
    canonicalModelId: lower || 'unknown',
    displayName: trimmed || 'unknown',
    provider,
    providerFamily: family,
  };
}

function inferFamily(lower: string): ModelProviderFamily {
  if (lower.startsWith('workbuddy/') || lower.startsWith('workbuddy-ai/')) return 'workbuddy';
  if (lower.includes('gemini') || lower.startsWith('google/')) return 'gemini';
  if (lower.includes('claude') || lower.startsWith('anthropic/')) return 'claude';
  if (
    lower.startsWith('gpt-') ||
    lower.includes('codex') ||
    lower.startsWith('openai/') ||
    lower.startsWith('o1') ||
    lower.startsWith('o3') ||
    lower.startsWith('o4')
  ) {
    return 'openai';
  }
  if (lower.includes('deepseek')) return 'deepseek';
  if (lower.includes('xiaomi') || lower.includes('mimo')) return 'xiaomi';
  if (lower.includes('glm') || lower.includes('z-ai') || lower.includes('zai-org')) return 'zhipu';
  if (lower.includes('grok') || lower.startsWith('xai/')) return 'xai';
  return 'other';
}

function defaultProviderForFamily(family: ModelProviderFamily, sourceId?: string): string {
  switch (family) {
    case 'deepseek': return 'DeepSeek Official';
    case 'openai': return 'OpenAI';
    case 'claude': return 'Anthropic';
    case 'gemini': return 'Google';
    case 'xiaomi': return 'Xiaomi';
    case 'workbuddy': return 'WorkBuddy';
    case 'zhipu': return 'Zhipu';
    case 'xai': return 'xAI';
    default:
      if (sourceId === 'codex') return 'Codex';
      if (sourceId === 'commandcode') return 'CommandCode';
      return 'Other';
  }
}

function formatDisplayName(id: string): string {
  return id
    .split('-')
    .map(part => part.length <= 3 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
