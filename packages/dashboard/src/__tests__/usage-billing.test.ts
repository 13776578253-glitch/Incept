import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
import { managedInput, readPublishedBilling, scheduleManagedRefresh } from '../adapters/runtime/billing-publication';
import { readUsageRates } from '../adapters/local/usage-rate-catalog';
import { updateManagedBilling } from '../sync/managed-billing';
import { SyncExecutor } from '../sync/executor';

const time = Date.UTC(2026, 9, 15);
const scope = { source: 'antigravity', sessionId: 'billing', originId: 'origin',
  deviceId: '02421821-b6f6-4292-8271-9546f7d65ddd' } as const;
const owner = { role: 'owner', subject: 'test', reason: 'billing fixture' } as const;
const event: TransferEvent = {
  eventId: hash('base'), source: scope.source, sessionId: scope.sessionId, timestampMs: time, modelName: 'provider/a',
  projectKey: 'fixture', projectName: 'Fixture', inputTokens: 100, outputTokens: 0,
  cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0,
};
const rate: BillingRate = { provider: 'provider', model: event.modelName,
  currency: 'USD', evidence: 'fixture', effectiveFrom: time - 1000, perMillion: { input: '0.125' } };

it('computes exact estimates and applies versioned periods independently of recorded amounts', () => {
  expect(estimateUsage(event, { version: 'first', rate })).toMatchObject({ status: 'estimated', amount: '0.0000125' });
  const scheduled = { ...rate, schedule: { version: 'peak-v1', periods: [{ from: time, to: time + 1, multiplier: 2 }] } };
  expect(estimateUsage(event, { version: 'peak', rate: scheduled })).toMatchObject({ amount: '0.000025' });
  expect(estimateUsage({ ...event, cacheReadTokens: 1 }, { version: 'first', rate }))
    .toEqual({ status: 'unpriced', reason: 'RATE_COMPONENT_MISSING' });
  expect(estimateUsage({ ...event, recordedCost: 0 }, { version: 'first', rate: scheduled }))
    .toMatchObject({ status: 'estimated', currency: 'USD', amount: '0.000025' });
  expect(estimateUsage({ ...event, timestampPrecision: 'day' }, { version: 'peak', rate: scheduled }))
    .toEqual({ status: 'unpriced', reason: 'DAY_RATE_AMBIGUOUS' });
  expect(estimateUsage(event, { version: 'discount', rate: { ...scheduled,
    schedule: { version: 'discount', periods: [{ from: time, to: time + 1, multiplier: '0.5' }] } } }))
    .toMatchObject({ amount: '0.00000625' });
  const tiered = { version: 'tiered', rate: { ...rate, perMillion: { input: '2', cacheRead: '0.2', output: '12' },
    longPrompt: { aboveInputTokens: 200_000, perMillion: { input: '4', cacheRead: '0.4', output: '18' } } } };
  const boundary = { ...event, inputTokens: 180_000, cacheReadTokens: 20_000, outputTokens: 1_000 };
  expect(estimateUsage(boundary, tiered)).toMatchObject({ amount: '0.376' });
  const long = { ...boundary, cacheReadTokens: 20_001 };
  expect(estimateUsage(long, tiered)).toMatchObject({ amount: '0.7460004' });
  expect(estimateUsage({ ...long, timestampPrecision: 'day' }, tiered))
    .toEqual({ status: 'unpriced', reason: 'DAY_RATE_AMBIGUOUS' });
});

it('applies recurring peak hours in the schedule time zone with full-day holiday exceptions', () => {
  const schedule = { version: 'weekly', utcOffsetMinutes: 480, weekdays: [1, 2, 3, 4, 5],
    peakHours: [{ from: '09:00', to: '12:00' }, { from: '14:00', to: '18:00' }],
    peakMultiplier: '2', holidays: [{ from: '2026-10-01', to: '2026-10-07' }] };
  const selected = { version: 'weekly', rate: { ...rate, schedule } };
  const estimate = (at: string, timestampPrecision: 'event' | 'day' = 'event') =>
    estimateUsage({ ...event, timestampMs: Date.parse(at), timestampPrecision }, selected);

  for (const at of ['2026-10-08T01:00:00Z', '2026-10-08T03:59:59.999Z', '2026-10-08T06:00:00Z', '2026-10-15T06:00:00Z']) {
    expect(estimate(at)).toMatchObject({ amount: '0.000025' });
  }
  for (const at of ['2026-10-08T00:59:59.999Z', '2026-10-08T04:00:00Z', '2026-10-08T10:00:00Z',
    '2026-10-01T01:00:00Z', '2026-10-07T09:59:59.999Z', '2026-10-10T06:00:00Z']) {
    expect(estimate(at)).toMatchObject({ amount: '0.0000125' });
  }
  expect(estimate('2026-09-30T16:00:00Z', 'day')).toMatchObject({ amount: '0.0000125' });
  expect(estimate('2026-10-07T16:00:00Z', 'day')).toEqual({ status: 'unpriced', reason: 'DAY_RATE_AMBIGUOUS' });
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
        { ...event, eventId: hash('zero') },
        { ...event, eventId: hash('future'), timestampMs: time + 1 },
      ], scope);
      service.register(scope, 'billing fixture', owner);
      service.begin(header, owner);
      service.stage(scope.deviceId, header.batchId, 0, records, owner);
      expect(service.commit(scope.deviceId, header.batchId, owner).status).toBe('committed');
      const update = service.db.prepare(`UPDATE sync_observations SET record_json=? WHERE id=(
        SELECT observation_id FROM sync_current WHERE position=?)`);
      update.run(JSON.stringify({ ...records[1], nativeKey: { source: scope.source, keyHash: ' ' } }), 1);
      update.run(JSON.stringify({ ...records[3], nativeKey: records[2].nativeKey }), 3);
      update.run(JSON.stringify({ ...records[4], event: { ...records[4].event, inputTokens: 0 } }), 4);
    } finally { service.close(); }

    expect(backfillUsageIdentity(source, sidecar, 100)).toMatchObject({ mapped: 3, unproven: 1, conflicts: 2 });
    writeFileSync(baseline, JSON.stringify({ checkedAt: time, rates: { ' Provider/A ': { inputPerMillion: 2, outputPerMillion: 2 } }, aliases: {} }));
    const publish = async (rates: BillingRate[], close?: { version: string; at: number }[]) => {
      writeFileSync(catalog, JSON.stringify({ rates, close }));
      return runMaintenance(['publish-usage-rates', '--sidecar=' + sidecar, '--catalog=' + catalog], {});
    };
    const build = (run: string) => runMaintenance(['build-usage-billing', '--source=' + source, '--sidecar=' + sidecar,
      '--baseline=' + baseline, '--run=' + run], {});
    await expect(publish([rate])).resolves.toMatchObject({ added: 1 });
    const annotated = { ...rate, perMillion: { input: '0.1250' }, comment: 'operator note' };
    await expect(publish([annotated])).resolves.toMatchObject({ added: 0 });
    const weekly = { ...rate, model: 'weekly/fixture', schedule: {
      version: 'weekly', utcOffsetMinutes: 0, weekdays: [5, 1], peakHours: [{ from: '01:00', to: '04:00' }],
      peakMultiplier: 2, holidays: [{ from: '2026-10-01', to: '2026-10-07' }],
    } };
    await expect(publish([{ ...weekly, schedule: { ...weekly.schedule, peakHours: [
      { from: '01:00', to: '04:00' }, { from: '03:00', to: '05:00' },
    ] } }])).rejects.toThrow('INVALID_USAGE_RATE_SCHEDULE');
    await expect(publish([{ ...weekly, schedule: { ...weekly.schedule, holidays: [
      { from: '2026-02-30', to: '2026-03-01' },
    ] } }])).rejects.toThrow('INVALID_USAGE_RATE_SCHEDULE');
    for (const key of Object.keys(weekly.schedule).filter(key => key !== 'version')) {
      const schedule = { version: 'mixed', periods: [], [key]: weekly.schedule[key as keyof typeof weekly.schedule] };
      await expect(publish([{ ...weekly, schedule }])).rejects.toThrow('INVALID_USAGE_RATE_SCHEDULE');
    }
    await expect(build('first')).resolves.toMatchObject({ members: 4, mapped: 1, unproven: 1, conflict: 2,
      considered: 6, skippedAfterCutoff: 1, skippedZeroTokens: 1,
      recorded: 1, estimated: 1, unpriced: 3, windows: expect.arrayContaining([{ range: 'all', members: 4,
        tokens: 400, baselineCost: expect.any(Number), estimatedTokens: 100, unpricedTokens: 300,
        excludedTokens: 0, recordedUnknownCurrency: 1, estimatedCostUsd: '0.0000125' }]) });
    await expect(build('first')).resolves.toMatchObject({ reused: true });
    const crossChannelRate = { ...rate, model: 'official/a',
      longPrompt: { aboveInputTokens: 99, perMillion: { input: '0.25' } } };
    const mappings = join(directory, 'mappings.json');
    const rules = [
      { channel: scope.source, model: 'other/a', action: 'map', canonicalModel: 'official/a', evidence: 'fixture alias' },
      { channel: scope.source, model: 'provider/c', action: 'exclude', evidence: 'fixture route' },
      { channel: scope.source, model: 'provider/b', action: 'map', canonicalModel: 'official/a', evidence: 'fixture alias' },
    ];
    writeFileSync(mappings, JSON.stringify({ version: 2, rules }));
    const buildMapped = (run: string) => runMaintenance(['build-usage-billing', '--source=' + source, '--sidecar=' + sidecar,
      '--baseline=' + baseline, '--run=' + run, '--channel-mappings=' + mappings], {});
    await expect(buildMapped('first')).rejects.toThrow('BILLING_RUN_INPUT_CHANGED');
    await expect(publish([crossChannelRate])).resolves.toMatchObject({ added: 1 });
    await expect(buildMapped('mapped')).resolves.toMatchObject({ members: 4, excluded: 1, recorded: 1,
      estimated: 3, unpriced: 0, windows: expect.arrayContaining([expect.objectContaining({ range: 'all', tokens: 400,
        estimatedTokens: 300, unpricedTokens: 0, excludedTokens: 100, recordedUnknownCurrency: 1,
        estimatedCostUsd: '0.0000625' })]) });
    await expect(publish([{ ...rate, model: 'provider/c' }, { ...rate, evidence: 'overlap' }])).rejects.toThrow('USAGE_RATE_INTERVAL_OVERLAP');

    const db = new DatabaseSync(sidecar, { readOnly: true });
    try {
      const version = String(db.prepare("SELECT version FROM usage_reference_rate_versions WHERE model='provider/a'").get()?.version);
      const officialVersion = String(db.prepare("SELECT version FROM usage_reference_rate_versions WHERE model='official/a'").get()?.version);
      expect(db.prepare('SELECT COUNT(*) n FROM usage_reference_rate_versions').get()?.n).toBe(2);
      const rates = readUsageRates(db);
      const fromAntigravity = rates.select('official/a', event);
      expect(fromAntigravity?.version).toBe(officialVersion);
      expect(rates.select('official/a', { ...event, source: 'deepseekHarness' })).toEqual(fromAntigravity);
      expect(db.prepare("SELECT baseline_amount FROM usage_billing_details WHERE run='first' AND model='provider/a'").get()?.baseline_amount).toBe('0.0002');
      expect(db.prepare("SELECT COUNT(*) n FROM usage_billing_details WHERE run='first' AND event_id IS NULL").get()?.n).toBe(3);
      expect(db.prepare("SELECT amount,charge_status FROM usage_billing_details WHERE run='first' AND model='other/a'").get())
        .toEqual({ amount: null, charge_status: 'unpriced' });
      expect(db.prepare("SELECT observations FROM usage_unpriced_models WHERE run='first' AND model='other/a'").get()?.observations).toBe(1);
      expect(db.prepare(`SELECT d.model, d.canonical_model, d.rate_version, d.amount, a.amount recorded, a.currency
        FROM usage_billing_details d JOIN usage_billing_recorded_audit a USING(run, member)
        WHERE d.run='mapped' AND d.model='provider/b'`).get())
        .toEqual({ model: 'provider/b', canonical_model: 'official/a', rate_version: officialVersion,
          amount: '0.000025', recorded: '0', currency: null });
      expect(db.prepare("SELECT amount, reason FROM usage_billing_details WHERE run='mapped' AND model='provider/c'").get())
        .toEqual({ amount: null, reason: 'CHANNEL_ROUTE_EXCLUDED' });
      const later = { ...rate, effectiveFrom: time + 1, perMillion: { input: '2' } };
      await expect(publish([later, { ...rate, model: 'provider/c' }], [{ version, at: time + 1 }]))
        .resolves.toMatchObject({ added: 2, closed: 1 });
      await expect(build('first')).rejects.toThrow('BILLING_RUN_INPUT_CHANGED');
      await expect(build('reestimate')).resolves.toMatchObject({ estimated: 2, unpriced: 2 });
      expect(db.prepare("SELECT amount,rate_version FROM usage_billing_details WHERE run='first' AND model='provider/a'").get())
        .toEqual({ amount: '0.0000125', rate_version: version });
      const decision = join(directory, 'decision.json');
      const collisions = db.prepare(`SELECT scope,position,observation,origin,anchor_kind,anchor_value
        FROM usage_ledger_identity_disposition WHERE disposition='conflict' ORDER BY position`).all();
      writeFileSync(decision, JSON.stringify({ origin: collisions[0].origin,
        anchor: { kind: collisions[0].anchor_kind, value: collisions[0].anchor_value },
        members: collisions.map(({ scope, position, observation }) => ({
          scope, position, observation, replacement: { kind: 'usage-row/1', value: observation },
        })) }));
      const resolve = () => runMaintenance(['resolve-usage-identity-conflict', '--sidecar=' + sidecar,
        '--decision=' + decision, '--owner-confirm=I_AM_THE_OWNER', '--reason=fixture evidence'], {});
      await expect(resolve()).resolves.toMatchObject({ members: 2, reused: false });
      await expect(resolve()).resolves.toMatchObject({ members: 2, reused: true });
      await expect(build('reestimate')).rejects.toThrow('BILLING_RUN_INPUT_CHANGED');
      await expect(build('reviewed')).resolves.toMatchObject({ mapped: 3, conflict: 0, members: 4 });
      expect(db.prepare('SELECT COUNT(*) n FROM usage_identity_conflicts').get()?.n).toBe(1);

      const reportPath = join(directory, 'billing-review.json');
      await runMaintenance(['review-usage-billing-read', '--sidecar=' + sidecar, '--run=reviewed', '--report=' + reportPath], {});
      const report = JSON.parse(readFileSync(reportPath, 'utf8'));
      const approval = join(directory, 'billing-approval.json'), publication = join(directory, 'billing-publication.json');
      const approve = (overrides: object = {}) => writeFileSync(approval, JSON.stringify({
        ...report.publication, pricingReviewDigest: report.pricingReviewDigest, baselineEvidence: 'fixture dashboard response',
        pricingEvidence: 'fixture price review', ...overrides,
      }));
      const publishRead = () => runMaintenance(['publish-usage-billing-read', '--sidecar=' + sidecar, '--run=reviewed',
        '--approval=' + approval, '--output=' + publication, '--owner-confirm=I_AM_THE_OWNER', '--actor=fixture-operator', '--reason=fixture'], {});
      approve({ windows: report.publication.windows.slice(0, 3) });
      await expect(publishRead()).rejects.toThrow('BILLING_BASELINE_APPROVAL_MISMATCH');
      approve({ pricingReviewDigest: 'stale' });
      await expect(publishRead()).rejects.toThrow('BILLING_PRICING_APPROVAL_MISMATCH');
      approve();
      await expect(publishRead()).resolves.toMatchObject({ ok: true, run: 'reviewed' });
      const artifact = JSON.parse(readFileSync(publication, 'utf8'));
      expect(artifact.approval).toMatchObject({ actor: 'fixture-operator', reason: 'fixture',
        baselineEvidence: 'fixture dashboard response', pricingEvidence: 'fixture price review',
        pricingReviewDigest: report.pricingReviewDigest, publishedAt: expect.any(String) });
      const unaudited = join(directory, 'unaudited.json');
      writeFileSync(unaudited, JSON.stringify({ ...artifact, approval: undefined }));
      await expect(readPublishedBilling('all', source, unaudited)).rejects.toThrow('INVALID_BILLING_PUBLICATION');
      writeFileSync(unaudited, JSON.stringify({ ...artifact, version: 1 }));
      await expect(readPublishedBilling('all', source, unaudited)).rejects.toThrow('INVALID_BILLING_PUBLICATION');
      const result = await readPublishedBilling('all', source, publication);
      expect(result).toEqual({ run: 'reviewed', revision: report.publication.revision, catalog: report.publication.catalog,
        asOf: new Date(time).toISOString(), range: 'all', members: 4, tokens: 400, estimatedTokens: 200,
        unpricedTokens: 200, excludedTokens: 0, recordedUnknownCurrency: 1, estimatedCostUsd: '0.000025' });
      const managed = managedInput(source, artifact, {
        INCEPT_BILLING_MANAGED_STATE: join(directory, 'managed.db'), INCEPT_BILLING_APPROVED_CATALOG: sidecar,
      });
      expect(updateManagedBilling(managed, time).windows.find(window => window.range === 'all'))
        .toMatchObject({ conflicted: 0, members: 4, estimatedCostUsd: '0.000025' });
      const managedState = new DatabaseSync(managed.state, { readOnly: true });
      try {
        expect(managedState.prepare("SELECT COUNT(*) n FROM billing_members WHERE anchor_kind='usage-row/1' AND event_id IS NOT NULL").get()?.n).toBe(2);
        expect(managedState.prepare('SELECT COUNT(*) n FROM billing_quarantined_anchors').get()?.n).toBe(1);
      } finally { managedState.close(); }
      const replaced = new CompatibleSyncService(source);
      try {
        replaced.db.exec("UPDATE sync_scopes SET fenced=1");
        await expect(readPublishedBilling('all', source, publication)).rejects.toThrow('BILLING_PUBLICATION_STALE');
      } finally { replaced.close(); }
    } finally { db.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it('publishes appended and rolled-back observations with pinned rates while the prior snapshot stays readable', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'incept-managed-billing-'));
  const source = join(directory, 'source.db'), sidecar = join(directory, 'billing.db');
  const state = join(directory, 'managed.db'), catalog = join(directory, 'rates.json');
  const baseline = join(directory, 'baseline.json'), report = join(directory, 'review.json');
  const approval = join(directory, 'approval.json'), publication = join(directory, 'publication.json');
  const first = fromEvents([event], scope, undefined, 'managed-first');
  const commit = (batch: typeof first, register = false) => {
    const service = new CompatibleSyncService(source);
    try {
      if (register) service.register(batch.header.manifest.scope, 'fixture', owner);
      service.begin(batch.header, owner);
      service.stage(scope.deviceId, batch.header.batchId, 0, batch.records, owner);
      expect(service.commit(scope.deviceId, batch.header.batchId, owner).status).toBe('committed');
    } finally { service.close(); }
  };
  try {
    commit(first, true);
    expect(backfillUsageIdentity(source, sidecar, 100).complete).toBe(true);
    writeFileSync(baseline, JSON.stringify({ checkedAt: time, rates: {}, aliases: {} }));
    writeFileSync(catalog, JSON.stringify({ rates: [rate] }));
    await runMaintenance(['publish-usage-rates', '--sidecar=' + sidecar, '--catalog=' + catalog], {});
    await runMaintenance(['build-usage-billing', '--source=' + source, '--sidecar=' + sidecar,
      '--baseline=' + baseline, '--run=managed-approved'], {});
    await runMaintenance(['review-usage-billing-read', '--sidecar=' + sidecar, '--run=managed-approved', '--report=' + report], {});
    const review = JSON.parse(readFileSync(report, 'utf8'));
    writeFileSync(approval, JSON.stringify({ ...review.publication, pricingReviewDigest: review.pricingReviewDigest,
      baselineEvidence: 'fixture baseline', pricingEvidence: 'fixture rates' }));
    await runMaintenance(['publish-usage-billing-read', '--sidecar=' + sidecar, '--run=managed-approved', '--approval=' + approval,
      '--output=' + publication, '--owner-confirm=I_AM_THE_OWNER', '--actor=fixture', '--reason=fixture'], {});
    const artifact = JSON.parse(readFileSync(publication, 'utf8'));
    const env = { INCEPT_BILLING_MANAGED_STATE: state, INCEPT_BILLING_APPROVED_CATALOG: sidecar };
    const input = managedInput(source, artifact, env);
    expect(() => updateManagedBilling(input, time, false)).toThrow('MANAGED_BILLING_BOOTSTRAP_REQUIRED');
    expect(updateManagedBilling(input, time)).toMatchObject({ revision: artifact.revision, estimatedMembers: 1 });
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    vi.stubEnv('INCEPT_BILLING_PUBLICATION_MODE', 'managed');
    vi.stubEnv('INCEPT_BILLING_READ_MODE', '');
    const second = fromEvents([event, { ...event, eventId: hash('managed-added'), modelName: 'new/unknown' }],
      scope, first.header, 'managed-append');
    const executor = new SyncExecutor(source, { trusted: true });
    const actor = { role: 'device', deviceId: scope.deviceId } as const;
    vi.stubEnv('INCEPT_BILLING_READ_MODE', 'owner');
    let stop = () => {};
    const scheduled = new Promise<void>(done => {
      stop = executor.onCommitted(() => { scheduleManagedRefresh(source, publication, 1000); done(); });
    });
    try {
      await executor.execute({ op: 'begin', header: second.header, actor });
      await executor.execute({ op: 'stage', device: scope.deviceId, batch: second.header.batchId, offset: 0, records: second.records, actor });
      await executor.execute({ op: 'commit', device: scope.deviceId, batch: second.header.batchId, actor });
      await scheduled;
      vi.stubEnv('INCEPT_BILLING_READ_MODE', '');
      await expect(readPublishedBilling('all', source, publication)).resolves.toMatchObject({
        revision: artifact.revision, liveRevision: artifact.revision + 1, estimatedCostUsd: '0.0000125',
      });
      vi.stubEnv('INCEPT_BILLING_READ_MODE', 'owner');
      await vi.waitFor(() => {
        const db = new DatabaseSync(state, { readOnly: true });
        try { expect(db.prepare('SELECT revision FROM billing_checkpoint').get()?.revision).toBe(artifact.revision + 1); }
        finally { db.close(); }
      }, { timeout: 4000 });
    } finally { stop(); await executor.close(); }
    vi.stubEnv('INCEPT_BILLING_READ_MODE', '');
    expect(updateManagedBilling(input, time).estimatedMembers).toBe(0);
    await expect(readPublishedBilling('all', source, publication)).resolves.toMatchObject({
      revision: artifact.revision + 1, liveRevision: artifact.revision + 1, estimatedCostUsd: '0.0000125',
      members: 2, unpricedGroups: 1, unpricedTokens: 100,
    });
    const service = new CompatibleSyncService(source);
    try { service.rollback(second.header.manifest.generationId, owner); }
    finally { service.close(); }
    expect(updateManagedBilling(input, time)).toMatchObject({ revision: artifact.revision + 2, estimatedMembers: 0,
      windows: expect.arrayContaining([expect.objectContaining({ range: 'all', members: 1, unpricedGroups: 0, unpricedTokens: 0 })]) });
    writeFileSync(catalog, JSON.stringify({ rates: [{ ...rate, model: 'new/unknown' }] }));
    await runMaintenance(['publish-usage-rates', '--sidecar=' + sidecar, '--catalog=' + catalog], {});
    expect(() => updateManagedBilling(input, time)).toThrow('MANAGED_BILLING_RULES_CHANGED');
    await expect(readPublishedBilling('all', source, publication)).resolves.toMatchObject({ revision: artifact.revision + 2 });
  } finally {
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  }
}, 10_000);

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
