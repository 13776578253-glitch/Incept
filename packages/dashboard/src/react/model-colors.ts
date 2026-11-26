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
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): [number, number, number] | null {
  const match = hex.trim().match(/^#([0-9a-f]{6})$/i);
  if (!match?.[1]) return null;
  const int = Number.parseInt(match[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) {
    return [0, 0, l * 100];
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) {
    h = (gn - bn) / d + (gn < bn ? 6 : 0);
  } else if (max === gn) {
    h = (bn - rn) / d + 2;
  } else {
    h = (rn - gn) / d + 4;
  }
  return [h * 60, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clampNumber(s, 0, 100) / 100;
  const light = clampNumber(l, 0, 100) / 100;

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hue < 60) {
    [r1, g1, b1] = [c, x, 0];
  } else if (hue < 120) {
    [r1, g1, b1] = [x, c, 0];
  } else if (hue < 180) {
    [r1, g1, b1] = [0, c, x];
  } else if (hue < 240) {
    [r1, g1, b1] = [0, x, c];
  } else if (hue < 300) {
    [r1, g1, b1] = [x, 0, c];
  } else {
    [r1, g1, b1] = [c, 0, x];
  }

  const toHex = (v: number) =>
    Math.round(clampNumber((v + m) * 255, 0, 255))
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

const LIGHT_VARIANT_SPEC: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0],
  [18, 4, -10],
  [-22, -4, 10],
  [10, -10, 16],
  [-14, 6, -15],
  [30, -6, -4],
  [-32, -8, 12],
  [22, 8, -14],
  [-8, -14, 20],
  [14, -4, 7],
  [-26, 2, -8],
];

const DARK_VARIANT_SPEC: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0],
  [18, -4, 10],
  [-22, 4, -10],
  [10, -8, 16],
  [-14, -6, -14],
  [30, -4, 6],
  [-32, -10, 12],
  [22, 6, -12],
  [-8, -12, 18],
  [14, 2, -6],
  [-26, -6, 8],
];

/**
 * Derives 11 visually separated, theme-calibrated monochromatic/analogous shades from a base hex color.
 */
export function deriveFamilyColorVariants(
  baseHex: string,
  themeMode: 'light' | 'dark' = 'light',
): readonly string[] {
  const rgb = hexToRgb(baseHex);
  if (!rgb) return [baseHex];
  const [baseH, baseS, baseL] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  const specs = themeMode === 'dark' ? DARK_VARIANT_SPEC : LIGHT_VARIANT_SPEC;
  const minL = themeMode === 'dark' ? 50 : 30;
  const maxL = themeMode === 'dark' ? 82 : 66;
  const minS = themeMode === 'dark' ? 32 : 28;
  const maxS = themeMode === 'dark' ? 78 : 86;

  return specs.map(([dh, ds, dl], idx) => {
    if (idx === 0) return baseHex.trim().toLowerCase();
    const h = baseH + dh;
    const s = clampNumber(baseS + ds, minS, maxS);
    const l = clampNumber(baseL + dl, minL, maxL);
    return hslToHex(h, s, l);
  });
}

/**
 * Resolves a theme-aware default family shade across 11 CSS-variable-backed slots.
 */
export function resolveDefaultFamilyModelColor(
  modelId: string,
  family: string,
  themeMode: 'light' | 'dark' = 'light',
): string {
  const palette = FAMILY_COLOR_PALETTES[toColorFamilyKey(family)];
  const deepTarget = themeMode === 'dark' ? '#1e293b' : '#0f172a';
  const softTarget = themeMode === 'dark' ? '#e2e8f0' : '#ffffff';
  const expanded = [
    palette[0],
    palette[1],
    palette[2],
    palette[3],
    `color-mix(in oklab, ${palette[0]} ${themeMode === 'dark' ? '78%' : '76%'}, ${deepTarget})`,
    `color-mix(in oklab, ${palette[1]} ${themeMode === 'dark' ? '72%' : '74%'}, ${softTarget})`,
    `color-mix(in oklab, ${palette[2]} ${themeMode === 'dark' ? '82%' : '74%'}, ${deepTarget})`,
    `color-mix(in oklab, ${palette[3]} ${themeMode === 'dark' ? '68%' : '76%'}, ${softTarget})`,
    `color-mix(in oklab, ${palette[0]} 70%, ${palette[2]})`,
    `color-mix(in oklab, ${palette[1]} 65%, ${palette[3]})`,
    `color-mix(in oklab, ${palette[2]} ${themeMode === 'dark' ? '76%' : '82%'}, ${softTarget})`,
  ] as const;

  const normKey = normalizeModelColorKey(modelId);
  if (!normKey) return expanded[0];
  return expanded[hashStringFNV1a(normKey) % expanded.length];
}

/**
 * Resolves a model's automatic family color for the active Light/Dark theme, deriving distinct
 * analogous shades even when a single family base hex is configured.
 */
export function resolveFamilyModelColor(
  modelId: string,
  family: string,
  customFamilyHex: string | undefined,
  themeMode: 'light' | 'dark' = 'light',
): string {
  if (customFamilyHex) {
    const variants = deriveFamilyColorVariants(customFamilyHex, themeMode);
    const normKey = normalizeModelColorKey(modelId);
    if (!normKey) return variants[0] ?? customFamilyHex;
    return variants[hashStringFNV1a(normKey) % variants.length] ?? customFamilyHex;
  }
  return resolveDefaultFamilyModelColor(modelId, family, themeMode);
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
