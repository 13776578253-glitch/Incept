export const MODEL_COLORS = [
  'var(--chart-1, var(--badge-sky-dot))',
  'var(--chart-2, var(--badge-emerald-dot))',
  'var(--chart-3, var(--badge-indigo-dot))',
  'var(--chart-4, var(--badge-amber-dot))',
  'var(--chart-5, var(--badge-rose-dot))',
  'var(--chart-6, #3ea8b8)',
  'var(--chart-7, #d6a947)',
  'var(--chart-8, #9f79c8)',
];

export const CHART_MUTED_COLOR = 'var(--chart-muted, var(--color-nav-muted))';
export const CHART_TOTAL_COLOR = 'var(--chart-total, #334155)';
export const CHART_TOTAL_LINE_COLOR = 'var(--chart-total-line, #0ea5e9)';

export const TOKEN_TYPE_COLORS = {
  input: 'var(--chart-token-input, var(--chart-3, var(--badge-indigo-dot)))',
  cacheRead: 'var(--chart-token-cache-read, var(--chart-1, var(--badge-sky-dot)))',
  cacheWrite: 'var(--chart-token-cache-write, var(--chart-4, var(--badge-amber-dot)))',
  output: 'var(--chart-token-output, var(--chart-2, var(--badge-emerald-dot)))',
  reasoning: 'var(--chart-token-reasoning, var(--chart-5, var(--badge-rose-dot)))',
} as const;

export type ColorFamilyKey = 'DeepSeek' | 'Gemini' | 'GPT' | 'Claude' | 'Other';

export const FAMILY_COLOR_PALETTES: Record<ColorFamilyKey, readonly [string, string, string, string]> = {
  DeepSeek: [
    'var(--chart-deepseek-1, #4c8fd6)',
    'var(--chart-deepseek-2, #6ca9e6)',
    'var(--chart-deepseek-3, #3875b8)',
    'var(--chart-deepseek-4, #84bde8)',
  ],
  Gemini: [
    'var(--chart-gemini-1, #45ab84)',
    'var(--chart-gemini-2, #66c29f)',
    'var(--chart-gemini-3, #339991)',
    'var(--chart-gemini-4, #85cfb3)',
  ],
  GPT: [
    'var(--chart-gpt-1, #7470cf)',
    'var(--chart-gpt-2, #928ee0)',
    'var(--chart-gpt-3, #5c6bc0)',
    'var(--chart-gpt-4, #aba7ea)',
  ],
  Claude: [
    'var(--chart-claude-1, #df864f)',
    'var(--chart-claude-2, #eba270)',
    'var(--chart-claude-3, #c96f4b)',
    'var(--chart-claude-4, #f2b98f)',
  ],
  Other: [
    'var(--chart-other-1, #d9637b)',
    'var(--chart-other-2, #a374c9)',
    'var(--chart-other-3, #d4a23f)',
    'var(--chart-other-4, #3ca2b5)',
  ],
};

export function toColorFamilyKey(family: string): ColorFamilyKey {
  switch (family) {
    case 'DeepSeek':
    case 'Gemini':
    case 'GPT':
    case 'Claude':
      return family;
    default:
      return 'Other';
  }
}

export function normalizeModelColorKey(modelId: string): string {
  return modelId.trim().toLowerCase();
}

function hashStringFNV1a(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Resolves a deterministic, rank-independent color for a model ID within its model family's palette.
 * Supplying `catalogKeys` (sorted unique normalized keys in the same family) minimizes shade collisions cleanly.
 */
export function resolveStableModelColor(
  modelId: string,
  family: string,
  catalogKeys?: ReadonlyArray<string>,
): string {
  const palette = FAMILY_COLOR_PALETTES[toColorFamilyKey(family)];
  const normKey = normalizeModelColorKey(modelId);
  if (!normKey) return palette[0];

  if (!catalogKeys || catalogKeys.length === 0) {
    return palette[hashStringFNV1a(normKey) % palette.length];
  }

  const sorted = Array.from(new Set(catalogKeys.map(normalizeModelColorKey))).sort();
  const usedSlots = new Set<number>();
  let assignedSlot = hashStringFNV1a(normKey) % palette.length;

  for (const key of sorted) {
    const start = hashStringFNV1a(key) % palette.length;
    let slot = start;
    for (let step = 0; step < palette.length; step += 1) {
      const candidate = (start + step) % palette.length;
      if (!usedSlots.has(candidate)) {
        slot = candidate;
        break;
      }
    }
    usedSlots.add(slot);
    if (key === normKey) {
      assignedSlot = slot;
      break;
    }
  }

  return palette[assignedSlot];
}
