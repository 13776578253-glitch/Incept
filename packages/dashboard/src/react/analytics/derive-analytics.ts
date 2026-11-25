import type {
  BillingDailyCost,
  CcusageModelBreakdown,
  DailyUsagePoint,
  ModelUsageSummary,
  MonthlyUsagePoint,
  TokenBreakdown,
} from '../../domain';
import {
  CHART_MUTED_COLOR,
  FAMILY_COLOR_PALETTES,
  MODEL_COLORS,
  normalizeModelColorKey,
  resolveStableModelColor,
  toColorFamilyKey,
  TOKEN_TYPE_COLORS,
  type ColorFamilyKey,
} from '../model-colors';

export type TokenComponentId =
  | 'input'
  | 'cacheRead'
  | 'cacheWrite'
  | 'output'
  | 'reasoning';

export type TokenComponentSlice = {
  id: TokenComponentId;
  tokens: number;
  share: number;
  color: string;
};

export type TimeGrain = 'day' | 'week' | 'month';

export type TimeBucket = TokenBreakdown & {
  key: string;
  label: string;
  fullLabel: string;
  grain: TimeGrain;
  dates: string[];
  isPartial: boolean;
  modelsUsed: string[];
  modelBreakdowns: CcusageModelBreakdown[];
};

export type GlobalCachePoint = {
  key: string;
  label: string;
  fullLabel: string;
  hitRate: number | null;
  outputToInputRatio: number | null;
  cacheReadTokens: number;
  promptTokens: number;
  totalTokens: number;
  isPartial: boolean;
};

export type ModelCacheBucketPoint = {
  key: string;
  label: string;
  fullLabel: string;
  hitRate: number | null;
  cacheReadTokens: number;
  promptTokens: number;
  totalTokens: number;
};

export type ModelCacheSeries = {
  modelName: string;
  color: string;
  windowHitRate: number | null;
  minHitRate: number | null;
  maxHitRate: number | null;
  cacheReadTokens: number;
  promptTokens: number;
  totalTokens: number;
  activeBuckets: number;
  points: ModelCacheBucketPoint[];
};

export type ModelMigrationBucket = {
  key: string;
  label: string;
  fullLabel: string;
  totalTokens: number;
  shares: Record<string, number>;
  tokensBySeries: Record<string, number>;
};

export type ModelMigrationData = {
  seriesIds: string[];
  hasOthers: boolean;
  colors: Record<string, string>;
  buckets: ModelMigrationBucket[];
};

export type ModelLifecycleSummary = {
  modelName: string;
  displayName: string;
  firstActiveDate: string | null;
  lastActiveDate: string | null;
  activeDays: number;
  meanTokensPerSession: number | null;
  totalTokens: number;
  shareOfTokens: number;
  cacheHitRate: number;
};

export const OTHERS_SERIES_ID = '__others__';

export function getModelSeriesColor(index: number): string {
  return MODEL_COLORS[index % MODEL_COLORS.length] ?? CHART_MUTED_COLOR;
}

export type DashboardColorOverrides = {
  familyColors?: Partial<Record<ColorFamilyKey, string>>;
  modelColors?: Record<string, string>;
};

export function getFamilyPrimaryColor(
  family: string,
  familyColors?: Partial<Record<ColorFamilyKey, string>>,
): string {
  if (family === OTHERS_SERIES_ID) return CHART_MUTED_COLOR;
  const familyKey = toColorFamilyKey(family);
  return familyColors?.[familyKey] ?? FAMILY_COLOR_PALETTES[familyKey][0];
}

function resolveColorWithOverrides(
  modelName: string,
  canonicalId: string,
  provider: string | undefined,
  overrides?: DashboardColorOverrides,
): string {
  const normName = normalizeModelColorKey(modelName);
  const normCanonical = normalizeModelColorKey(canonicalId);
  const customModelColor =
    overrides?.modelColors?.[normName] ??
    overrides?.modelColors?.[normCanonical] ??
    overrides?.modelColors?.[modelName];
  if (customModelColor) {
    return customModelColor;
  }

  const family = resolveModelFamily(modelName, provider);
  const familyKey = toColorFamilyKey(family);
  const customFamilyColor = overrides?.familyColors?.[familyKey];
  if (customFamilyColor) {
    return customFamilyColor;
  }

  return resolveStableModelColor(canonicalId, family);
}

/**
 * Builds a deterministic, rank- and window-independent `modelName -> color` map
 * respecting explicit per-model and per-family custom overrides.
 */
export function buildStableModelColorMap(
  models: ReadonlyArray<ModelUsageSummary>,
  daily: ReadonlyArray<DailyUsagePoint>,
  overrides?: DashboardColorOverrides,
): Map<string, string> {
  const map = new Map<string, string>();
  const providerByModel = new Map<string, string>();
  const canonicalByModel = new Map<string, string>();

  for (const model of models) {
    providerByModel.set(model.modelName, model.provider);
    if (model.canonicalModelId) {
      canonicalByModel.set(model.modelName, model.canonicalModelId);
    }
    const identity = model.canonicalModelId || model.modelName;
    map.set(
      model.modelName,
      resolveColorWithOverrides(model.modelName, identity, model.provider, overrides),
    );
  }

  for (const day of daily) {
    for (const row of day.modelBreakdowns) {
      if (map.has(row.modelName)) continue;
      const identity = canonicalByModel.get(row.modelName) || row.modelName;
      map.set(
        row.modelName,
        resolveColorWithOverrides(
          row.modelName,
          identity,
          providerByModel.get(row.modelName),
          overrides,
        ),
      );
    }
  }

  return map;
}

export function resolveBreakdownTokens(row: {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  reasoningTokens?: number;
  totalTokens?: number;
}): number {
  if (typeof row.totalTokens === 'number' && Number.isFinite(row.totalTokens)) {
    return Math.max(0, row.totalTokens);
  }
  return Math.max(
    0,
    (row.inputTokens || 0) +
      (row.outputTokens || 0) +
      (row.cacheCreationTokens || 0) +
      (row.cacheReadTokens || 0) +
      (row.reasoningTokens ?? 0),
  );
}

/**
 * Splits tokens into 5 strictly separate accounting buckets without merging cache writes into reasoning.
 */
export function deriveTokenComposition(totals: TokenBreakdown): TokenComponentSlice[] {
  const raw: ReadonlyArray<{ id: TokenComponentId; tokens: number; color: string }> = [
    { id: 'cacheRead', tokens: Math.max(0, totals.cacheReadTokens || 0), color: TOKEN_TYPE_COLORS.cacheRead },
    { id: 'input', tokens: Math.max(0, totals.inputTokens || 0), color: TOKEN_TYPE_COLORS.input },
    { id: 'cacheWrite', tokens: Math.max(0, totals.cacheCreationTokens || 0), color: TOKEN_TYPE_COLORS.cacheWrite },
    { id: 'output', tokens: Math.max(0, totals.outputTokens || 0), color: TOKEN_TYPE_COLORS.output },
    { id: 'reasoning', tokens: Math.max(0, totals.reasoningTokens || 0), color: TOKEN_TYPE_COLORS.reasoning },
  ];

  const denominator = raw.reduce((sum, item) => sum + item.tokens, 0);
  return raw.map((item) => ({
    ...item,
    share: denominator > 0 ? item.tokens / denominator : 0,
  }));
}

/**
 * Splits non-cache-read net tokens (input, cacheWrite, output, reasoning) normalized over their own sum
 * so cache-dominated accounts can still inspect real net token composition clearly.
 */
export function deriveNetTokenComposition(totals: TokenBreakdown): TokenComponentSlice[] {
  const raw: ReadonlyArray<{ id: TokenComponentId; tokens: number; color: string }> = [
    { id: 'input', tokens: Math.max(0, totals.inputTokens || 0), color: TOKEN_TYPE_COLORS.input },
    { id: 'cacheWrite', tokens: Math.max(0, totals.cacheCreationTokens || 0), color: TOKEN_TYPE_COLORS.cacheWrite },
    { id: 'output', tokens: Math.max(0, totals.outputTokens || 0), color: TOKEN_TYPE_COLORS.output },
    { id: 'reasoning', tokens: Math.max(0, totals.reasoningTokens || 0), color: TOKEN_TYPE_COLORS.reasoning },
  ];

  const denominator = raw.reduce((sum, item) => sum + item.tokens, 0);
  return raw.map((item) => ({
    ...item,
    share: denominator > 0 ? item.tokens / denominator : 0,
  }));
}

function getMondayDateKey(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return dateStr;
  }
  const [year, month, day] = parts;
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = utcDate.getUTCDay(); // 0 = Sun, 1 = Mon, ...
  const offsetToMonday = (dayOfWeek + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - offsetToMonday);
  return utcDate.toISOString().slice(0, 10);
}

function mergeModelBreakdowns(items: ReadonlyArray<CcusageModelBreakdown[]>): CcusageModelBreakdown[] {
  const map = new Map<string, CcusageModelBreakdown>();
  for (const list of items) {
    for (const row of list) {
      const prev = map.get(row.modelName);
      const rowTotal = resolveBreakdownTokens(row);
      if (!prev) {
        map.set(row.modelName, {
          modelName: row.modelName,
          inputTokens: row.inputTokens || 0,
          outputTokens: row.outputTokens || 0,
          cacheCreationTokens: row.cacheCreationTokens || 0,
          cacheReadTokens: row.cacheReadTokens || 0,
          reasoningTokens: row.reasoningTokens ?? 0,
          totalTokens: rowTotal,
          cost: row.cost || 0,
          missingPricing: row.missingPricing,
        });
      } else {
        prev.inputTokens += row.inputTokens || 0;
        prev.outputTokens += row.outputTokens || 0;
        prev.cacheCreationTokens += row.cacheCreationTokens || 0;
        prev.cacheReadTokens += row.cacheReadTokens || 0;
        prev.reasoningTokens = (prev.reasoningTokens ?? 0) + (row.reasoningTokens ?? 0);
        prev.totalTokens = (prev.totalTokens ?? 0) + rowTotal;
        prev.cost += row.cost || 0;
        prev.missingPricing = Boolean(prev.missingPricing || row.missingPricing);
      }
    }
  }
  return Array.from(map.values());
}

/**
 * Aggregates daily/monthly series into chronological day, Monday-start week, or month buckets.
 */
export function buildTimeBuckets(
  daily: DailyUsagePoint[],
  monthly: MonthlyUsagePoint[],
  grain: TimeGrain,
): TimeBucket[] {
  const sortedDaily = [...daily].sort((a, b) => a.date.localeCompare(b.date));

  if (grain === 'day') {
    return sortedDaily.map((item) => ({
      key: item.date,
      label: item.date.length >= 10 ? item.date.slice(5) : item.date,
      fullLabel: item.date,
      grain: 'day',
      dates: [item.date],
      isPartial: false,
      inputTokens: item.inputTokens || 0,
      outputTokens: item.outputTokens || 0,
      cacheCreationTokens: item.cacheCreationTokens || 0,
      cacheReadTokens: item.cacheReadTokens || 0,
      reasoningTokens: item.reasoningTokens || 0,
      totalTokens: resolveBreakdownTokens(item),
      cost: item.cost || 0,
      missingPricing: item.missingPricing,
      modelsUsed: item.modelsUsed,
      modelBreakdowns: item.modelBreakdowns,
    }));
  }

  if (grain === 'week') {
    const groups = new Map<string, DailyUsagePoint[]>();
    for (const day of sortedDaily) {
      const mondayKey = getMondayDateKey(day.date);
      const list = groups.get(mondayKey);
      if (list) {
        list.push(day);
      } else {
        groups.set(mondayKey, [day]);
      }
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mondayKey, days]) => {
        const first = days[0]?.date ?? mondayKey;
        const last = days[days.length - 1]?.date ?? mondayKey;
        const modelSet = new Set<string>();
        let inputTokens = 0;
        let outputTokens = 0;
        let cacheCreationTokens = 0;
        let cacheReadTokens = 0;
        let reasoningTokens = 0;
        let totalTokens = 0;
        let cost = 0;
        let missingPricing = false;

        for (const day of days) {
          inputTokens += day.inputTokens || 0;
          outputTokens += day.outputTokens || 0;
          cacheCreationTokens += day.cacheCreationTokens || 0;
          cacheReadTokens += day.cacheReadTokens || 0;
          reasoningTokens += day.reasoningTokens || 0;
          totalTokens += resolveBreakdownTokens(day);
          cost += day.cost || 0;
          if (day.missingPricing) missingPricing = true;
          for (const modelName of day.modelsUsed) {
            modelSet.add(modelName);
          }
        }

        return {
          key: mondayKey,
          label: first.length >= 10 ? first.slice(5) : first,
          fullLabel: first === last ? first : `${first} ~ ${last}`,
          grain: 'week',
          dates: days.map((d) => d.date),
          isPartial: days.length < 7,
          inputTokens,
          outputTokens,
          cacheCreationTokens,
          cacheReadTokens,
          reasoningTokens,
          totalTokens,
          cost,
          missingPricing,
          modelsUsed: Array.from(modelSet),
          modelBreakdowns: mergeModelBreakdowns(days.map((d) => d.modelBreakdowns)),
        };
      });
  }

  if (monthly.length > 0) {
    const sortedMonthly = [...monthly].sort((a, b) => a.month.localeCompare(b.month));
    return sortedMonthly.map((item) => {
      const matchingDates = sortedDaily
        .filter((d) => d.date.startsWith(item.month))
        .map((d) => d.date);
      return {
        key: item.month,
        label: item.month,
        fullLabel: item.month,
        grain: 'month',
        dates: matchingDates,
        isPartial: false,
        inputTokens: item.inputTokens || 0,
        outputTokens: item.outputTokens || 0,
        cacheCreationTokens: item.cacheCreationTokens || 0,
        cacheReadTokens: item.cacheReadTokens || 0,
        reasoningTokens: item.reasoningTokens || 0,
        totalTokens: resolveBreakdownTokens(item),
        cost: item.cost || 0,
        missingPricing: item.missingPricing,
        modelsUsed: item.modelsUsed,
        modelBreakdowns: item.modelBreakdowns,
      };
    });
  }

  const byMonth = new Map<string, DailyUsagePoint[]>();
  for (const day of sortedDaily) {
    const monthKey = day.date.slice(0, 7);
    const list = byMonth.get(monthKey);
    if (list) list.push(day);
    else byMonth.set(monthKey, [day]);
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, days]) => {
      const modelSet = new Set<string>();
      let inputTokens = 0;
      let outputTokens = 0;
      let cacheCreationTokens = 0;
      let cacheReadTokens = 0;
      let reasoningTokens = 0;
      let totalTokens = 0;
      let cost = 0;
      let missingPricing = false;
      for (const day of days) {
        inputTokens += day.inputTokens || 0;
        outputTokens += day.outputTokens || 0;
        cacheCreationTokens += day.cacheCreationTokens || 0;
        cacheReadTokens += day.cacheReadTokens || 0;
        reasoningTokens += day.reasoningTokens || 0;
        totalTokens += resolveBreakdownTokens(day);
        cost += day.cost || 0;
        if (day.missingPricing) missingPricing = true;
        for (const m of day.modelsUsed) modelSet.add(m);
      }
      return {
        key: monthKey,
        label: monthKey,
        fullLabel: monthKey,
        grain: 'month',
        dates: days.map((d) => d.date),
        isPartial: false,
        inputTokens,
        outputTokens,
        cacheCreationTokens,
        cacheReadTokens,
        reasoningTokens,
        totalTokens,
        cost,
        missingPricing,
        modelsUsed: Array.from(modelSet),
        modelBreakdowns: mergeModelBreakdowns(days.map((d) => d.modelBreakdowns)),
      };
    });
}

/**
 * Computes a trailing rolling average for trend verification overlays without mutating series length.
 */
export function computeMovingAverage(values: ReadonlyArray<number>, windowSize = 7): Array<number | null> {
  if (values.length === 0 || windowSize <= 0) {
    return [];
  }
  const result: Array<number | null> = [];
  let runningSum = 0;
  for (let i = 0; i < values.length; i += 1) {
    runningSum += values[i];
    if (i >= windowSize) {
      runningSum -= values[i - windowSize];
    }
    const count = Math.min(i + 1, windowSize);
    result.push(runningSum / count);
  }
  return result;
}

/**
 * Derives weighted cache efficiency trend (`ΣR / Σ(I+R+W)`) per bucket, returning null when prompt denominator is zero.
 */
export function buildGlobalCacheSeries(buckets: ReadonlyArray<TimeBucket>): GlobalCachePoint[] {
  return buckets.map((bucket) => {
    const promptTokens =
      (bucket.inputTokens || 0) +
      (bucket.cacheReadTokens || 0) +
      (bucket.cacheCreationTokens || 0);
    const cacheReadTokens = bucket.cacheReadTokens || 0;
    const outputPlusReasoning = (bucket.outputTokens || 0) + (bucket.reasoningTokens || 0);

    return {
      key: bucket.key,
      label: bucket.label,
      fullLabel: bucket.fullLabel,
      hitRate: promptTokens > 0 ? cacheReadTokens / promptTokens : null,
      outputToInputRatio: promptTokens > 0 ? outputPlusReasoning / promptTokens : null,
      cacheReadTokens,
      promptTokens,
      totalTokens: bucket.totalTokens,
      isPartial: bucket.isPartial,
    };
  });
}

/**
 * Tracks per-model weighted cache hit rate over time (`cacheRead / (input + cacheRead + cacheWrite)`),
 * preserving `null` gaps for buckets where a model had zero prompt context.
 */
export function buildModelCacheSeries(
  buckets: ReadonlyArray<TimeBucket>,
  orderedModels: ReadonlyArray<string>,
  colorMap?: ReadonlyMap<string, string>,
): ModelCacheSeries[] {
  return orderedModels.map((modelName, index) => {
    let totalCacheRead = 0;
    let totalPrompt = 0;
    let totalTokens = 0;
    let activeBuckets = 0;
    let minHitRate: number | null = null;
    let maxHitRate: number | null = null;

    const points: ModelCacheBucketPoint[] = buckets.map((bucket) => {
      let cacheRead = 0;
      let input = 0;
      let cacheWrite = 0;
      let bucketModelTokens = 0;

      for (const row of bucket.modelBreakdowns) {
        if (row.modelName === modelName) {
          cacheRead += row.cacheReadTokens || 0;
          input += row.inputTokens || 0;
          cacheWrite += row.cacheCreationTokens || 0;
          bucketModelTokens += resolveBreakdownTokens(row);
        }
      }

      const prompt = input + cacheRead + cacheWrite;
      const hitRate = prompt > 0 ? cacheRead / prompt : null;

      if (hitRate !== null) {
        activeBuckets += 1;
        totalCacheRead += cacheRead;
        totalPrompt += prompt;
        minHitRate = minHitRate === null ? hitRate : Math.min(minHitRate, hitRate);
        maxHitRate = maxHitRate === null ? hitRate : Math.max(maxHitRate, hitRate);
      }
      totalTokens += bucketModelTokens;

      return {
        key: bucket.key,
        label: bucket.label,
        fullLabel: bucket.fullLabel,
        hitRate,
        cacheReadTokens: cacheRead,
        promptTokens: prompt,
        totalTokens: bucketModelTokens,
      };
    });

    const resolvedColor =
      colorMap?.get(modelName) ??
      resolveStableModelColor(modelName, resolveModelFamily(modelName)) ??
      getModelSeriesColor(index);

    return {
      modelName,
      color: resolvedColor,
      windowHitRate: totalPrompt > 0 ? totalCacheRead / totalPrompt : null,
      minHitRate,
      maxHitRate,
      cacheReadTokens: totalCacheRead,
      promptTokens: totalPrompt,
      totalTokens,
      activeBuckets,
      points,
    };
  });
}

/**
 * Computes normalized per-bucket share trajectories for Top N models + Others.
 */
export function buildModelMigrationSeries(
  buckets: ReadonlyArray<TimeBucket>,
  orderedModels: ReadonlyArray<string>,
  topN = 5,
): ModelMigrationData {
  const topModels = orderedModels.slice(0, topN);
  const colors: Record<string, string> = {};
  topModels.forEach((name, idx) => {
    colors[name] = getModelSeriesColor(idx);
  });

  let hasOthers = false;
  const parsedBuckets: ModelMigrationBucket[] = buckets.map((bucket) => {
    const tokensByModel = new Map<string, number>();
    let bucketSum = 0;

    for (const row of bucket.modelBreakdowns) {
      const value = resolveBreakdownTokens(row);
      if (value <= 0) continue;
      tokensByModel.set(row.modelName, (tokensByModel.get(row.modelName) ?? 0) + value);
      bucketSum += value;
    }

    const shares: Record<string, number> = {};
    const tokensBySeries: Record<string, number> = {};
    let topSum = 0;

    for (const modelName of topModels) {
      const val = tokensByModel.get(modelName) ?? 0;
      tokensBySeries[modelName] = val;
      shares[modelName] = bucketSum > 0 ? val / bucketSum : 0;
      topSum += val;
    }

    const othersTokens = Math.max(0, bucketSum - topSum);
    if (othersTokens > 0) {
      hasOthers = true;
    }
    tokensBySeries[OTHERS_SERIES_ID] = othersTokens;
    shares[OTHERS_SERIES_ID] = bucketSum > 0 ? othersTokens / bucketSum : 0;

    return {
      key: bucket.key,
      label: bucket.label,
      fullLabel: bucket.fullLabel,
      totalTokens: bucketSum,
      shares,
      tokensBySeries,
    };
  });

  const seriesIds = hasOthers ? [...topModels, OTHERS_SERIES_ID] : [...topModels];
  if (hasOthers) {
    colors[OTHERS_SERIES_ID] = CHART_MUTED_COLOR;
  }

  return {
    seriesIds,
    hasOthers,
    colors,
    buckets: parsedBuckets,
  };
}

/**
 * Computes observed first/last active dates and per-session mean throughput per model within the current window.
 */
export function buildModelLifecycles(
  daily: ReadonlyArray<DailyUsagePoint>,
  models: ReadonlyArray<ModelUsageSummary>,
): ModelLifecycleSummary[] {
  const sortedDaily = [...daily].sort((a, b) => a.date.localeCompare(b.date));
  const spanByModel = new Map<string, { first: string; last: string; days: Set<string> }>();

  for (const day of sortedDaily) {
    for (const row of day.modelBreakdowns) {
      if (resolveBreakdownTokens(row) <= 0) continue;
      const entry = spanByModel.get(row.modelName);
      if (!entry) {
        spanByModel.set(row.modelName, {
          first: day.date,
          last: day.date,
          days: new Set([day.date]),
        });
      } else {
        entry.last = day.date;
        entry.days.add(day.date);
      }
    }
  }

  return models
    .filter((model) => model.slotStatus !== 'configured' && model.totalTokens > 0)
    .map((model) => {
      const span = spanByModel.get(model.modelName);
      return {
        modelName: model.modelName,
        displayName: model.displayName || model.modelName,
        firstActiveDate: span?.first ?? null,
        lastActiveDate: span?.last ?? null,
        activeDays: span ? span.days.size : model.activeDays,
        meanTokensPerSession:
          model.sessionCount > 0 ? model.totalTokens / model.sessionCount : null,
        totalTokens: model.totalTokens,
        shareOfTokens: model.shareOfTokens,
        cacheHitRate: model.cacheHitRate,
      };
    });
}

/**
 * Resolves a raw model identifier / provider hint into a clean high-level model family name
 * so migration area charts stay legible instead of fragmenting across 15+ point versions.
 */
export function resolveModelFamily(modelName: string, provider?: string): string {
  const name = modelName.toLowerCase();
  const prov = (provider ?? '').toLowerCase();

  if (name.includes('deepseek') || prov === 'deepseek') return 'DeepSeek';
  if (name.includes('claude') || prov === 'claude' || prov === 'anthropic') return 'Claude';
  if (
    name.includes('gpt') ||
    name.includes('codex') ||
    /^o[134](-|$)/.test(name) ||
    prov === 'openai'
  ) {
    return 'GPT';
  }
  if (name.includes('gemini') || prov === 'gemini' || prov === 'google') return 'Gemini';
  if (name.includes('qwen')) return 'Qwen';
  if (name.includes('glm') || name.includes('chatglm')) return 'GLM';
  if (name.includes('kimi') || name.includes('moonshot')) return 'Kimi';
  if (name.includes('minimax') || name.includes('abab')) return 'MiniMax';
  return OTHERS_SERIES_ID;
}

/**
 * Computes normalized per-bucket share trajectories grouped by high-level model family
 * (keeping top N families descending by total window volume, collapsing tail into Others).
 */
export function buildModelFamilyMigrationSeries(
  buckets: ReadonlyArray<TimeBucket>,
  models: ReadonlyArray<ModelUsageSummary>,
  maxFamilies = 5,
  familyColors?: Partial<Record<ColorFamilyKey, string>>,
): ModelMigrationData {
  const providerByModel = new Map<string, string>();
  for (const model of models) {
    providerByModel.set(model.modelName, model.provider);
  }

  const totalByFamily = new Map<string, number>();
  for (const bucket of buckets) {
    for (const row of bucket.modelBreakdowns) {
      const val = resolveBreakdownTokens(row);
      if (val <= 0) continue;
      const family = resolveModelFamily(row.modelName, providerByModel.get(row.modelName));
      if (family === OTHERS_SERIES_ID) continue;
      totalByFamily.set(family, (totalByFamily.get(family) ?? 0) + val);
    }
  }

  const topFamilies = Array.from(totalByFamily.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxFamilies)
    .map(([family]) => family);

  const colors: Record<string, string> = {};
  topFamilies.forEach((family) => {
    colors[family] = getFamilyPrimaryColor(family, familyColors);
  });

  let hasOthers = false;
  const parsedBuckets: ModelMigrationBucket[] = buckets.map((bucket) => {
    const tokensByFamily = new Map<string, number>();
    let bucketSum = 0;

    for (const row of bucket.modelBreakdowns) {
      const value = resolveBreakdownTokens(row);
      if (value <= 0) continue;
      const family = resolveModelFamily(row.modelName, providerByModel.get(row.modelName));
      tokensByFamily.set(family, (tokensByFamily.get(family) ?? 0) + value);
      bucketSum += value;
    }

    const shares: Record<string, number> = {};
    const tokensBySeries: Record<string, number> = {};
    let topSum = 0;

    for (const family of topFamilies) {
      const val = tokensByFamily.get(family) ?? 0;
      tokensBySeries[family] = val;
      shares[family] = bucketSum > 0 ? val / bucketSum : 0;
      topSum += val;
    }

    const othersTokens = Math.max(0, bucketSum - topSum);
    if (othersTokens > 0) {
      hasOthers = true;
    }
    tokensBySeries[OTHERS_SERIES_ID] = othersTokens;
    shares[OTHERS_SERIES_ID] = bucketSum > 0 ? othersTokens / bucketSum : 0;

    return {
      key: bucket.key,
      label: bucket.label,
      fullLabel: bucket.fullLabel,
      totalTokens: bucketSum,
      shares,
      tokensBySeries,
    };
  });

  const seriesIds = hasOthers ? [...topFamilies, OTHERS_SERIES_ID] : [...topFamilies];
  if (hasOthers) {
    colors[OTHERS_SERIES_ID] = CHART_MUTED_COLOR;
  }

  return {
    seriesIds,
    hasOthers,
    colors,
    buckets: parsedBuckets,
  };
}

export type AggregatedBillingBucket = {
  key: string;
  label: string;
  fullLabel: string;
  drillDate: string;
  estimatedCostUsd: string;
  numericUsd: number;
  estimatedTokens: number;
  unpricedTokens: number;
  excludedTokens: number;
  isPartial: boolean;
};

/**
 * Aggregates BillingDailyCost rows into day, Monday-start week, or multi-month buckets.
 * Falls back to daily buckets when `grain === 'month'` spans fewer than 2 distinct months so short windows stay informative.
 */
export function aggregateBillingDaysByGrain(
  days: ReadonlyArray<BillingDailyCost>,
  grain: TimeGrain,
): AggregatedBillingBucket[] {
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
  if (sorted.length === 0) return [];

  const distinctMonths = new Set(sorted.map((d) => d.day.slice(0, 7)));
  const effectiveGrain: TimeGrain =
    grain === 'month' && distinctMonths.size < 2 ? 'day' : grain;

  if (effectiveGrain === 'day') {
    return sorted.map((d) => {
      const parsed = Number(d.estimatedCostUsd);
      const numericUsd = Number.isFinite(parsed) && d.estimatedTokens > 0 ? parsed : 0;
      return {
        key: d.day,
        label: d.day.length >= 10 ? d.day.slice(5) : d.day,
        fullLabel: d.day,
        drillDate: d.day,
        estimatedCostUsd: d.estimatedCostUsd,
        numericUsd,
        estimatedTokens: d.estimatedTokens,
        unpricedTokens: d.unpricedTokens,
        excludedTokens: d.excludedTokens,
        isPartial: false,
      };
    });
  }

  const groups = new Map<string, BillingDailyCost[]>();
  for (const d of sorted) {
    const groupKey = effectiveGrain === 'week' ? getMondayDateKey(d.day) : d.day.slice(0, 7);
    const list = groups.get(groupKey);
    if (list) list.push(d);
    else groups.set(groupKey, [d]);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([groupKey, items]) => {
      let sumUsd = 0;
      let estimatedTokens = 0;
      let unpricedTokens = 0;
      let excludedTokens = 0;
      for (const row of items) {
        const parsed = Number(row.estimatedCostUsd);
        if (Number.isFinite(parsed) && row.estimatedTokens > 0) {
          sumUsd += parsed;
        }
        estimatedTokens += row.estimatedTokens;
        unpricedTokens += row.unpricedTokens;
        excludedTokens += row.excludedTokens;
      }
      const first = items[0]?.day ?? groupKey;
      const last = items[items.length - 1]?.day ?? groupKey;
      return {
        key: groupKey,
        label: effectiveGrain === 'week' && first.length >= 10 ? first.slice(5) : groupKey,
        fullLabel: effectiveGrain === 'week' ? (first === last ? first : `${first} ~ ${last}`) : groupKey,
        drillDate: last,
        estimatedCostUsd: sumUsd.toFixed(4),
        numericUsd: sumUsd,
        estimatedTokens,
        unpricedTokens,
        excludedTokens,
        isPartial: effectiveGrain === 'week' && items.length < 7,
      };
    });
}

export type PerBucketModelBarSegment = {
  id: string;
  label: string;
  value: number;
  color: string;
};

export type PerBucketModelBarEntry = {
  key: string;
  label: string;
  fullLabel: string;
  total: number;
  isPartial: boolean;
  segments: PerBucketModelBarSegment[];
};

/**
 * Computes per-bucket independent Top N models + Others so historical phase leaders
 * always render with their permanent model colors instead of vanishing into Others.
 */
export function buildPerBucketModelBars(
  buckets: ReadonlyArray<TimeBucket>,
  colorMap: ReadonlyMap<string, string>,
  othersLabel: string,
  topN = 5,
): PerBucketModelBarEntry[] {
  return buckets.map((bucket) => {
    const byModel = new Map<string, number>();
    let breakdownSum = 0;

    for (const row of bucket.modelBreakdowns) {
      const val = resolveBreakdownTokens(row);
      if (val <= 0) continue;
      byModel.set(row.modelName, (byModel.get(row.modelName) ?? 0) + val);
      breakdownSum += val;
    }

    const sortedModels = Array.from(byModel.entries()).sort((a, b) => b[1] - a[1]);
    const topModels = sortedModels.slice(0, topN);
    const segments: PerBucketModelBarSegment[] = topModels.map(([modelName, value]) => ({
      id: modelName,
      label: modelName,
      value,
      color:
        colorMap.get(modelName) ??
        resolveStableModelColor(modelName, resolveModelFamily(modelName)),
    }));

    const topSum = segments.reduce((sum, s) => sum + s.value, 0);
    const total = breakdownSum || bucket.totalTokens;
    const othersVal = Math.max(0, total - topSum);
    if (othersVal > 0) {
      segments.push({
        id: OTHERS_SERIES_ID,
        label: othersLabel,
        value: othersVal,
        color: CHART_MUTED_COLOR,
      });
    }

    return {
      key: bucket.key,
      label: bucket.label,
      fullLabel: bucket.fullLabel,
      total,
      isPartial: bucket.isPartial,
      segments,
    };
  });
}

/**
 * Builds area-chart series combining Global Top 5, historical stage heroes (per-bucket Top 2 / >= 25% peak),
 * and any user-pinned models up to `maxSeries` (default 8), strictly conserving totals via Others.
 */
export function buildStageHeroMigrationSeries(
  buckets: ReadonlyArray<TimeBucket>,
  models: ReadonlyArray<ModelUsageSummary>,
  colorMap: ReadonlyMap<string, string>,
  options?: { pinnedModels?: ReadonlyArray<string>; maxSeries?: number },
): ModelMigrationData {
  const maxSeries = Math.max(1, options?.maxSeries ?? 8);
  const pinnedModels = options?.pinnedModels ?? [];

  const totalByModel = new Map<string, number>();
  const peakShareByModel = new Map<string, number>();
  const top2CountByModel = new Map<string, number>();

  for (const bucket of buckets) {
    const entries = new Map<string, number>();
    let bucketSum = 0;
    for (const row of bucket.modelBreakdowns) {
      const val = resolveBreakdownTokens(row);
      if (val <= 0) continue;
      entries.set(row.modelName, (entries.get(row.modelName) ?? 0) + val);
      totalByModel.set(row.modelName, (totalByModel.get(row.modelName) ?? 0) + val);
      bucketSum += val;
    }

    if (bucketSum <= 0) continue;
    const ranked = Array.from(entries.entries()).sort((a, b) => b[1] - a[1]);
    ranked.forEach(([name, val], rankIdx) => {
      const share = val / bucketSum;
      const prevPeak = peakShareByModel.get(name) ?? 0;
      if (share > prevPeak) {
        peakShareByModel.set(name, share);
      }
      if (rankIdx < 2 && share >= 0.15) {
        top2CountByModel.set(name, (top2CountByModel.get(name) ?? 0) + 1);
      }
    });
  }

  const availableModelSet = new Set(totalByModel.keys());
  const selected: string[] = [];
  const selectedSet = new Set<string>();

  const pushUnique = (name: string) => {
    if (selected.length >= maxSeries || selectedSet.has(name) || !availableModelSet.has(name)) {
      return;
    }
    selected.push(name);
    selectedSet.add(name);
  };

  // Priority 1: explicit user-pinned models present in window
  for (const pin of pinnedModels) {
    pushUnique(pin);
  }

  // Priority 2: Global Top 5 cumulative models in current window
  const globalRanked = Array.from(totalByModel.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
  for (const name of globalRanked.slice(0, 5)) {
    pushUnique(name);
  }

  // Priority 3: Historical stage heroes ranked by peak share and recurring top-2 appearances
  const stageCandidates = Array.from(availableModelSet)
    .filter((name) => {
      if (selectedSet.has(name)) return false;
      const peak = peakShareByModel.get(name) ?? 0;
      const top2Count = top2CountByModel.get(name) ?? 0;
      return top2Count >= 1 || peak >= 0.25;
    })
    .map((name) => {
      const peak = peakShareByModel.get(name) ?? 0;
      const top2Count = top2CountByModel.get(name) ?? 0;
      const score = peak * 0.6 + Math.min(1, top2Count / 4) * 0.4;
      return { name, score, total: totalByModel.get(name) ?? 0 };
    })
    .sort((a, b) => b.score - a.score || b.total - a.total);

  for (const cand of stageCandidates) {
    pushUnique(cand.name);
  }

  // Backfill if window has fewer than maxSeries total models
  for (const name of globalRanked) {
    pushUnique(name);
  }

  const providerByModel = new Map<string, string>(
    models.map((m) => [m.modelName, m.provider]),
  );
  const colors: Record<string, string> = {};
  for (const name of selected) {
    colors[name] =
      colorMap.get(name) ??
      resolveStableModelColor(name, resolveModelFamily(name, providerByModel.get(name)));
  }

  let hasOthers = false;
  const parsedBuckets: ModelMigrationBucket[] = buckets.map((bucket) => {
    const byModel = new Map<string, number>();
    let bucketSum = 0;

    for (const row of bucket.modelBreakdowns) {
      const val = resolveBreakdownTokens(row);
      if (val <= 0) continue;
      byModel.set(row.modelName, (byModel.get(row.modelName) ?? 0) + val);
      bucketSum += val;
    }

    const shares: Record<string, number> = {};
    const tokensBySeries: Record<string, number> = {};
    let selectedSum = 0;

    for (const name of selected) {
      const val = byModel.get(name) ?? 0;
      tokensBySeries[name] = val;
      shares[name] = bucketSum > 0 ? val / bucketSum : 0;
      selectedSum += val;
    }

    const othersTokens = Math.max(0, bucketSum - selectedSum);
    if (othersTokens > 0) {
      hasOthers = true;
    }
    tokensBySeries[OTHERS_SERIES_ID] = othersTokens;
    shares[OTHERS_SERIES_ID] = bucketSum > 0 ? othersTokens / bucketSum : 0;

    return {
      key: bucket.key,
      label: bucket.label,
      fullLabel: bucket.fullLabel,
      totalTokens: bucketSum,
      shares,
      tokensBySeries,
    };
  });

  const seriesIds = hasOthers ? [...selected, OTHERS_SERIES_ID] : [...selected];
  if (hasOthers) {
    colors[OTHERS_SERIES_ID] = CHART_MUTED_COLOR;
  }

  return {
    seriesIds,
    hasOthers,
    colors,
    buckets: parsedBuckets,
  };
}

export type CalendarQuantileThresholds = {
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  hasData: boolean;
};

function interpolateQuantile(sortedAsc: ReadonlyArray<number>, q: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo];
  const frac = pos - lo;
  return sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac;
}

/**
 * Computes active-day quantile thresholds (P25 / P50 / P75 / P90) so a single extreme outlier day
 * does not flatten normal busy days down to the faintest calendar shade.
 */
export function computeCalendarQuantileThresholds(
  points: ReadonlyArray<Pick<DailyUsagePoint, 'totalTokens'>>,
): CalendarQuantileThresholds {
  const positives = points
    .map((p) => p.totalTokens || 0)
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);

  if (positives.length === 0) {
    return { p25: 0, p50: 0, p75: 0, p90: 0, hasData: false };
  }

  return {
    p25: interpolateQuantile(positives, 0.25),
    p50: interpolateQuantile(positives, 0.5),
    p75: interpolateQuantile(positives, 0.75),
    p90: interpolateQuantile(positives, 0.9),
    hasData: true,
  };
}

export function getCalendarIntensityLevel(
  tokens: number,
  thresholds: CalendarQuantileThresholds,
): { level: 0 | 1 | 2 | 3 | 4; isPeak: boolean } {
  if (!thresholds.hasData || !Number.isFinite(tokens) || tokens <= 0) {
    return { level: 0, isPeak: false };
  }
  const isPeak = tokens >= thresholds.p90;
  if (tokens <= thresholds.p25) return { level: 1, isPeak };
  if (tokens <= thresholds.p50) return { level: 2, isPeak };
  if (tokens <= thresholds.p75) return { level: 3, isPeak };
  return { level: 4, isPeak };
}

export type CostForecastResult = {
  ewmaSeries: Array<number | null>;
  weightedDailyUsd: number | null;
  projected30dUsd: number | null;
  projectedAnnualUsd: number | null;
};

/**
 * Computes an EWMA daily run-rate trend and forward 30d / annual spend projection
 * strictly over measured positive/recorded cost days.
 */
export function computeCostForecast(
  dailyCosts: ReadonlyArray<{ key: string; cost: number; hasData: boolean }>,
  alpha = 0.25,
): CostForecastResult {
  const ewmaSeries: Array<number | null> = [];
  let ewma: number | null = null;

  for (const item of dailyCosts) {
    if (!item.hasData || !Number.isFinite(item.cost)) {
      ewmaSeries.push(ewma);
      continue;
    }
    ewma = ewma === null ? item.cost : alpha * item.cost + (1 - alpha) * ewma;
    ewmaSeries.push(ewma);
  }

  if (ewma === null) {
    return {
      ewmaSeries,
      weightedDailyUsd: null,
      projected30dUsd: null,
      projectedAnnualUsd: null,
    };
  }

  return {
    ewmaSeries,
    weightedDailyUsd: ewma,
    projected30dUsd: ewma * 30,
    projectedAnnualUsd: ewma * 365,
  };
}

/**
 * Computes EWMA trend overlay across aggregated bar buckets (daily, weekly, or monthly cost bars).
 */
export function computeBucketEwmaSeries(
  values: ReadonlyArray<number>,
  alpha = 0.3,
): Array<number | null> {
  const result: Array<number | null> = [];
  let ewma: number | null = null;
  for (const val of values) {
    if (!Number.isFinite(val)) {
      result.push(ewma);
      continue;
    }
    if (ewma === null && val <= 0) {
      result.push(null);
      continue;
    }
    ewma = ewma === null ? val : alpha * val + (1 - alpha) * ewma;
    result.push(ewma);
  }
  return result;
}

/**
 * Computes an adaptive linear Y-axis domain in [0, 1] snapped cleanly to 5% increments
 * with a guaranteed >= 10% span so 80%–99% cache hit curves stay easy to distinguish.
 */
export function computeAdaptiveRateDomain(
  values: ReadonlyArray<number | null>,
): { yMin: number; yMax: number } {
  const valid = values.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1,
  );
  if (valid.length === 0) {
    return { yMin: 0, yMax: 1 };
  }
  const minVal = Math.min(...valid);
  const maxVal = Math.max(...valid);
  let yMin = Math.max(0, Math.floor((minVal - 0.04) * 20) / 20);
  const yMax = Math.min(1, Math.ceil((maxVal + 0.01) * 20) / 20);
  if (yMax - yMin < 0.1) {
    yMin = Math.max(0, Number((yMax - 0.1).toFixed(4)));
  }
  return {
    yMin: Number(yMin.toFixed(4)),
    yMax: Number(yMax.toFixed(4)),
  };
}

/**
 * Finds the historical natural day with highest positive token throughput (ranking by tokens, not cost).
 */
export function findPeakTokenDay(daily: ReadonlyArray<DailyUsagePoint>): DailyUsagePoint | null {
  let peak: DailyUsagePoint | null = null;
  for (const day of daily) {
    if (resolveBreakdownTokens(day) <= 0) continue;
    if (!peak || resolveBreakdownTokens(day) > resolveBreakdownTokens(peak)) {
      peak = day;
    }
  }
  return peak;
}
