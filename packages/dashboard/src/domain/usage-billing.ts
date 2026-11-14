import type { TransferEvent } from './imports';
import { dashboardDate } from './window';

export const billingComponents = ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning'] as const;
export type BillingComponent = typeof billingComponents[number];
type ScheduleMultiplier = string | number;
type RatePeriod = { from: number; to: number; multiplier: ScheduleMultiplier };
export type BillingSchedule = { version: string } & (
  | { periods: RatePeriod[] }
  | { utcOffsetMinutes: number; weekdays: number[]; peakMultiplier: ScheduleMultiplier;
      peakHours: { from: string; to: string }[]; holidays: { from: string; to: string }[] }
);
export type BillingRate = {
  model: string;
  provider: string;
  currency: 'USD';
  evidence: string;
  effectiveFrom: number;
  effectiveTo?: number;
  perMillion: Partial<Record<BillingComponent, string>>;
  longPrompt?: { aboveInputTokens: number; perMillion: Partial<Record<BillingComponent, string>> };
  schedule?: BillingSchedule;
};

export type BillingUsage = TransferEvent & { timestampPrecision?: 'event' | 'day' };

export function usageComponentRates(event: BillingUsage, rate: BillingRate) {
  const input = event.inputTokens + event.cacheReadTokens + event.cacheCreationTokens;
  if (!rate.longPrompt || input <= rate.longPrompt.aboveInputTokens) return rate.perMillion;
  return event.timestampPrecision === 'day' ? undefined : rate.longPrompt.perMillion;
}

export function billingInterval(event: BillingUsage): readonly [number, number] {
  if (event.timestampPrecision !== 'day') return [event.timestampMs, event.timestampMs + 1];
  const start = Date.parse(dashboardDate(event.timestampMs) + 'T00:00:00+08:00');
  return [start, start + 86_400_000];
}

const minuteMs = 60_000;
const dayMs = 24 * 60 * minuteMs;

export function clockMinutes(value: string) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(value)) return NaN;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function scheduledPeriods(schedule: BillingSchedule | undefined, start: number, end: number): RatePeriod[] {
  if (!schedule) return [];
  if ('periods' in schedule) return schedule.periods.filter(period => period.from < end && period.to > start);

  const offset = schedule.utcOffsetMinutes * minuteMs;
  const periods: RatePeriod[] = [];
  for (let day = Math.floor((start + offset) / dayMs) * dayMs; day < end + offset; day += dayMs) {
    const date = new Date(day);
    if (!schedule.weekdays.includes(date.getUTCDay())) continue;
    const dateKey = date.toISOString().slice(0, 10);
    if (schedule.holidays.some(({ from, to }) => from <= dateKey && dateKey <= to)) continue;
    for (const hours of schedule.peakHours) {
      const from = day - offset + clockMinutes(hours.from) * minuteMs;
      const to = day - offset + clockMinutes(hours.to) * minuteMs;
      if (from < end && to > start) periods.push({ from, to, multiplier: schedule.peakMultiplier });
    }
  }
  return periods;
}

export type UsageCharge =
  | { status: 'estimated'; currency: 'USD'; amount: string; rateVersion: string }
  | { status: 'unpriced'; reason: 'RATE_NOT_FOUND' | 'RATE_COMPONENT_MISSING' | 'OCCURRENCE_TIME_UNKNOWN' | 'DAY_RATE_AMBIGUOUS' };

export function decimalUnits(value: string, scale: number): bigint {
  if (typeof value !== 'string' || !/^\d{1,64}(\.\d{1,24})?$/.test(value)) throw Error('INVALID_BILLING_DECIMAL');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > scale) throw Error('BILLING_DECIMAL_PRECISION');
  return BigInt(whole + fraction.padEnd(scale, '0'));
}

export function formatDecimal(units: bigint, scale: number): string {
  const digits = units.toString().padStart(scale + 1, '0');
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return digits.slice(0, -scale) + (fraction ? '.' + fraction : '');
}

// Ledger v2 uses numbers. Preserve the decimal representation supplied by
// JavaScript, including values serialized using scientific notation.
export function ledgerDecimal(value: number): string {
  if (!Number.isFinite(value) || value < 0) throw Error('INVALID_LEDGER_AMOUNT');
  const [mantissa, exponent = '0'] = String(value).split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const digits = whole + fraction, point = whole.length + Number(exponent);
  if (point <= 0) return '0.' + '0'.repeat(-point) + digits;
  if (point >= digits.length) return digits.padEnd(point, '0');
  return digits.slice(0, point) + '.' + digits.slice(point);
}

export function estimateUsage(event: BillingUsage, selected?: { version: string; rate: BillingRate }): UsageCharge {
  if (!Number.isSafeInteger(event.timestampMs) || event.timestampMs <= 0) {
    return { status: 'unpriced', reason: 'OCCURRENCE_TIME_UNKNOWN' };
  }
  if (!selected) return { status: 'unpriced', reason: 'RATE_NOT_FOUND' };
  const [start, end] = billingInterval(event);
  const periods = scheduledPeriods(selected.rate.schedule, start, end);
  const multipliers = new Set<bigint>();
  const baseMultiplier = BigInt(1_000_000);
  let coveredThrough = start;
  for (const period of periods) {
    if (period.from > coveredThrough) multipliers.add(baseMultiplier);
    multipliers.add(decimalUnits(String(period.multiplier), 6));
    coveredThrough = period.to;
  }
  if (coveredThrough < end) multipliers.add(baseMultiplier);
  if (multipliers.size !== 1) return { status: 'unpriced', reason: 'DAY_RATE_AMBIGUOUS' };
  const [multiplier] = multipliers;
  const perMillion = usageComponentRates(event, selected.rate);
  if (!perMillion) return { status: 'unpriced', reason: 'DAY_RATE_AMBIGUOUS' };
  const counts = [event.inputTokens, event.outputTokens, event.cacheReadTokens, event.cacheCreationTokens, event.reasoningTokens];
  let total = BigInt(0);
  for (const [index, component] of billingComponents.entries()) {
    const count = counts[index], rate = perMillion[component];
    if (!Number.isSafeInteger(count) || count < 0) throw Error('INVALID_BILLING_COUNTER');
    if (!count) continue;
    if (rate === undefined) return { status: 'unpriced', reason: 'RATE_COMPONENT_MISSING' };
    total += BigInt(count) * decimalUnits(rate, 12);
  }
  return { status: 'estimated', currency: selected.rate.currency,
    amount: formatDecimal(total * multiplier, 24), rateVersion: selected.version };
}
