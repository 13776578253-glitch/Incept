import type { TransferEvent, TransferSource } from './imports';

export const billingComponents = ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning'] as const;
export type BillingComponent = typeof billingComponents[number];
export type BillingRate = {
  channel: TransferSource;
  model: string;
  provider: string;
  currency: string;
  evidence: string;
  effectiveFrom: number;
  effectiveTo?: number;
  perMillion: Partial<Record<BillingComponent, string>>;
  // An independently versioned rule can be published as explicit UTC periods.
  schedule?: { version: string; periods: { from: number; to: number; multiplier: number }[] };
};

export type UsageCharge =
  | { status: 'recorded'; currency: string | null; amount: string }
  | { status: 'estimated'; currency: string; amount: string; rateVersion: string }
  | { status: 'unpriced'; reason: 'RATE_NOT_FOUND' | 'RATE_COMPONENT_MISSING' | 'OCCURRENCE_TIME_UNKNOWN' };

export function decimalUnits(value: string, scale: number): bigint {
  if (typeof value !== 'string' || !/^\d{1,64}(\.\d{1,18})?$/.test(value)) throw Error('INVALID_BILLING_DECIMAL');
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

export function estimateUsage(event: TransferEvent, selected?: { version: string; rate: BillingRate }): UsageCharge {
  if (event.recordedCost !== undefined) {
    // The old transfer format records a number and carries no currency field.
    return { status: 'recorded', currency: null, amount: ledgerDecimal(event.recordedCost) };
  }
  if (!Number.isSafeInteger(event.timestampMs) || event.timestampMs <= 0) {
    return { status: 'unpriced', reason: 'OCCURRENCE_TIME_UNKNOWN' };
  }
  if (!selected) return { status: 'unpriced', reason: 'RATE_NOT_FOUND' };
  const counts = [event.inputTokens, event.outputTokens, event.cacheReadTokens, event.cacheCreationTokens, event.reasoningTokens];
  let total = 0n;
  for (const [index, component] of billingComponents.entries()) {
    const count = counts[index], rate = selected.rate.perMillion[component];
    if (!Number.isSafeInteger(count) || count < 0) throw Error('INVALID_BILLING_COUNTER');
    if (!count) continue;
    if (rate === undefined) return { status: 'unpriced', reason: 'RATE_COMPONENT_MISSING' };
    total += BigInt(count) * decimalUnits(rate, 12);
  }
  const period = selected.rate.schedule?.periods.find(({ from, to }) => from <= event.timestampMs && event.timestampMs < to);
  return { status: 'estimated', currency: selected.rate.currency,
    amount: formatDecimal(total * BigInt(period?.multiplier ?? 1), 18), rateVersion: selected.version };
}
