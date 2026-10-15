import type { RawUsageEvent } from './types';

// Command Code publishes off-peak rates for these models. MiMo has flat rates.
// https://commandcode.ai/docs/resources/pricing-limits
// https://api-docs.deepseek.com/quick_start/pricing/
const SCHEDULED_MODELS = new Set([
  'deepseek-flash', 'deepseek-v4-pro', 'deepseek-v4-flash',
  'deepseek-v4-flash-vision-exp', 'deepseek-v4.1-flash', 'deepseek-v4.1-flash-fast',
]);

// Beijing holiday dates; weekends stay off-peak even on adjusted working days.
// State Council 2026 holiday notice: https://www.gov.cn/zhengce/content/202511/content_7047090.htm
const HOLIDAYS_2026 = [
  ['01-01', '01-03'], ['02-15', '02-23'], ['04-04', '04-06'],
  ['05-01', '05-05'], ['06-19', '06-21'], ['09-25', '09-27'], ['10-01', '10-07'],
];

export function commandCodePricingMultiplier(modelName: string, timestampMs: number) {
  const model = modelName.trim().toLowerCase().split('/').pop()!;
  if (!SCHEDULED_MODELS.has(model) || !Number.isFinite(timestampMs)) return undefined;
  const date = new Date(timestampMs);
  const beijingDate = new Date(timestampMs + 8 * 3_600_000).toISOString().slice(0, 10);
  const holiday = beijingDate.startsWith('2026-') && HOLIDAYS_2026.some(
    ([from, to]) => beijingDate.slice(5) >= from && beijingDate.slice(5) <= to,
  );
  const day = new Date(timestampMs + 8 * 3_600_000).getUTCDay();
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
  const isPeak = !holiday && day !== 0 && day !== 6
    && ((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10));
  return { multiplier: isPeak ? 2 : 1, isPeak };
}

export function applyCommandCodeQuota(event: RawUsageEvent): RawUsageEvent {
  if (event.sourceId !== 'commandcode' || event.timestampPrecision === 'day') return event;
  const schedule = commandCodePricingMultiplier(event.modelName, event.timestampMs);
  if (!schedule) return event;
  // Idempotent for native events; transfer bundles retain the original baseline.
  const nominalCost = event.nominalCost ?? event.cost;
  return { ...event, nominalCost, cost: nominalCost * schedule.multiplier,
    isPeak: schedule.isPeak, peakMultiplier: schedule.multiplier };
}
