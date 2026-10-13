import type { CcusageModelBreakdown, DailyUsagePoint } from '../../../domain';
import { MODEL_COLORS } from '../../model-colors';

export type ShareSegment = { id: string; tokens: number; share: number; color: string };

export function breakdownTokens(model: CcusageModelBreakdown): number {
  return model.inputTokens + model.outputTokens + model.cacheReadTokens
    + model.cacheCreationTokens + (model.reasoningTokens ?? 0);
}

export function modelSeries(points: DailyUsagePoint[]) {
  const totals = new Map<string, number>();
  for (const point of points) {
    for (const model of point.modelBreakdowns) {
      totals.set(model.modelName, (totals.get(model.modelName) ?? 0) + breakdownTokens(model));
    }
  }
  const total = [...totals.values()].reduce((sum, tokens) => sum + tokens, 0);
  return [...totals.entries()]
    .filter(([, tokens]) => tokens > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, tokens], index) => ({
      id, tokens, share: total > 0 ? tokens / total : 0,
      color: MODEL_COLORS[index] ?? `hsl(${Math.round(index * 137.508) % 360} 58% 55%)`,
    }));
}

export function modelShares(point: DailyUsagePoint, series: ShareSegment[]): ShareSegment[] {
  const totals = new Map<string, number>();
  for (const model of point.modelBreakdowns) {
    totals.set(model.modelName, (totals.get(model.modelName) ?? 0) + breakdownTokens(model));
  }
  const total = [...totals.values()].reduce((sum, tokens) => sum + tokens, 0);
  return series.map(model => ({
    ...model, tokens: totals.get(model.id) ?? 0,
    share: total > 0 ? (totals.get(model.id) ?? 0) / total : 0,
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
