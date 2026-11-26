import type { ModelProviderFamily } from './types';

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'extra-high';

export type ResolvedModelIdentity = {
  canonicalModelId: string;
  displayName: string;
  provider: string;
  providerFamily: ModelProviderFamily;
  reasoningEffort?: ReasoningEffort;
};

// Known canonical models and their aliases
const CANONICAL_ALIASES: Readonly<Record<string, {
  canonicalModelId: string;
  displayName: string;
  defaultProvider?: string;
  providerFamily: ModelProviderFamily;
  reasoningEffort?: ReasoningEffort;
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

  // Gemini 4 Neon
  'gemini-4-neon': { canonicalModelId: 'gemini-4-neon', displayName: 'Gemini 4 Neon', defaultProvider: 'Google', providerFamily: 'gemini' },
  'google/gemini-4-neon': { canonicalModelId: 'gemini-4-neon', displayName: 'Gemini 4 Neon', defaultProvider: 'Google', providerFamily: 'gemini' },
  'gemini-4-neon-low': { canonicalModelId: 'gemini-4-neon', displayName: 'Gemini 4 Neon', defaultProvider: 'Google', providerFamily: 'gemini', reasoningEffort: 'low' },
  'gemini-4-neon-medium': { canonicalModelId: 'gemini-4-neon', displayName: 'Gemini 4 Neon', defaultProvider: 'Google', providerFamily: 'gemini', reasoningEffort: 'medium' },
  'gemini-4-neon-high': { canonicalModelId: 'gemini-4-neon', displayName: 'Gemini 4 Neon', defaultProvider: 'Google', providerFamily: 'gemini', reasoningEffort: 'high' },
  'gemini-4-neon-xhigh': { canonicalModelId: 'gemini-4-neon', displayName: 'Gemini 4 Neon', defaultProvider: 'Google', providerFamily: 'gemini', reasoningEffort: 'xhigh' },
  'gemini-4-neon-extra-high': { canonicalModelId: 'gemini-4-neon', displayName: 'Gemini 4 Neon', defaultProvider: 'Google', providerFamily: 'gemini', reasoningEffort: 'extra-high' },

  // Gemini 4 Hydrogen
  'gemini-4-hydrogen': { canonicalModelId: 'gemini-4-hydrogen', displayName: 'Gemini 4 Hydrogen', defaultProvider: 'Google', providerFamily: 'gemini' },
  'google/gemini-4-hydrogen': { canonicalModelId: 'gemini-4-hydrogen', displayName: 'Gemini 4 Hydrogen', defaultProvider: 'Google', providerFamily: 'gemini' },
  'gemini-4-hydrogen-low': { canonicalModelId: 'gemini-4-hydrogen', displayName: 'Gemini 4 Hydrogen', defaultProvider: 'Google', providerFamily: 'gemini', reasoningEffort: 'low' },
  'gemini-4-hydrogen-medium': { canonicalModelId: 'gemini-4-hydrogen', displayName: 'Gemini 4 Hydrogen', defaultProvider: 'Google', providerFamily: 'gemini', reasoningEffort: 'medium' },
  'gemini-4-hydrogen-high': { canonicalModelId: 'gemini-4-hydrogen', displayName: 'Gemini 4 Hydrogen', defaultProvider: 'Google', providerFamily: 'gemini', reasoningEffort: 'high' },
  'gemini-4-hydrogen-xhigh': { canonicalModelId: 'gemini-4-hydrogen', displayName: 'Gemini 4 Hydrogen', defaultProvider: 'Google', providerFamily: 'gemini', reasoningEffort: 'xhigh' },
  'gemini-4-hydrogen-extra-high': { canonicalModelId: 'gemini-4-hydrogen', displayName: 'Gemini 4 Hydrogen', defaultProvider: 'Google', providerFamily: 'gemini', reasoningEffort: 'extra-high' },

  // Gemini 4 Carbon
  'gemini-4-carbon': { canonicalModelId: 'gemini-4-carbon', displayName: 'Gemini 4 Carbon', defaultProvider: 'Google', providerFamily: 'gemini' },
  'google/gemini-4-carbon': { canonicalModelId: 'gemini-4-carbon', displayName: 'Gemini 4 Carbon', defaultProvider: 'Google', providerFamily: 'gemini' },
  'gemini-4-carbon-low': { canonicalModelId: 'gemini-4-carbon', displayName: 'Gemini 4 Carbon', defaultProvider: 'Google', providerFamily: 'gemini', reasoningEffort: 'low' },
  'gemini-4-carbon-medium': { canonicalModelId: 'gemini-4-carbon', displayName: 'Gemini 4 Carbon', defaultProvider: 'Google', providerFamily: 'gemini', reasoningEffort: 'medium' },
  'gemini-4-carbon-high': { canonicalModelId: 'gemini-4-carbon', displayName: 'Gemini 4 Carbon', defaultProvider: 'Google', providerFamily: 'gemini', reasoningEffort: 'high' },
  'gemini-4-carbon-xhigh': { canonicalModelId: 'gemini-4-carbon', displayName: 'Gemini 4 Carbon', defaultProvider: 'Google', providerFamily: 'gemini', reasoningEffort: 'xhigh' },
  'gemini-4-carbon-extra-high': { canonicalModelId: 'gemini-4-carbon', displayName: 'Gemini 4 Carbon', defaultProvider: 'Google', providerFamily: 'gemini', reasoningEffort: 'extra-high' },

  // Claude Opus 5.5
  'claude-opus-5-5': { canonicalModelId: 'claude-opus-5-5', displayName: 'Claude Opus 5.5', defaultProvider: 'Anthropic', providerFamily: 'claude' },
  'anthropic/claude-opus-5-5': { canonicalModelId: 'claude-opus-5-5', displayName: 'Claude Opus 5.5', defaultProvider: 'Anthropic', providerFamily: 'claude' },
  'claude-opus-5-5-low': { canonicalModelId: 'claude-opus-5-5', displayName: 'Claude Opus 5.5', defaultProvider: 'Anthropic', providerFamily: 'claude', reasoningEffort: 'low' },
  'claude-opus-5-5-medium': { canonicalModelId: 'claude-opus-5-5', displayName: 'Claude Opus 5.5', defaultProvider: 'Anthropic', providerFamily: 'claude', reasoningEffort: 'medium' },
  'claude-opus-5-5-high': { canonicalModelId: 'claude-opus-5-5', displayName: 'Claude Opus 5.5', defaultProvider: 'Anthropic', providerFamily: 'claude', reasoningEffort: 'high' },
  'claude-opus-5-5-xhigh': { canonicalModelId: 'claude-opus-5-5', displayName: 'Claude Opus 5.5', defaultProvider: 'Anthropic', providerFamily: 'claude', reasoningEffort: 'xhigh' },
  'claude-opus-5-5-extra-high': { canonicalModelId: 'claude-opus-5-5', displayName: 'Claude Opus 5.5', defaultProvider: 'Anthropic', providerFamily: 'claude', reasoningEffort: 'extra-high' },

  // Claude Sonnet 5.5
  'claude-sonnet-5-5': { canonicalModelId: 'claude-sonnet-5-5', displayName: 'Claude Sonnet 5.5', defaultProvider: 'Anthropic', providerFamily: 'claude' },
  'anthropic/claude-sonnet-5-5': { canonicalModelId: 'claude-sonnet-5-5', displayName: 'Claude Sonnet 5.5', defaultProvider: 'Anthropic', providerFamily: 'claude' },
  'claude-sonnet-5-5-low': { canonicalModelId: 'claude-sonnet-5-5', displayName: 'Claude Sonnet 5.5', defaultProvider: 'Anthropic', providerFamily: 'claude', reasoningEffort: 'low' },
  'claude-sonnet-5-5-medium': { canonicalModelId: 'claude-sonnet-5-5', displayName: 'Claude Sonnet 5.5', defaultProvider: 'Anthropic', providerFamily: 'claude', reasoningEffort: 'medium' },
  'claude-sonnet-5-5-high': { canonicalModelId: 'claude-sonnet-5-5', displayName: 'Claude Sonnet 5.5', defaultProvider: 'Anthropic', providerFamily: 'claude', reasoningEffort: 'high' },
  'claude-sonnet-5-5-xhigh': { canonicalModelId: 'claude-sonnet-5-5', displayName: 'Claude Sonnet 5.5', defaultProvider: 'Anthropic', providerFamily: 'claude', reasoningEffort: 'xhigh' },
  'claude-sonnet-5-5-extra-high': { canonicalModelId: 'claude-sonnet-5-5', displayName: 'Claude Sonnet 5.5', defaultProvider: 'Anthropic', providerFamily: 'claude', reasoningEffort: 'extra-high' },

  // GPT-OSS 120B
  'gpt-oss-120b': { canonicalModelId: 'gpt-oss-120b', displayName: 'GPT-OSS 120B', defaultProvider: 'OpenAI', providerFamily: 'openai' },
  'openai/gpt-oss-120b': { canonicalModelId: 'gpt-oss-120b', displayName: 'GPT-OSS 120B', defaultProvider: 'OpenAI', providerFamily: 'openai' },
  'gpt-oss-120b-low': { canonicalModelId: 'gpt-oss-120b', displayName: 'GPT-OSS 120B', defaultProvider: 'OpenAI', providerFamily: 'openai', reasoningEffort: 'low' },
  'gpt-oss-120b-medium': { canonicalModelId: 'gpt-oss-120b', displayName: 'GPT-OSS 120B', defaultProvider: 'OpenAI', providerFamily: 'openai', reasoningEffort: 'medium' },
  'gpt-oss-120b-high': { canonicalModelId: 'gpt-oss-120b', displayName: 'GPT-OSS 120B', defaultProvider: 'OpenAI', providerFamily: 'openai', reasoningEffort: 'high' },
  'gpt-oss-120b-xhigh': { canonicalModelId: 'gpt-oss-120b', displayName: 'GPT-OSS 120B', defaultProvider: 'OpenAI', providerFamily: 'openai', reasoningEffort: 'xhigh' },
  'gpt-oss-120b-extra-high': { canonicalModelId: 'gpt-oss-120b', displayName: 'GPT-OSS 120B', defaultProvider: 'OpenAI', providerFamily: 'openai', reasoningEffort: 'extra-high' },

  // GPT-6.2 Sol
  'gpt-6.2-sol': { canonicalModelId: 'gpt-6.2-sol', displayName: 'GPT-6.2 Sol', defaultProvider: 'OpenAI', providerFamily: 'openai' },
  'openai/gpt-6.2-sol': { canonicalModelId: 'gpt-6.2-sol', displayName: 'GPT-6.2 Sol', defaultProvider: 'OpenAI', providerFamily: 'openai' },
  'gpt/gpt-6.2-sol': { canonicalModelId: 'gpt-6.2-sol', displayName: 'GPT-6.2 Sol', defaultProvider: 'OpenAI', providerFamily: 'openai' },

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
      ...(direct.reasoningEffort ? { reasoningEffort: direct.reasoningEffort } : {}),
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
            ...(inner.reasoningEffort ? { reasoningEffort: inner.reasoningEffort } : {}),
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
