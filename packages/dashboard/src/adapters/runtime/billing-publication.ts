import 'server-only';
import { readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { usageRanges, type UsageRange } from '../../domain/window';
import type { BillingReadResponse } from '../../domain/usage-billing-read';
import type { BillingPublication } from '../../sync/usage-billing-publication';
import { readBillingLedgerVersion } from '../../sync/billing-ledger-version';
import { readSyncDatabaseVersion } from '../../sync/database-version';
import { readManagedBillingCheckpoint, type ManagedBillingInput } from '../../sync/managed-billing';
import { memoryPressure } from '../../sync/capacity';
import { Worker } from 'node:worker_threads';
import { existsSync, statfsSync } from 'node:fs';

const isCount = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isDigest = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function validPublication(data: BillingPublication) {
  const approval = data?.approval;
  return data?.version === 2 && data.pricingBasis === 'official-api-usd/1' && typeof data.run === 'string' && !!data.run.trim()
    && isCount(data.revision) && isDigest(data.input) && isDigest(data.catalog) && isDigest(data.ledger)
    && Number.isFinite(Date.parse(data.asOf))
    && !!approval && [approval.actor, approval.reason, approval.baselineEvidence, approval.pricingEvidence]
      .every(value => typeof value === 'string' && !!value.trim())
    && Number.isFinite(Date.parse(approval.publishedAt)) && isDigest(approval.pricingReviewDigest)
    && Array.isArray(data.windows) && data.windows.length === usageRanges.length
    && usageRanges.every(range => data.windows.some(window => window?.range === range && isCount(window.members)
      && isCount(window.tokens) && isCount(window.recordedUnknownCurrency) && window.recordedUnknownCurrency <= window.members
      && isCount(window.unpricedTokens) && isCount(window.estimatedTokens) && isCount(window.excludedTokens)
      && window.estimatedTokens + window.unpricedTokens + window.excludedTokens === window.tokens
      && typeof window.estimatedCostUsd === 'string' && /^\d+(\.\d{1,24})?$/.test(window.estimatedCostUsd)));
}

export async function readBillingPublication(publication: string) {
  if (!isAbsolute(publication)) throw Error('BILLING_READ_NOT_CONFIGURED');
  const file = await stat(publication);
  if (!file.isFile() || file.size > 64 * 1024) throw Error('INVALID_BILLING_PUBLICATION');
  const data = JSON.parse(await readFile(publication, 'utf8')) as BillingPublication;
  if (!validPublication(data)) throw Error('INVALID_BILLING_PUBLICATION');
  return data;
}

export async function readPublishedBilling(range: UsageRange, database: string, publication: string): Promise<BillingReadResponse> {
  if (!isAbsolute(database)) throw Error('BILLING_READ_NOT_CONFIGURED');
  const data = await readBillingPublication(publication);
  if (process.env.INCEPT_BILLING_PUBLICATION_MODE === 'managed') {
    const input = managedInput(database, data);
    const live = readSyncDatabaseVersion(database);
    const window = existsSync(input.state) ? readManagedBillingCheckpoint(input, range) : undefined;
    if (window && window.revision <= live.revision) {
      if (!window.breakdown || window.revision < live.revision || Date.now() - Date.parse(window.asOf) >= 60_000) {
        scheduleManagedRefresh(database, publication, 1500);
      }
      return { ...window, liveRevision: live.revision };
    }
    if (live.revision !== data.revision) throw Error('MANAGED_BILLING_BOOTSTRAP_REQUIRED');
  }
  const live = readBillingLedgerVersion(database);
  if (live.revision !== data.revision || live.ledger !== data.ledger) throw Error('BILLING_PUBLICATION_STALE');
  const window = data.windows.find(row => row.range === range)!;
  return { run: data.run, revision: data.revision, catalog: data.catalog, asOf: data.asOf,
    range, members: window.members, tokens: window.tokens, estimatedCostUsd: window.estimatedCostUsd,
    estimatedTokens: window.estimatedTokens, excludedTokens: window.excludedTokens,
    recordedUnknownCurrency: window.recordedUnknownCurrency, unpricedTokens: window.unpricedTokens };
}

export function managedInput(database: string, data: BillingPublication, env = process.env): ManagedBillingInput {
  const state = env.INCEPT_BILLING_MANAGED_STATE ?? '', catalogPath = env.INCEPT_BILLING_APPROVED_CATALOG ?? '';
  const mappingsPath = env.INCEPT_BILLING_APPROVED_MAPPINGS || undefined;
  if (!isAbsolute(state) || !isAbsolute(catalogPath) || (mappingsPath && !isAbsolute(mappingsPath))
    || !isDigest(data.mappings) || !isCount(data.identity)) throw Error('MANAGED_BILLING_NOT_CONFIGURED');
  return { source: database, state, catalogPath, mappingsPath, approvedWindows: data.windows,
    approved: { revision: data.revision, ledger: data.ledger, catalog: data.catalog, mappings: data.mappings!,
      asOf: data.asOf, identity: data.identity!, run: data.run, input: data.input } };
}

type ManagedRefresh = { timer?: ReturnType<typeof setTimeout>; running?: boolean; pending?: boolean; deadline?: number };
declare global { var __inceptManagedBilling: Map<string, ManagedRefresh> | undefined; }
const refreshes = globalThis.__inceptManagedBilling ??= new Map();

function workerPath() {
  let path = process.cwd();
  while (true) {
    const candidate = join(path, 'packages/dashboard/dist/dashboard-billing-worker.mjs');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(path);
    if (parent === path) throw Error('MANAGED_BILLING_WORKER_NOT_FOUND');
    path = parent;
  }
}

export function scheduleManagedRefresh(database: string, publication: string, delay: number) {
  if (process.env.INCEPT_BILLING_READ_MODE !== 'owner' || process.env.INCEPT_BILLING_PUBLICATION_MODE !== 'managed') return;
  if (!isAbsolute(database) || !isAbsolute(publication)) return;
  const key = JSON.stringify([database, publication]);
  const refresh = refreshes.get(key) ?? {};
  refreshes.set(key, refresh);
  if (refresh.running) { refresh.pending = true; return; }
  clearTimeout(refresh.timer);
  refresh.deadline ??= Date.now() + 10_000;
  refresh.timer = setTimeout(async () => {
    refresh.running = true;
    refresh.deadline = undefined;
    try {
      const input = managedInput(database, await readBillingPublication(publication));
      if (!existsSync(input.state)) return;
      const disk = statfsSync(dirname(input.state), { bigint: true });
      if (disk.bavail * disk.bsize < BigInt(2 * 1024 ** 3)) throw Error('MANAGED_BILLING_DISK_PRESSURE');
      const pressure = memoryPressure();
      if (pressure && pressure.maximumBytes - (pressure.workingSetBytes ?? pressure.currentBytes) < 160 * 1024 ** 2) {
        throw Error('MANAGED_BILLING_MEMORY_PRESSURE');
      }
      await new Promise<void>((resolve, reject) => {
        const worker = Reflect.construct(Worker, [workerPath(), { workerData: input,
          resourceLimits: { maxOldGenerationSizeMb: 96 } }]) as Worker;
        worker.once('error', reject);
        worker.once('exit', code => code === 0 ? resolve() : reject(Error('MANAGED_BILLING_WORKER_FAILED')));
      });
    } catch (error) {
      console.error(JSON.stringify({ event: 'managed_billing_refresh_failed', error: error instanceof Error ? error.message : 'unknown' }));
    } finally {
      refresh.running = false;
      if (refresh.pending) { refresh.pending = false; scheduleManagedRefresh(database, publication, delay); }
    }
  }, Math.max(0, Math.min(delay, refresh.deadline - Date.now())));
  refresh.timer.unref();
}
