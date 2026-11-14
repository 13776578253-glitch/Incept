import type { DatabaseSync } from 'node:sqlite';
import { billingComponents, billingInterval, decimalUnits, formatDecimal, type BillingRate, type BillingUsage } from '../../domain/usage-billing';
import { hash } from './imports/identity';

function normalizeComponents(perMillion: BillingRate['perMillion']) {
  const entries = Object.entries(perMillion);
  if (!entries.length || entries.some(([key]) => !billingComponents.some(component => component === key))) {
    throw Error('INVALID_USAGE_RATE_COMPONENTS');
  }
  return Object.fromEntries(entries.map(([key, value]) => [key, formatDecimal(decimalUnits(value, 12), 12)]));
}

export function initializeUsageRateCatalog(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_reference_rate_versions (
      version TEXT PRIMARY KEY, model TEXT NOT NULL, effective_from INTEGER NOT NULL,
      effective_to INTEGER, rate_json TEXT NOT NULL, UNIQUE (model,effective_from)
    );
  `);
}

/** The caller holds a write transaction for the full publication. */
export function publishUsageRates(db: DatabaseSync, rates: readonly BillingRate[], close: readonly { version: string; at: number }[] = []) {
  if (!db.isTransaction) throw Error('RATE_PUBLICATION_TRANSACTION_REQUIRED');
  const get = db.prepare('SELECT 1 FROM usage_reference_rate_versions WHERE version=?');
  const overlap = db.prepare(`SELECT 1 FROM usage_reference_rate_versions WHERE model=?
    AND (? IS NULL OR effective_from<?) AND (effective_to IS NULL OR effective_to>?) LIMIT 1`);
  const insert = db.prepare('INSERT INTO usage_reference_rate_versions VALUES (?,?,?,?,?)');
  const find = db.prepare('SELECT effective_from,effective_to,rate_json FROM usage_reference_rate_versions WHERE version=?');
  const closeVersion = db.prepare('UPDATE usage_reference_rate_versions SET effective_to=? WHERE version=? AND effective_to IS NULL');
  let closed = 0;
  for (const item of close) {
    const row = find.get(item.version);
    if (!row || !Number.isSafeInteger(item.at) || item.at <= Number(row.effective_from)) throw Error('INVALID_USAGE_RATE_CLOSE');
    if (row.effective_to === item.at) continue;
    if (row.effective_to !== null) throw Error('USAGE_RATE_ALREADY_CLOSED');
    const rate = JSON.parse(String(row.rate_json)) as BillingRate;
    if (rate.schedule?.periods.some(period => period.to > item.at)) throw Error('USAGE_RATE_CLOSE_INTERSECTS_SCHEDULE');
    closeVersion.run(item.at, item.version);
    closed++;
  }
  let added = 0;
  for (const rate of rates) {
    if (!rate || typeof rate !== 'object' || 'channel' in rate
      || typeof rate.model !== 'string' || !rate.model.trim() || rate.model !== rate.model.trim()
      || typeof rate.provider !== 'string' || !rate.provider.trim()
      || typeof rate.evidence !== 'string' || !rate.evidence.trim() || rate.currency !== 'USD'
      || !Number.isSafeInteger(rate.effectiveFrom) || rate.effectiveFrom < 0
      || (rate.effectiveTo !== undefined && (!Number.isSafeInteger(rate.effectiveTo) || rate.effectiveTo <= rate.effectiveFrom))) {
      throw Error('INVALID_USAGE_RATE');
    }
    const schedule = rate.schedule;
    if (schedule && (!schedule.version.trim() || !Array.isArray(schedule.periods) || schedule.periods.some((period, i) =>
      !Number.isSafeInteger(period.from) || !Number.isSafeInteger(period.to) || period.to <= period.from
      || period.from < rate.effectiveFrom || (rate.effectiveTo !== undefined && period.to > rate.effectiveTo)
      || (i > 0 && period.from < schedule.periods[i - 1].to)
      || decimalUnits(String(period.multiplier), 6) <= BigInt(0)))) {
      throw Error('INVALID_USAGE_RATE_SCHEDULE');
    }
    const longPrompt = rate.longPrompt;
    if (longPrompt !== undefined && (!Number.isSafeInteger(longPrompt?.aboveInputTokens) || longPrompt.aboveInputTokens <= 0)) {
      throw Error('INVALID_USAGE_RATE_LONG_PROMPT');
    }
    const { model, provider, currency, evidence, effectiveFrom, effectiveTo } = rate;
    const normalized: BillingRate = { model, provider, currency, evidence, effectiveFrom, effectiveTo,
      perMillion: normalizeComponents(rate.perMillion),
      ...(longPrompt ? { longPrompt: { aboveInputTokens: longPrompt.aboveInputTokens,
        perMillion: normalizeComponents(longPrompt.perMillion) } } : {}),
      ...(schedule ? { schedule: { version: schedule.version, periods: schedule.periods.map(({ from, to, multiplier }) =>
        ({ from, to, multiplier: formatDecimal(decimalUnits(String(multiplier), 6), 6) })) } } : {}) };
    const version = hash(['usage-reference-rate/1', normalized]);
    if (get.get(version)) continue;
    const to = rate.effectiveTo ?? null;
    if (overlap.get(model, to, to, effectiveFrom)) throw Error('USAGE_RATE_INTERVAL_OVERLAP');
    insert.run(version, model, effectiveFrom, to, JSON.stringify(normalized));
    added++;
  }
  return { added, closed };
}

export function readUsageRates(db: DatabaseSync) {
  const byModel = new Map<string, { version: string; rate: BillingRate }[]>();
  const versions: unknown[] = [];
  for (const row of db.prepare('SELECT version,rate_json,effective_to FROM usage_reference_rate_versions ORDER BY version').iterate()) {
    const version = String(row.version), rate = JSON.parse(String(row.rate_json)) as BillingRate;
    if (row.effective_to !== null) rate.effectiveTo = Number(row.effective_to);
    const existing = byModel.get(rate.model) ?? [];
    existing.push({ version, rate });
    byModel.set(rate.model, existing);
    versions.push([version, row.effective_to]);
  }
  return {
    version: hash(['usage-reference-rate-catalog/1', versions]),
    select(model: string, event: BillingUsage) {
      if (!Number.isSafeInteger(event.timestampMs) || event.timestampMs <= 0) return undefined;
      const [start, end] = billingInterval(event);
      return byModel.get(model)?.find(({ rate }) =>
        rate.effectiveFrom <= start && (rate.effectiveTo === undefined || end <= rate.effectiveTo));
    },
  };
}
