import { realpathSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readUsageRates } from '../adapters/local/usage-rate-catalog';
import { hash } from '../adapters/local/imports/identity';
import { decimalUnits, formatDecimal } from '../domain/usage-billing';
import type { SyncRecord } from '../domain/sync';
import type { BillingReadResponse, BillingReadWindow } from '../domain/usage-billing-read';
import { dashboardDate, dateWindow, usageRanges } from '../domain/window';
import { billingLedgerVersion } from './billing-ledger-version';
import { syncDatabaseFileIdentity } from './database-version';
import { estimateLedgerUsage } from './billing-usage-estimate';
import { billingMappingDigest, readBillingChannelMappings } from './usage-billing-channel-mappings';

export type ManagedBillingInput = {
  source: string;
  state: string;
  catalogPath: string;
  mappingsPath?: string;
  approved: { revision: number; ledger: string; catalog: string; mappings: string; identity: number; asOf: string; run: string; input: string };
  approvedWindows: BillingReadWindow[];
};

const schema = `
  CREATE TABLE IF NOT EXISTS billing_checkpoint (
    id INTEGER PRIMARY KEY CHECK (id=1), approval TEXT NOT NULL, identity TEXT NOT NULL,
    revision INTEGER NOT NULL, ledger TEXT NOT NULL, result TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS billing_scopes (scope TEXT PRIMARY KEY, generation TEXT);
  CREATE TABLE IF NOT EXISTS billing_members (
    scope TEXT NOT NULL, position INTEGER NOT NULL, observation TEXT NOT NULL, origin TEXT NOT NULL,
    anchor_kind TEXT, anchor_value TEXT, event_id TEXT, source TEXT NOT NULL, model TEXT NOT NULL,
    timestamp INTEGER NOT NULL, day TEXT NOT NULL, tokens INTEGER NOT NULL,
    status TEXT NOT NULL, amount TEXT NOT NULL, recorded INTEGER NOT NULL, reason TEXT, silent INTEGER NOT NULL,
    canonical_model TEXT, rate_version TEXT,
    approved_event_id TEXT,
    PRIMARY KEY(scope,position)
  );
  CREATE INDEX IF NOT EXISTS billing_member_anchors ON billing_members(origin,anchor_kind,anchor_value);
  CREATE INDEX IF NOT EXISTS billing_member_reason ON billing_members(reason) WHERE reason IS NOT NULL;
  CREATE INDEX IF NOT EXISTS billing_member_time ON billing_members(timestamp);
  CREATE INDEX IF NOT EXISTS billing_member_conflict ON billing_members(event_id) WHERE anchor_kind IS NOT NULL AND event_id IS NULL;
  CREATE TABLE IF NOT EXISTS billing_days (day TEXT PRIMARY KEY, members INTEGER NOT NULL, tokens INTEGER NOT NULL,
    estimated INTEGER NOT NULL, unpriced INTEGER NOT NULL, excluded INTEGER NOT NULL, recorded INTEGER NOT NULL, amount TEXT NOT NULL);
  CREATE TEMP TABLE IF NOT EXISTS billing_dirty_anchors (origin TEXT,kind TEXT,value TEXT,PRIMARY KEY(origin,kind,value));
  CREATE TABLE IF NOT EXISTS billing_quarantined_anchors (origin TEXT,kind TEXT,value TEXT,PRIMARY KEY(origin,kind,value));
  CREATE TABLE IF NOT EXISTS billing_approved_anchors (
    origin TEXT,kind TEXT,value TEXT,event_id TEXT NOT NULL,PRIMARY KEY(origin,kind,value)
  );
  CREATE TABLE IF NOT EXISTS billing_approved_members (
    scope TEXT,position INTEGER,observation TEXT,kind TEXT,value TEXT,event_id TEXT,
    PRIMARY KEY(scope,position,observation)
  );
  CREATE VIEW IF NOT EXISTS usage_unpriced_models AS
    SELECT source AS channel, model, reason, count(*) AS observations, min(timestamp) AS first_seen, max(timestamp) AS last_seen
    FROM billing_members WHERE reason IS NOT NULL AND silent=0 GROUP BY source,model,reason;
`;

type Daily = { members: number; tokens: number; estimated: number; unpriced: number; excluded: number; recorded: number; amount: bigint };
const emptyDaily = (): Daily => ({ members: 0, tokens: 0, estimated: 0, unpriced: 0, excluded: 0, recorded: 0, amount: BigInt(0) });
type Member = { position: number; observation: string; origin: string; anchor_kind: string | null; anchor_value: string | null;
  day: string; tokens: number; status: 'estimated' | 'unpriced' | 'excluded'; amount: string; recorded: number };

function seedIdentity(state: DatabaseSync, catalog: DatabaseSync, approved: ManagedBillingInput['approved']) {
  const run = catalog.prepare('SELECT input,catalog FROM usage_billing_runs WHERE id=?').get(approved.run);
  const identity = catalog.prepare('SELECT COALESCE(MAX(id),0) AS revision FROM usage_identity_audit').get()?.revision;
  if (run?.input !== approved.input || run.catalog !== approved.catalog || identity !== approved.identity) {
    throw Error('MANAGED_BILLING_IDENTITY_CHANGED');
  }
  const quarantine = state.prepare('INSERT INTO billing_quarantined_anchors VALUES (?,?,?)');
  for (const row of catalog.prepare('SELECT origin,kind,value FROM usage_identity_conflicts').iterate()) {
    quarantine.run(row.origin, row.kind, row.value);
  }
  const anchor = state.prepare('INSERT INTO billing_approved_anchors VALUES (?,?,?,?)');
  for (const row of catalog.prepare('SELECT origin,kind,value,event_id FROM usage_event_anchors').iterate()) {
    anchor.run(row.origin, row.kind, row.value, row.event_id);
  }
  // Persist member-specific replacements from audited conflict decisions.
  const member = state.prepare('INSERT INTO billing_approved_members VALUES (?,?,?,?,?,?)');
  if (catalog.prepare("SELECT 1 FROM sqlite_schema WHERE name='usage_conflict_resolutions'").get()) {
    for (const row of catalog.prepare(`SELECT l.scope,l.position,l.observation,l.anchor_kind,l.anchor_value,l.event_id
      FROM usage_conflict_resolutions r JOIN json_each(r.decision_json) d
      JOIN usage_ledger_identity_disposition l ON l.scope=json_extract(d.value,'$.scope')
        AND l.position=json_extract(d.value,'$.position') AND l.observation=json_extract(d.value,'$.observation')
      WHERE l.disposition='mapped'`).iterate()) {
      member.run(row.scope, row.position, row.observation, row.anchor_kind, row.anchor_value, row.event_id);
    }
  }
}

export function updateManagedBilling(input: ManagedBillingInput, now = Date.now(), allowBootstrap = true) {
  const sourcePath = realpathSync(input.source), catalogPath = realpathSync(input.catalogPath);
  const stateFile = statSync(input.state, { bigint: true, throwIfNoEntry: false });
  const statePath = stateFile ? realpathSync(input.state) : join(realpathSync(dirname(input.state)), basename(input.state));
  if ([sourcePath, catalogPath].some(path => {
    const file = statSync(path, { bigint: true });
    return ['', '-wal', '-shm', '-journal'].some(suffix => statePath.toLowerCase() === (path + suffix).toLowerCase())
      || (stateFile && file.dev === stateFile.dev && file.ino === stateFile.ino);
  })) throw Error('MANAGED_BILLING_DISTINCT_STATE_REQUIRED');
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  let catalog: DatabaseSync | undefined;
  let state: DatabaseSync | undefined;
  try {
    catalog = new DatabaseSync(catalogPath, { readOnly: true });
    state = new DatabaseSync(statePath);
    source.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=5000; PRAGMA cache_size=-4096; BEGIN');
    catalog.exec('PRAGMA query_only=ON; PRAGMA cache_size=-4096; BEGIN');
    state.exec('PRAGMA busy_timeout=5000; PRAGMA cache_size=-4096;');
    const existing = state.prepare("SELECT name FROM sqlite_schema WHERE type='table' LIMIT 1").get();
    if (existing && !state.prepare("SELECT 1 FROM sqlite_schema WHERE name='billing_checkpoint' AND type='table'").get()) {
      throw Error('MANAGED_BILLING_FRESH_STATE_REQUIRED');
    }
    state.exec('PRAGMA journal_mode=WAL; BEGIN IMMEDIATE');
    state.exec(schema);
    const rates = readUsageRates(catalog);
    const mappings = readBillingChannelMappings(input.mappingsPath);
    const approved = input.approved;
    if (rates.version !== approved.catalog || billingMappingDigest(mappings) !== approved.mappings) {
      throw Error('MANAGED_BILLING_RULES_CHANGED');
    }
    const identity = syncDatabaseFileIdentity(sourcePath);
    const { revision, ledger } = billingLedgerVersion(source);
    // Managed mode is for a committed v2 ledger. Imported v1 membership still
    // uses the independently reviewed offline reconciliation path.
    if (source.prepare("SELECT 1 FROM sync_legacy_batches WHERE status='active' LIMIT 1").get()) {
      throw Error('MANAGED_BILLING_LEGACY_UNSUPPORTED');
    }
    const approval = hash(['managed-billing/1', approved]);
    const previous = state.prepare('SELECT * FROM billing_checkpoint WHERE id=1').get();
    if (previous ? previous.approval !== approval || previous.identity !== identity || revision < Number(previous.revision)
      : revision !== approved.revision || ledger !== approved.ledger) throw Error('MANAGED_BILLING_BOOTSTRAP_REQUIRED');
    if (!previous) {
      if (!allowBootstrap) throw Error('MANAGED_BILLING_BOOTSTRAP_REQUIRED');
      seedIdentity(state, catalog, approved);
    }

    const daily = new Map<string, Daily>();
    const savedDay = state.prepare('SELECT * FROM billing_days WHERE day=?');
    function apply(member: Member, direction: 1 | -1) {
      if (member.tokens <= 0) return;
      const change = daily.get(member.day) ?? emptyDaily();
      change.members += direction;
      change.tokens += direction * member.tokens;
      change[member.status] += direction * member.tokens;
      change.recorded += direction * member.recorded;
      change.amount += BigInt(direction) * BigInt(member.amount);
      daily.set(member.day, change);
    }

    const knownScope = state.prepare('SELECT generation FROM billing_scopes WHERE scope=?');
    const putScope = state.prepare('INSERT INTO billing_scopes VALUES (?,?) ON CONFLICT(scope) DO UPDATE SET generation=excluded.generation');
    const current = source.prepare(`SELECT position,observation_id AS observation FROM sync_current WHERE scope_id=? ORDER BY position`);
    const observationFor = source.prepare('SELECT record_json FROM sync_observations WHERE id=?');
    const currentAt = source.prepare('SELECT observation_id AS observation FROM sync_current WHERE scope_id=? AND position=?');
    const generationFor = source.prepare('SELECT parent_id FROM sync_generations WHERE id=? AND scope_id=?');
    const changes = source.prepare('SELECT position FROM sync_changes WHERE generation_id=? ORDER BY position');
    const known = state.prepare('SELECT * FROM billing_members WHERE scope=? AND position=?');
    const oldPositions = state.prepare('SELECT position FROM billing_members WHERE scope=? AND position>? ORDER BY position LIMIT 512');
    const remove = state.prepare('DELETE FROM billing_members WHERE scope=? AND position=?');
    const put = state.prepare(`INSERT INTO billing_members (
      scope,position,observation,origin,anchor_kind,anchor_value,source,model,timestamp,day,tokens,status,amount,recorded,reason,silent,
      canonical_model,rate_version,approved_event_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(scope,position) DO UPDATE SET observation=excluded.observation,origin=excluded.origin,
        anchor_kind=excluded.anchor_kind,anchor_value=excluded.anchor_value,event_id=NULL,source=excluded.source,
        model=excluded.model,timestamp=excluded.timestamp,day=excluded.day,tokens=excluded.tokens,status=excluded.status,
        amount=excluded.amount,recorded=excluded.recorded,reason=excluded.reason,silent=excluded.silent,
        canonical_model=excluded.canonical_model,rate_version=excluded.rate_version,
        approved_event_id=excluded.approved_event_id`);
    const approvedMember = state.prepare('SELECT kind,value,event_id FROM billing_approved_members WHERE scope=? AND position=? AND observation=?');
    const markAnchor = state.prepare('INSERT OR IGNORE INTO billing_dirty_anchors VALUES (?,?,?)');
    function dirty(member: Member) {
      if (member.anchor_kind !== null) markAnchor.run(member.origin, member.anchor_kind, member.anchor_value);
    }
    let changedScopes = 0, estimatedMembers = 0;
    function reconcile(scope: string, position: number, observation: string | null, origin: string) {
      const old = known.get(scope, position) as Member | undefined;
      if (old?.observation === observation) return;
      if (old) {
        apply(old, -1);
        dirty(old);
        remove.run(scope, position);
      }
      if (observation === null) return;
      const stored = observationFor.get(observation);
      if (!stored) throw Error('VISIBLE_OBSERVATION_MISSING');
      const { event, nativeKey, pointKey } = JSON.parse(String(stored.record_json)) as SyncRecord;
      const { tokens, model, charge, silent } = estimateLedgerUsage(event, rates, mappings);
      const pinned = approvedMember.get(scope, position, observation);
      const anchor = pinned ? [pinned.kind as string | null, pinned.value as string | null]
        : nativeKey?.keyHash.trim() ? ['native/2', nativeKey.keyHash] : pointKey?.trim() ? ['point/2', pointKey] : [null, null];
      const member = { position, observation, origin, anchor_kind: anchor[0], anchor_value: anchor[1],
        day: dashboardDate(event.timestampMs), tokens, status: charge.status,
        amount: charge.status === 'estimated' ? String(decimalUnits(charge.amount, 24)) : '0',
        recorded: Number(event.recordedCost !== undefined) };
      put.run(scope, position, observation, origin, ...anchor, event.source, event.modelName, event.timestampMs,
        member.day, tokens, member.status, member.amount, member.recorded,
        charge.status === 'unpriced' && tokens > 0 ? charge.reason : null, Number(silent),
        charge.status === 'excluded' ? null : model, 'rateVersion' in charge ? charge.rateVersion : null, pinned?.event_id ?? null);
      apply(member, 1);
      dirty(member);
      estimatedMembers++;
    }
    const scopes = source.prepare(`SELECT s.scope_id AS scope,s.visible_generation AS generation,o.origin_id AS origin
      FROM sync_scopes s LEFT JOIN sync_origins o USING(scope_id) ORDER BY s.scope_id`);
    const sourceScope = source.prepare('SELECT 1 FROM sync_scopes WHERE scope_id=?');
    for (const { scope } of state.prepare('SELECT scope FROM billing_scopes').iterate()) {
      if (!sourceScope.get(scope)) throw Error('MANAGED_BILLING_SCOPE_REMOVED');
    }
    for (const row of scopes.iterate()) {
      const { scope, generation, origin } = row as { scope: string; generation: string | null; origin: string | null };
      if (origin === null) throw Error('VISIBLE_ORIGIN_MISSING');
      const saved = knownScope.get(scope);
      if (saved?.generation === generation) continue;
      changedScopes++;
      // Common commits follow the generation chain. Rollback, initial
      // bootstrap and divergent heads reconcile only the affected scope.
      const chain: string[] = [];
      let cursor = generation;
      while (saved && cursor !== null && cursor !== saved.generation && chain.length < 128) {
        chain.push(cursor);
        const parent = generationFor.get(cursor, scope);
        if (!parent) throw Error('VISIBLE_GENERATION_MISSING');
        cursor = parent.parent_id as string | null;
      }
      if (saved && cursor === saved.generation) {
        for (const id of chain) for (const { position } of changes.iterate(id)) {
          const at = currentAt.get(scope, position);
          reconcile(scope, Number(position), at ? String(at.observation) : null, origin);
        }
      } else {
        if (generation !== null) for (const entry of current.iterate(scope)) {
          reconcile(scope, Number(entry.position), String(entry.observation), origin);
        }
        let after = -1;
        while (true) {
          const page = oldPositions.all(scope, after);
          if (!page.length) break;
          for (const { position } of page) {
            after = Number(position);
            if (generation === null || !currentAt.get(scope, position)) reconcile(scope, after, null, origin);
          }
        }
      }
      putScope.run(scope, generation);
    }
    const countAnchor = state.prepare('SELECT count(*) n FROM billing_members WHERE origin=? AND anchor_kind=? AND anchor_value=?');
    const bindAnchor = state.prepare(`UPDATE billing_members SET event_id=CASE WHEN ? IS NULL THEN NULL ELSE COALESCE(approved_event_id,?) END
      WHERE origin=? AND anchor_kind=? AND anchor_value=?`);
    const quarantine = state.prepare('INSERT OR IGNORE INTO billing_quarantined_anchors VALUES (?,?,?)');
    const quarantined = state.prepare('SELECT 1 FROM billing_quarantined_anchors WHERE origin=? AND kind=? AND value=?');
    const pinnedAnchor = state.prepare('SELECT event_id FROM billing_approved_anchors WHERE origin=? AND kind=? AND value=?');
    for (const row of state.prepare('SELECT origin,kind,value FROM billing_dirty_anchors').iterate()) {
      const { origin, kind, value } = row as { origin: string; kind: string; value: string };
      const count = Number(countAnchor.get(origin, kind, value)?.n);
      if (count > 1) quarantine.run(origin, kind, value);
      const eventId = count === 1 && !quarantined.get(origin, kind, value)
        ? pinnedAnchor.get(origin, kind, value)?.event_id ?? hash(['usage-event/1', origin, JSON.stringify([kind, value])]) : null;
      bindAnchor.run(eventId, eventId, origin, kind, value);
    }
    const saveDay = state.prepare(`INSERT OR REPLACE INTO billing_days VALUES (?,?,?,?,?,?,?,?)`);
    for (const [day, change] of daily) {
      const saved = savedDay.get(day) as unknown as Omit<Daily, 'amount'> & { amount: string } | undefined;
      saveDay.run(day, change.members + (saved?.members ?? 0), change.tokens + (saved?.tokens ?? 0),
        change.estimated + (saved?.estimated ?? 0), change.unpriced + (saved?.unpriced ?? 0),
        change.excluded + (saved?.excluded ?? 0), change.recorded + (saved?.recorded ?? 0),
        String(change.amount + BigInt(saved?.amount ?? '0')));
    }
    const conflicted = Number(state.prepare('SELECT count(*) n FROM billing_members WHERE anchor_kind IS NOT NULL AND event_id IS NULL').get()?.n);
    const unpricedGroups = Number(state.prepare('SELECT count(*) n FROM usage_unpriced_models').get()?.n);
    const readDays = state.prepare('SELECT * FROM billing_days WHERE day BETWEEN ? AND ?');
    const laterToday = state.prepare('SELECT * FROM billing_members WHERE timestamp>? AND timestamp<? AND tokens>0');
    function summarize(at: number): BillingReadResponse[] {
      const future = emptyDaily();
      const nextDay = Date.parse(dashboardDate(at) + 'T00:00:00+08:00') + 86_400_000;
      for (const row of laterToday.iterate(at, nextDay)) {
        const member = row as Member;
        future.members++;
        future.tokens += member.tokens;
        future[member.status] += member.tokens;
        future.recorded += member.recorded;
        future.amount += BigInt(member.amount);
      }
      return usageRanges.map(range => {
        const { from, to } = dateWindow(range, at);
        const total = emptyDaily();
        for (const row of readDays.iterate(range === 'all' ? '' : from, to)) {
          const day = row as unknown as Omit<Daily, 'amount'> & { amount: string };
          total.members += day.members; total.tokens += day.tokens; total.estimated += day.estimated;
          total.unpriced += day.unpriced; total.excluded += day.excluded; total.recorded += day.recorded;
          total.amount += BigInt(day.amount);
        }
        return { run: approved.run, range, revision, catalog: approved.catalog, asOf: new Date(at).toISOString(),
          members: total.members - future.members, tokens: total.tokens - future.tokens,
          estimatedCostUsd: formatDecimal(total.amount - future.amount, 24),
          estimatedTokens: total.estimated - future.estimated, unpricedTokens: total.unpriced - future.unpriced,
          excludedTokens: total.excluded - future.excluded, recordedUnknownCurrency: total.recorded - future.recorded,
          conflicted, unpricedGroups };
      });
    }
    if (!previous && !summarize(Date.parse(approved.asOf)).every(window => {
      const reviewed = input.approvedWindows.find(candidate => candidate.range === window.range);
      return reviewed && reviewed.members === window.members && reviewed.tokens === window.tokens
        && reviewed.estimatedCostUsd === window.estimatedCostUsd && reviewed.estimatedTokens === window.estimatedTokens
        && reviewed.unpricedTokens === window.unpricedTokens && reviewed.excludedTokens === window.excludedTokens
        && reviewed.recordedUnknownCurrency === window.recordedUnknownCurrency;
    })) throw Error('MANAGED_BILLING_BASELINE_MISMATCH');
    const windows = summarize(now);
    if (identity !== syncDatabaseFileIdentity(sourcePath)) throw Error('SYNC_DATABASE_REPLACED');
    state.prepare('INSERT OR REPLACE INTO billing_checkpoint VALUES (1,?,?,?,?,?)')
      .run(approval, identity, revision, ledger, JSON.stringify(windows));
    state.exec('COMMIT');
    return { revision, identity, windows, changedScopes, estimatedMembers };
  } finally {
    state?.close();
    catalog?.close();
    source.close();
  }
}

export function readManagedBillingCheckpoint(input: ManagedBillingInput) {
  const state = new DatabaseSync(input.state, { readOnly: true });
  try {
    state.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=25; BEGIN');
    if (!state.prepare("SELECT 1 FROM sqlite_schema WHERE name='billing_checkpoint'").get()) return undefined;
    const row = state.prepare('SELECT approval, identity, revision, result FROM billing_checkpoint WHERE id=1').get();
    if (!row || row.approval !== hash(['managed-billing/1', input.approved])
      || row.identity !== syncDatabaseFileIdentity(input.source)) return undefined;
    return { revision: Number(row.revision), windows: JSON.parse(String(row.result)) as BillingReadResponse[] };
  } finally { state.close(); }
}
