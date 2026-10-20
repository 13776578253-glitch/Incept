import type { CcusageModelBreakdown, DailyUsagePoint } from '../../../domain';
import { MODEL_COLORS } from '../../model-colors';

export type ShareSegment = { id: string; tokens: number; share: number; color: string;
  modelName?: string; billingPeriod?: 'peak' | 'offPeak'; cost?: number };

// Only this chart splits periods; model identities remain unchanged elsewhere.
function modelParts(point: DailyUsagePoint) {
  return point.modelBreakdowns.flatMap(model => {
    if (!model.billing) return [{ id: model.modelName, modelName: model.modelName,
      billingPeriod: undefined, tokens: breakdownTokens(model), cost: model.cost }];
    return (['standard', 'offPeak', 'peak'] as const).flatMap(period => {
      const part = model.billing?.[period];
      const billingPeriod = period === 'standard' ? undefined : period;
      return part ? [{ id: billingPeriod ? JSON.stringify([model.modelName, period]) : model.modelName,
        modelName: model.modelName, billingPeriod, tokens: part.totalTokens, cost: part.cost }] : [];
    });
  });
}

export function breakdownTokens(model: CcusageModelBreakdown): number {
  return model.inputTokens + model.outputTokens + model.cacheReadTokens
    + model.cacheCreationTokens + (model.reasoningTokens ?? 0);
}

function modelTotals(points: DailyUsagePoint[]) {
  const totals = new Map<string, ReturnType<typeof modelParts>[number]>();
  for (const point of points) {
    for (const part of modelParts(point)) {
      const previous = totals.get(part.id);
      totals.set(part.id, { ...part, tokens: (previous?.tokens ?? 0) + part.tokens,
        cost: (previous?.cost ?? 0) + part.cost });
    }
  }
  return totals;
}

export function modelSeries(points: DailyUsagePoint[]): ShareSegment[] {
  const totals = modelTotals(points);
  const total = [...totals.values()].reduce((sum, part) => sum + part.tokens, 0);
  return [...totals.values()].filter(part => part.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens || a.id.localeCompare(b.id))
    .map((part, index) => ({ ...part, share: total > 0 ? part.tokens / total : 0,
      color: MODEL_COLORS[index] ?? 'hsl(' + Math.round(index * 137.508) % 360 + ' 58% 55%)',
    }));
}

export function modelShares(point: DailyUsagePoint, series: ShareSegment[]): ShareSegment[] {
  const totals = modelTotals([point]);
  const total = [...totals.values()].reduce((sum, part) => sum + part.tokens, 0);
  return series.map(model => ({ ...model,
    tokens: totals.get(model.id)?.tokens ?? 0, cost: totals.get(model.id)?.cost ?? 0,
    share: total > 0 ? (totals.get(model.id)?.tokens ?? 0) / total : 0,
  })).filter(model => model.tokens > 0);
}

export function tokenShares(point: DailyUsagePoint): ShareSegment[] {
  const parts = [
    { id: 'input', tokens: point.inputTokens, color: MODEL_COLORS[2] },
    { id: 'cacheRead', tokens: point.cacheReadTokens, color: MODEL_COLORS[0] },
    { id: 'output', tokens: point.outputTokens, color: MODEL_COLORS[3] },
    { id: 'cacheWrite', tokens: point.cacheCreationTokens, color: MODEL_COLORS[1] },
    { id: 'reasoning', tokens: point.reasoningTokens, color: MODEL_COLORS[4] },
  ];
  const total = parts.reduce((sum, part) => sum + part.tokens, 0);
  return parts.map(part => ({ ...part, share: total > 0 ? part.tokens / total : 0 }));
}
