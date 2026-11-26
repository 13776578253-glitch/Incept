import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { TransferEvent } from '../domain';
import type { BillingRate, BillingUsage } from '../domain/usage-billing';
import { resolveModelIdentity } from '../domain/model-registry';
import { summarizeUsageEvents } from '../adapters/local/aggregation/summarize';
import { usageEvent } from '../adapters/local/collectors/common';
import { hash } from '../adapters/local/imports/identity';
import { loadLocalPricingMap, lookupPricing } from '../adapters/local/pricing';
import { initializeUsageRateCatalog, publishUsageRates, readUsageRates } from '../adapters/local/usage-rate-catalog';
import { estimateLedgerUsage } from '../sync/billing-usage-estimate';
import { readBillingChannelMappings } from '../sync/usage-billing-channel-mappings';

const CATALOG_PATH = resolve(import.meta.dirname, '../../../../docs/plans/dashboard-billing-reference-catalog-2026-11-26.json');
const PACKAGE_CATALOG_PATH = resolve(import.meta.dirname, '../sync/usage-billing-reference-catalog.json');

function loadApprovedRates() {
  const db = new DatabaseSync(':memory:');
  db.exec('BEGIN');
  initializeUsageRateCatalog(db);
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as { rates: BillingRate[] };
  const published = publishUsageRates(db, catalog.rates);
  db.exec('COMMIT');
  const rates = readUsageRates(db);
  db.close();
  return { published, rates, count: catalog.rates.length };
}

function makeUsage(overrides: Partial<BillingUsage> & { source: TransferEvent['source']; modelName: string; timestampMs: number }): BillingUsage {
  return {
    eventId: hash(['pricing-test', overrides.source, overrides.modelName, overrides.timestampMs]),
    source: overrides.source,
    sessionId: 'pricing-policy-test',
    timestampMs: overrides.timestampMs,
    modelName: overrides.modelName,
    projectKey: 'proj:1111111111111111',
    projectName: 'Incept',
    inputTokens: overrides.inputTokens ?? 1_000_000,
    outputTokens: overrides.outputTokens ?? 100_000,
    cacheReadTokens: overrides.cacheReadTokens ?? 1_000_000,
    cacheCreationTokens: overrides.cacheCreationTokens ?? 0,
    reasoningTokens: overrides.reasoningTokens ?? 50_000,
    ...(overrides.cacheWriteTtl ? { cacheWriteTtl: overrides.cacheWriteTtl } : {}),
  };
}

describe('2026-11-26 Owner billing catalog, channel mappings, and reasoning-effort policy', () => {
  it('publishes all 36 approved rate versions with zero interval overlaps', () => {
    const { published, count } = loadApprovedRates();
    expect(count).toBe(36);
    expect(published.added).toBe(36);
    expect(published.closed).toBe(0);
  });

  it('prices all reasoning-effort tiers in confirmed families identically without modifying token counts or excluding usage', () => {
    const { rates } = loadApprovedRates();
    const mappings = readBillingChannelMappings();
    const at = Date.parse('2026-11-25T12:00:00Z');
    const efforts = ['low', 'medium', 'high', 'xhigh', 'extra-high'] as const;
    const families = [
      'claude-opus-5-5',
      'claude-sonnet-5-5',
      'gemini-4-neon',
      'gemini-4-hydrogen',
      'gemini-4-carbon',
      'gpt-oss-120b',
    ] as const;

    for (const base of families) {
      const baseResult = estimateLedgerUsage(makeUsage({ source: 'antigravity', modelName: base, timestampMs: at }), rates, mappings);
      expect(baseResult.charge.status).toBe('estimated');
      for (const effort of efforts) {
        const variant = `${base}-${effort}`;
        const result = estimateLedgerUsage(makeUsage({ source: 'antigravity', modelName: variant, timestampMs: at }), rates, mappings);
        expect(result.model).toBe(base);
        expect(result.charge).toEqual(baseResult.charge);
        expect(result.tokens).toBe(baseResult.tokens);
        expect(result.counters).toEqual(baseResult.counters);
        expect(result.silent).toBe(false);

        const identity = resolveModelIdentity(variant, 'antigravity');
        expect(identity.canonicalModelId).toBe(base);
        expect(identity.reasoningEffort).toBe(effort);
      }
    }
  });

  it('does not blindly strip unknown suffixes or unapproved model families', () => {
    const { rates } = loadApprovedRates();
    const mappings = readBillingChannelMappings();
    const at = Date.parse('2026-11-25T12:00:00Z');

    for (const unknownModel of ['claude-opus-5-5-turbo', 'gemini-4-carbon-exp-z', 'unapproved-model-high']) {
      const res = estimateLedgerUsage(makeUsage({ source: 'antigravity', modelName: unknownModel, timestampMs: at }), rates, mappings);
      expect(res.charge).toEqual({ status: 'unpriced', reason: 'RATE_NOT_FOUND' });
      const identity = resolveModelIdentity(unknownModel, 'antigravity');
      expect(identity.canonicalModelId).toBe(unknownModel);
      expect(identity.reasoningEffort).toBeUndefined();
    }
  });

  it('enforces exact UTC date boundaries for gemini-4-carbon, claude-sonnet-5-5, and gpt-oss-120b', () => {
    const { rates } = loadApprovedRates();
    const mappings = readBillingChannelMappings();

    // gemini-4-carbon: promo ($2/$10/$0.1) through Nov 30, standard ($4/$20/$0.2) from Dec 1 UTC
    const carbonPromo = estimateLedgerUsage(makeUsage({
      source: 'antigravity', modelName: 'gemini-4-carbon', timestampMs: Date.parse('2026-11-30T23:59:59.999Z'),
      inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, reasoningTokens: 0,
    }), rates, mappings);
    const carbonStd = estimateLedgerUsage(makeUsage({
      source: 'antigravity', modelName: 'gemini-4-carbon', timestampMs: Date.parse('2026-12-01T00:00:00.000Z'),
      inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, reasoningTokens: 0,
    }), rates, mappings);
    expect(carbonPromo.charge).toMatchObject({ status: 'estimated', amount: '2' });
    expect(carbonStd.charge).toMatchObject({ status: 'estimated', amount: '4' });

    // claude-sonnet-5-5: cacheRead $0.20 through Oct 6, $0.10 from Oct 7 UTC
    const sonnetOld = estimateLedgerUsage(makeUsage({
      source: 'antigravity', modelName: 'claude-sonnet-5-5-medium', timestampMs: Date.parse('2026-10-06T23:59:59.999Z'),
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000, reasoningTokens: 0,
    }), rates, mappings);
    const sonnetNew = estimateLedgerUsage(makeUsage({
      source: 'antigravity', modelName: 'claude-sonnet-5-5-medium', timestampMs: Date.parse('2026-10-07T00:00:00.000Z'),
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000, reasoningTokens: 0,
    }), rates, mappings);
    expect(sonnetOld.charge).toMatchObject({ status: 'estimated', amount: '0.2' });
    expect(sonnetNew.charge).toMatchObject({ status: 'estimated', amount: '0.1' });

    // gpt-oss-120b: effective 2026-11-23T00:00:00Z
    const ossBefore = estimateLedgerUsage(makeUsage({
      source: 'antigravity', modelName: 'gpt-oss-120b-medium', timestampMs: Date.parse('2026-11-22T23:59:59.999Z'),
    }), rates, mappings);
    const ossAfter = estimateLedgerUsage(makeUsage({
      source: 'antigravity', modelName: 'gpt-oss-120b-medium', timestampMs: Date.parse('2026-11-23T00:00:00.000Z'),
      inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 1_000_000, reasoningTokens: 0,
    }), rates, mappings);
    expect(ossBefore.charge).toEqual({ status: 'unpriced', reason: 'RATE_NOT_FOUND' });
    expect(ossAfter.charge).toMatchObject({ status: 'estimated', amount: '0.225' });
  });

  it('estimates explicit 5m/1h cache-write TTLs and defaults historical unknown TTL to 5m (matching exact $6.933845)', () => {
    const { rates } = loadApprovedRates();
    const mappings = readBillingChannelMappings();
    const at = Date.parse('2026-10-10T00:00:00Z');

    // Exact 1,386,769 historical cacheCreationTokens on claudeCode / claude-opus-5-5
    const opusHistorical = estimateLedgerUsage(makeUsage({
      source: 'claudeCode', modelName: 'claude-opus-5-5', timestampMs: at,
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 1_386_769, reasoningTokens: 0,
    }), rates, mappings);
    expect(opusHistorical.charge).toMatchObject({ status: 'estimated', amount: '6.933845' });
    expect(opusHistorical.silent).toBe(false);

    const opus1h = estimateLedgerUsage(makeUsage({
      source: 'claudeCode', modelName: 'claude-opus-5-5', timestampMs: at,
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 1_386_769, reasoningTokens: 0,
      cacheWriteTtl: '1h',
    }), rates, mappings);
    expect(opus1h.charge).toMatchObject({ status: 'estimated', amount: '11.094152' });

    const sonnet5m = estimateLedgerUsage(makeUsage({
      source: 'antigravity', modelName: 'claude-sonnet-5-5-high', timestampMs: Date.parse('2026-11-25T08:00:00Z'),
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 1_000_000, reasoningTokens: 0,
    }), rates, mappings);
    const sonnet1h = estimateLedgerUsage(makeUsage({
      source: 'antigravity', modelName: 'claude-sonnet-5-5-high', timestampMs: Date.parse('2026-11-25T08:00:00Z'),
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 1_000_000, reasoningTokens: 0,
      cacheWriteTtl: '1h',
    }), rates, mappings);
    expect(sonnet5m.charge).toMatchObject({ status: 'estimated', amount: '2.5' });
    expect(sonnet1h.charge).toMatchObject({ status: 'estimated', amount: '4' });
  });

  it('maps internal Antigravity aliases and preserves Codex auto-review exclusions', () => {
    const { rates } = loadApprovedRates();
    const mappings = readBillingChannelMappings();
    const at = Date.parse('2026-11-20T00:00:00Z');

    expect(estimateLedgerUsage(makeUsage({ source: 'antigravity', modelName: 'gemini-flash-worker-agy', timestampMs: at }), rates, mappings))
      .toMatchObject({ model: 'gemini-4-hydrogen', charge: { status: 'estimated' } });
    expect(estimateLedgerUsage(makeUsage({ source: 'antigravity', modelName: 'gemini-pro-orchestrator-g1-pro', timestampMs: at }), rates, mappings))
      .toMatchObject({ model: 'gemini-4-argon', charge: { status: 'estimated' } });
    expect(estimateLedgerUsage(makeUsage({ source: 'antigravity', modelName: 'gemini-pro-orchestrator-neon', timestampMs: at }), rates, mappings))
      .toMatchObject({ model: 'gemini-4-neon', charge: { status: 'estimated' } });

    expect(estimateLedgerUsage(makeUsage({ source: 'codex', modelName: 'codex-auto-review', timestampMs: at }), rates, mappings).charge)
      .toEqual({ status: 'excluded', reason: 'CHANNEL_ROUTE_EXCLUDED' });
    expect(estimateLedgerUsage(makeUsage({ source: 'codex', modelName: 'codex-auto-review-unpriced', timestampMs: at }), rates, mappings).charge)
      .toEqual({ status: 'excluded', reason: 'CHANNEL_ROUTE_EXCLUDED' });
  });

  it('keeps package JSON catalog in sync and powers local Usage pricing without merging internal models', () => {
    expect(JSON.parse(readFileSync(PACKAGE_CATALOG_PATH, 'utf8'))).toEqual(JSON.parse(readFileSync(CATALOG_PATH, 'utf8')));

    const home = mkdtempSync(join(tmpdir(), 'dashboard-unified-json-pricing-'));
    try {
      const now = Date.parse('2026-11-26T00:00:00Z');
      const pricing = loadLocalPricingMap(home, { aliases: {}, prices: {}, updatedAt: 0 }, now);

      // Internal-prefix models borrow rates from the JSON catalog & mappings without merging display identities
      expect(lookupPricing(pricing, 'gemini-flash-worker-agy')).toEqual({ inputPerMillion: 1.5, outputPerMillion: 7.5, cacheReadPerMillion: 0.075 });
      expect(lookupPricing(pricing, 'gemini-pro-orchestrator-g1-pro')).toEqual({ inputPerMillion: 2, outputPerMillion: 10, cacheReadPerMillion: 0.1 });
      expect(lookupPricing(pricing, 'gemini-pro-orchestrator-neon')).toEqual({ inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.15 });
      expect(lookupPricing(pricing, 'gemini-3.8-flash-tiered')).toEqual({ inputPerMillion: 0.75, outputPerMillion: 3.75, cacheReadPerMillion: 0.075 });
      expect(lookupPricing(pricing, 'gpt-6.1-terra')).toEqual({ inputPerMillion: 1, outputPerMillion: 5, cacheReadPerMillion: 0.05 });
      expect(lookupPricing(pricing, 'claude-opus-5-5-high')).toEqual({
        inputPerMillion: 4,
        outputPerMillion: 20,
        cacheReadPerMillion: 0.2,
        cacheWritePerMillion: 5,
      });

      const events = [
        usageEvent({
          sourceId: 'antigravity',
          sourceLabel: 'Antigravity',
          sessionId: 's-worker',
          modelName: 'gemini-flash-worker-agy',
          timestampMs: now,
          inputTokens: 1_000_000,
          outputTokens: 100_000,
        }, pricing),
        usageEvent({
          sourceId: 'antigravity',
          sourceLabel: 'Antigravity',
          sessionId: 's-orch',
          modelName: 'gemini-pro-orchestrator-g1-pro',
          timestampMs: now,
          inputTokens: 1_000_000,
        }, pricing),
        usageEvent({
          sourceId: 'antigravity',
          sourceLabel: 'Antigravity',
          sessionId: 's-opus-high',
          modelName: 'claude-opus-5-5-high',
          timestampMs: now,
          inputTokens: 500_000,
          cacheCreationTokens: 200_000,
        }, pricing),
        usageEvent({
          sourceId: 'codex',
          sourceLabel: 'Codex CLI',
          sessionId: 's-review',
          modelName: 'codex-auto-review',
          timestampMs: now,
          inputTokens: 1_000_000,
        }, pricing),
      ];

      const summary = summarizeUsageEvents(events, home, pricing, now);
      const names = summary.models.map(model => model.modelName);
      // Internal-prefix models stay independent; effort suffix on Opus is stripped
      expect(names).toContain('gemini-flash-worker-agy');
      expect(names).toContain('gemini-pro-orchestrator-g1-pro');
      expect(names).toContain('claude-opus-5-5');
      expect(names).not.toContain('claude-opus-5-5-high');
      // Policy-excluded codex-auto-review does not trigger missing-pricing alerts
      expect(summary.costs.unpricedModels).toEqual([]);
      expect(summary.costs.unpricedTokens).toBe(0);
      expect(summary.costs.tokenCoverageRate).toBe(1);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
