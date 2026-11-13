import { DatabaseSync } from 'node:sqlite';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { initializeUsageRateCatalog, publishUsageRates, readUsageRates } from '../adapters/local/usage-rate-catalog';
import { readSyncView, type LedgerUsageMember } from '../adapters/local/imports/sync/read';
import { hash } from '../adapters/local/imports/identity';
import type { UnitPricing } from '../adapters/local/types';
import { billingComponents, decimalUnits, estimateUsage, formatDecimal, ledgerDecimal, usageComponentRates,
  type BillingComponent, type BillingRate } from '../domain/usage-billing';
import { identityLedgerStamp } from './usage-identity-backfill';
import { dateWindow, usageRanges } from '../domain/window';
import { billingLedgerVersion } from './billing-ledger-version';
import { readBillingChannelMappings } from './usage-billing-channel-mappings';

type Baseline = { checkedAt: number; rates: Record<string, UnitPricing>; aliases: Record<string, string> };

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizedEntries<T>(entries: Record<string, T>) {
  const normalized = new Map<string, T>();
  for (const [key, value] of Object.entries(entries)) {
    const model = key.trim().toLowerCase();
    if (!model || ['__proto__', 'constructor', 'prototype'].includes(model)) throw Error('INVALID_BILLING_BASELINE_KEY');
    if (normalized.has(model) && hash(normalized.get(model)) !== hash(value)) throw Error('DUPLICATE_BILLING_BASELINE_KEY');
    normalized.set(model, value);
  }
  return Object.fromEntries(normalized);
}

function readBillingBaseline(path: string): Baseline {
  const input: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isObject(input) || typeof input.checkedAt !== 'number' || !Number.isSafeInteger(input.checkedAt)
    || input.checkedAt <= 0 || !isObject(input.rates) || !isObject(input.aliases)) throw Error('INVALID_BILLING_BASELINE');
  for (const value of Object.values(input.rates)) {
    if (!isObject(value) || typeof value.inputPerMillion !== 'number' || typeof value.outputPerMillion !== 'number'
      || !Object.values(value).every(rate => typeof rate === 'number' && Number.isFinite(rate) && rate >= 0)) {
      throw Error('INVALID_BILLING_BASELINE_RATE');
    }
  }
  const aliases = Object.fromEntries(Object.entries(input.aliases).map(([key, value]) => {
    if (typeof value !== 'string' || !value.trim()) throw Error('INVALID_BILLING_BASELINE_ALIAS');
    return [key, value.trim()];
  }));
  return { checkedAt: input.checkedAt, rates: normalizedEntries(input.rates as Record<string, UnitPricing>),
    aliases: normalizedEntries(aliases) };
}

function writeSidecar<T>(path: string, action: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(realpathSync(path));
  try {
    db.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
    try {
      if (!db.prepare('SELECT scan_complete FROM usage_identity_backfill_v2 WHERE id=1').get()?.scan_complete
        || db.prepare("SELECT 1 FROM usage_ledger_identity_disposition WHERE disposition='pending' LIMIT 1").get()) {
        throw Error('IDENTITY_BACKFILL_INCOMPLETE');
      }
      initializeUsageRateCatalog(db);
      const result = action(db);
      db.exec('COMMIT');
      return result;
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw error;
    }
  } finally { db.close(); }
}

export function publishBillingCatalog(path: string, catalogPath: string) {
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as { rates: BillingRate[]; close?: { version: string; at: number }[] };
  if (!catalog || !Array.isArray(catalog.rates) || (catalog.close !== undefined && !Array.isArray(catalog.close))) {
    throw Error('INVALID_BILLING_CATALOG');
  }
  return writeSidecar(path, db => {
    const changes = publishUsageRates(db, catalog.rates, catalog.close);
    return { ok: true, ...changes, catalog: readUsageRates(db).version };
  });
}

const referenceKey = (member: Pick<LedgerUsageMember, 'kind' | 'container' | 'position' | 'observation'>) =>
  JSON.stringify([member.kind, member.container, member.position, member.observation]);

export function buildBillingDetails(sourcePath: string, sidecarPath: string, baselinePath: string, run: string, mappingsPath?: string) {
  if (!run.trim()) throw Error('INVALID_BILLING_RUN');
  const baseline = readBillingBaseline(baselinePath);
  const mappings = readBillingChannelMappings(mappingsPath);
  const sourceFile = statSync(sourcePath, { bigint: true }), sidecarFile = statSync(sidecarPath, { bigint: true });
  if (sourceFile.dev === sidecarFile.dev && sourceFile.ino === sidecarFile.ino) throw Error('DISTINCT_BILLING_SIDECAR_REQUIRED');
  sourcePath = realpathSync(sourcePath);
  const stamp = identityLedgerStamp(sourcePath);
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    return writeSidecar(sidecarPath, db => {
      const cursor = db.prepare('SELECT source,revision FROM usage_identity_backfill_v2 WHERE id=1').get();
      if (cursor?.source !== stamp) throw Error('BILLING_SOURCE_CHANGED');
      const rates = readUsageRates(db);
      const ledgerVersion = billingLedgerVersion(source);
      const input = hash(['usage-billing-run/3', baseline, stamp, rates.version, ledgerVersion.ledger,
        db.prepare('SELECT COALESCE(MAX(id),0) AS revision FROM usage_identity_audit').get()?.revision,
        ...(mappings.rules.length ? [mappings.rules] : [])]);
      db.exec(`
        CREATE TABLE IF NOT EXISTS usage_billing_runs (
          id TEXT PRIMARY KEY, input TEXT NOT NULL, catalog TEXT NOT NULL, baseline_json TEXT NOT NULL, result_json TEXT
        );
        CREATE TABLE IF NOT EXISTS usage_billing_details (
          run TEXT NOT NULL, member TEXT NOT NULL, event_id TEXT, disposition TEXT NOT NULL, source TEXT NOT NULL,
          model TEXT NOT NULL, project TEXT NOT NULL, day TEXT NOT NULL, counters_json TEXT NOT NULL,
          baseline_amount TEXT NOT NULL, baseline_priced INTEGER NOT NULL,
          charge_status TEXT NOT NULL, currency TEXT, amount TEXT, rate_version TEXT, reason TEXT,
          PRIMARY KEY (run,member)
        );
        CREATE TABLE IF NOT EXISTS usage_unpriced_models (
          run TEXT NOT NULL, channel TEXT NOT NULL, model TEXT NOT NULL, reason TEXT NOT NULL,
          observations INTEGER NOT NULL, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL,
          PRIMARY KEY (run,channel,model,reason)
        );
      `);
      const previous = db.prepare('SELECT input,result_json FROM usage_billing_runs WHERE id=?').get(run);
      if (previous) {
        if (previous.input !== input) throw Error('BILLING_RUN_INPUT_CHANGED');
        return { ...JSON.parse(String(previous.result_json)), reused: true };
      }
      db.prepare('INSERT INTO usage_billing_runs VALUES (?,?,?,?,NULL)').run(run, input, rates.version, JSON.stringify(baseline));
      const identity = db.prepare(`SELECT observation,disposition,event_id FROM usage_ledger_identity_disposition
        WHERE scope=? AND position=?`);
      const insert = db.prepare('INSERT INTO usage_billing_details VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      const noteUnpriced = db.prepare(`INSERT INTO usage_unpriced_models VALUES (?,?,?,?,1,?,?)
        ON CONFLICT (run,channel,model,reason) DO UPDATE SET observations=observations+1,
          first_seen=MIN(first_seen,excluded.first_seen),last_seen=MAX(last_seen,excluded.last_seen)`);
      const totals = { members: 0, mapped: 0, unproven: 0, conflict: 0, legacy: 0,
        recorded: 0, estimated: 0, unpriced: 0, excluded: 0, silentUnpriced: 0,
        considered: 0, consideredCurrent: 0, consideredLegacy: 0,
        skippedAfterCutoff: 0, skippedZeroTokens: 0 };
      const windows = usageRanges.map(range => ({ range, ...dateWindow(range, baseline.checkedAt),
        members: 0, tokens: 0, baselineCost: 0, unpricedTokens: 0, recordedUnknownCurrency: 0,
        estimated: new Map<string, bigint>() }));
      const revision = () => Number(source.prepare('SELECT data_revision FROM sync_meta WHERE id=1').get()?.data_revision);
      const view = readSyncView({ db: source, revision }, [], new Map(Object.entries(baseline.rates)), baseline.aliases, (member, visible) => {
        totals.considered++;
        if (member.kind === 'current') totals.consideredCurrent++;
        else totals.consideredLegacy++;
        if (visible.timestampMs > baseline.checkedAt) {
          totals.skippedAfterCutoff++;
          return;
        }
        const row = member.kind === 'current' ? identity.get(member.container, member.position) : undefined;
        if (member.kind === 'current' && row?.observation !== member.observation) throw Error('BILLING_MEMBER_IDENTITY_MISMATCH');
        const disposition = member.kind === 'legacy' ? 'legacy' : row?.disposition;
        if (disposition !== 'mapped' && disposition !== 'unproven' && disposition !== 'conflict' && disposition !== 'legacy') {
          throw Error('INVALID_BILLING_DISPOSITION');
        }
        const event = { ...member.event, timestampPrecision: visible.timestampPrecision };
        const counters: Record<BillingComponent, number> = { input: event.inputTokens, output: event.outputTokens,
          cacheRead: event.cacheReadTokens, cacheWrite: event.cacheCreationTokens, reasoning: event.reasoningTokens };
        const tokens = Object.values(counters).reduce((sum, count) => sum + count, 0);
        if (tokens <= 0) {
          totals.skippedZeroTokens++;
          return;
        }
        const mapping = mappings.get(event.source, event.modelName);
        const selected = rates.select(mapping?.action === 'rate'
          ? { ...event, source: mapping.rateChannel ?? event.source, modelName: mapping.rateModel }
          : event);
        const charge = mapping?.action === 'exclude' && event.recordedCost === undefined
          ? { status: 'excluded' as const, reason: 'CHANNEL_ROUTE_EXCLUDED' }
          : estimateUsage(event, selected);
        const perMillion = selected && usageComponentRates(event, selected.rate);
        const silent = charge.status === 'unpriced' && charge.reason === 'RATE_COMPONENT_MISSING'
          && mapping?.action === 'silence-missing-cache-write' && perMillion && counters.cacheWrite > 0
          && perMillion.cacheWrite === undefined
          && billingComponents.every(component => component === 'cacheWrite' || counters[component] === 0
            || perMillion[component] !== undefined);
        if (silent) totals.silentUnpriced++;
        insert.run(run, referenceKey(member), row?.event_id ?? null, disposition, event.source, event.modelName,
          visible.projectKey, visible.dateKey, JSON.stringify(counters), ledgerDecimal(visible.cost), visible.missingPricing ? 0 : 1,
          charge.status, 'currency' in charge ? charge.currency : null, 'amount' in charge ? charge.amount : null,
          'rateVersion' in charge ? charge.rateVersion : null, 'reason' in charge ? charge.reason : null);
        totals.members++;
        totals[disposition]++;
        totals[charge.status]++;
        if (charge.status === 'unpriced' && !silent) noteUnpriced.run(run, event.source, event.modelName, charge.reason,
          event.timestampMs, event.timestampMs);
        for (const window of windows) {
          if ((window.range !== 'all' && visible.dateKey < window.from) || visible.dateKey > window.to) continue;
          window.members++;
          window.tokens += tokens;
          window.baselineCost += visible.cost;
          if (charge.status === 'unpriced' && !silent) window.unpricedTokens += tokens;
          if (charge.status === 'recorded' && charge.currency === null) window.recordedUnknownCurrency++;
          if (charge.status === 'estimated') {
            const units = decimalUnits(charge.amount, 24);
            window.estimated.set(charge.currency, (window.estimated.get(charge.currency) ?? 0n) + units);
          }
        }
      });
      if (view.dataRevision !== cursor.revision || identityLedgerStamp(sourcePath) !== stamp) throw Error('BILLING_SOURCE_CHANGED');
      const indexedMembers = Number(db.prepare('SELECT COUNT(*) AS n FROM usage_ledger_identity').get()?.n);
      if (indexedMembers !== totals.consideredCurrent) throw Error('BILLING_VISIBLE_MEMBER_COUNT_MISMATCH');
      const result = { ok: true, run, ...ledgerVersion, catalog: rates.version, indexedMembers, ...totals,
        ...(mappings.rules.length ? { channelMappings: mappings.rules } : {}),
        windows: windows.map(({ range, members, tokens, baselineCost, unpricedTokens, recordedUnknownCurrency, estimated }) =>
          ({ range, members, tokens, baselineCost, unpricedTokens, recordedUnknownCurrency,
            estimatedByCurrency: Object.fromEntries([...estimated].map(([currency, amount]) => [currency, formatDecimal(amount, 24)])) })) };
      db.prepare('UPDATE usage_billing_runs SET result_json=? WHERE id=?').run(JSON.stringify(result), run);
      return result;
    });
  } finally { source.close(); }
}
