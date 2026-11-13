import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it, vi } from 'vitest';
import { CompatibleSyncService } from '../adapters/local/imports/sync/legacy';
import { hash } from '../adapters/local/imports/identity';
import { estimateUsage, type BillingRate } from '../domain/usage-billing';
import type { TransferEvent } from '../domain/imports';
import { runMaintenance } from '../sync/maintenance';
import { backfillUsageIdentity } from '../sync/usage-identity-backfill';
import { fromEvents } from './fixtures/events';
import { PHASE0_NOW, phase0Export, phase0Import, writePhase0Home } from './fixtures/sync-agent-phase0';
import { projection } from '../sync/projection';
import { loadLocalPricingMap } from '../adapters/local/pricing';
import { readLocalOverrides } from '../adapters/local/overrides';

const time = Date.UTC(2026, 9, 15);
const scope = { source: 'antigravity', sessionId: 'billing', originId: 'origin',
  deviceId: '02421821-b6f6-4292-8271-9546f7d65ddd' } as const;
const owner = { role: 'owner', subject: 'test', reason: 'billing fixture' } as const;
const event: TransferEvent = {
  eventId: hash('base'), source: scope.source, sessionId: scope.sessionId, timestampMs: time, modelName: 'provider/a',
  projectKey: 'fixture', projectName: 'Fixture', inputTokens: 100, outputTokens: 0,
  cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0,
};
const rate: BillingRate = { channel: scope.source, provider: 'provider', model: event.modelName,
  currency: 'USD', evidence: 'fixture', effectiveFrom: time - 1000, perMillion: { input: '0.125' } };

it('computes exact estimates, applies a versioned period, and preserves recorded zero', () => {
  expect(estimateUsage(event, { version: 'first', rate })).toMatchObject({ status: 'estimated', amount: '0.0000125' });
  const scheduled = { ...rate, schedule: { version: 'peak-v1', periods: [{ from: time, to: time + 1, multiplier: 2 }] } };
  expect(estimateUsage(event, { version: 'peak', rate: scheduled })).toMatchObject({ amount: '0.000025' });
  expect(estimateUsage({ ...event, cacheReadTokens: 1 }, { version: 'first', rate }))
    .toEqual({ status: 'unpriced', reason: 'RATE_COMPONENT_MISSING' });
  expect(estimateUsage({ ...event, recordedCost: 0 }, { version: 'first', rate: scheduled }))
    .toEqual({ status: 'recorded', currency: null, amount: '0' });
});

it('retains all member references, publishes exact new rates, and pins previous billing runs', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'incept-billing-'));
  try {
    const source = join(directory, 'source.db'), sidecar = join(directory, 'billing.db');
    const catalog = join(directory, 'rates.json'), baseline = join(directory, 'baseline.json');
    const service = new CompatibleSyncService(source);
    try {
      const { header, records } = fromEvents([
        event,
        { ...event, eventId: hash('other-provider'), modelName: 'other/a' },
        { ...event, eventId: hash('same-key'), modelName: 'provider/b', recordedCost: 0 },
        { ...event, eventId: hash('conflict'), modelName: 'provider/c' },
      ], scope);
      service.register(scope, 'billing fixture', owner);
      service.begin(header, owner);
      service.stage(scope.deviceId, header.batchId, 0, records, owner);
      expect(service.commit(scope.deviceId, header.batchId, owner).status).toBe('committed');
      const update = service.db.prepare(`UPDATE sync_observations SET record_json=? WHERE id=(
        SELECT observation_id FROM sync_current WHERE position=?)`);
      update.run(JSON.stringify({ ...records[1], nativeKey: { source: scope.source, keyHash: ' ' } }), 1);
      update.run(JSON.stringify({ ...records[3], nativeKey: records[2].nativeKey }), 3);
    } finally { service.close(); }

    expect(backfillUsageIdentity(source, sidecar, 100)).toMatchObject({ mapped: 1, unproven: 1, conflicts: 2 });
    writeFileSync(baseline, JSON.stringify({ checkedAt: time, rates: { 'provider/a': { inputPerMillion: 2, outputPerMillion: 2 } }, aliases: {} }));
    const publish = async (rates: BillingRate[], close?: { version: string; at: number }[]) => {
      writeFileSync(catalog, JSON.stringify({ rates, close }));
      return runMaintenance(['publish-usage-rates', '--sidecar=' + sidecar, '--catalog=' + catalog], {});
    };
    const build = (run: string) => runMaintenance(['build-usage-billing', '--source=' + source, '--sidecar=' + sidecar,
      '--baseline=' + baseline, '--run=' + run], {});
    await expect(publish([rate])).resolves.toMatchObject({ added: 1 });
    await expect(publish([{ ...rate, perMillion: { input: '0.1250' } }])).resolves.toMatchObject({ added: 0 });
    await expect(build('first')).resolves.toMatchObject({ members: 4, mapped: 1, unproven: 1, conflict: 2,
      recorded: 1, estimated: 1, unpriced: 2, windows: expect.arrayContaining([{ range: 'all', members: 4,
        tokens: 400, baselineCost: expect.any(Number), unpricedTokens: 200, estimatedByCurrency: { USD: '0.0000125' } }]) });
    await expect(build('first')).resolves.toMatchObject({ reused: true });
    await expect(publish([{ ...rate, model: 'provider/c' }, { ...rate, evidence: 'overlap' }])).rejects.toThrow('USAGE_RATE_INTERVAL_OVERLAP');

    const db = new DatabaseSync(sidecar, { readOnly: true });
    try {
      const version = String(db.prepare('SELECT version FROM usage_rate_versions').get()?.version);
      expect(db.prepare('SELECT COUNT(*) n FROM usage_rate_versions').get()?.n).toBe(1);
      expect(db.prepare("SELECT COUNT(*) n FROM usage_billing_details WHERE run='first' AND event_id IS NULL").get()?.n).toBe(3);
      expect(db.prepare("SELECT amount,charge_status FROM usage_billing_details WHERE run='first' AND model='other/a'").get())
        .toEqual({ amount: null, charge_status: 'unpriced' });
      expect(db.prepare("SELECT observations FROM usage_unpriced_models WHERE run='first' AND model='other/a'").get()?.observations).toBe(1);
      const later = { ...rate, effectiveFrom: time + 1, perMillion: { input: '2' } };
      await expect(publish([later, { ...rate, model: 'provider/c' }], [{ version, at: time + 1 }]))
        .resolves.toMatchObject({ added: 2, closed: 1 });
      await expect(build('first')).rejects.toThrow('BILLING_RUN_INPUT_CHANGED');
      await expect(build('reestimate')).resolves.toMatchObject({ estimated: 2, unpriced: 1 });
      expect(db.prepare("SELECT amount,rate_version FROM usage_billing_details WHERE run='first' AND model='provider/a'").get())
        .toEqual({ amount: '0.0000125', rate_version: version });
    } finally { db.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it('reconciles a migrated v1 fixture against the trusted Dashboard across all four windows', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'incept-billing-v1-'));
  const source = join(directory, 'source.db'), sidecar = join(directory, 'sidecar.db');
  const legacy = join(directory, 'imports.db'), home = join(directory, 'home');
  const baseline = join(directory, 'baseline.json'), overrides = join(directory, 'overrides.json');
  const service = new CompatibleSyncService(source);
  try {
    writePhase0Home(home);
    phase0Import(phase0Export(home), legacy);
    service.migrateV1(legacy, owner);
    writeFileSync(overrides, '{}');
    vi.stubEnv('INCEPT_DASHBOARD_OVERRIDES_FILE', overrides);
    vi.stubEnv('INCEPT_SYNC_TRUSTED_MODE', '1');
    const config = readLocalOverrides();
    writeFileSync(baseline, JSON.stringify({ checkedAt: PHASE0_NOW,
      rates: Object.fromEntries(loadLocalPricingMap(home, config)), aliases: config.aliases }));
    expect(backfillUsageIdentity(source, sidecar, 100)).toMatchObject({ complete: true, history: { legacyBatches: 1 } });
    const report = await runMaintenance(['build-usage-billing', '--source=' + source, '--sidecar=' + sidecar,
      '--baseline=' + baseline, '--run=v1-fixture'], {});
    expect(report).toMatchObject({ legacy: expect.any(Number), windows: expect.arrayContaining(
      (['7d', '14d', '30d', 'all'] as const).map(range => {
        const data = projection(service, home, range, 0, legacy, PHASE0_NOW);
        return expect.objectContaining({ range, tokens: data.totals.totalTokens, baselineCost: expect.closeTo(data.totals.cost, 10) });
      }),
    ) });
    const output = new DatabaseSync(sidecar, { readOnly: true });
    try {
      expect(output.prepare("SELECT COUNT(*) n FROM usage_billing_details WHERE disposition='legacy'").get()?.n).toBeGreaterThan(0);
    } finally { output.close(); }
  } finally {
    service.close();
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  }
});
