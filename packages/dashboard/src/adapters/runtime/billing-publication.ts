import 'server-only';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { usageRanges, type UsageRange } from '../../domain/window';
import type { BillingReadResponse } from '../../domain/usage-billing-read';
import type { BillingPublication } from '../../sync/usage-billing-publication';
import { readBillingLedgerVersion } from '../../sync/billing-ledger-version';

const isCount = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isDigest = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function validPublication(data: BillingPublication) {
  return data?.version === 1 && typeof data.run === 'string' && !!data.run.trim()
    && isCount(data.revision) && isDigest(data.input) && isDigest(data.catalog) && isDigest(data.ledger)
    && Number.isFinite(Date.parse(data.asOf))
    && Array.isArray(data.windows) && data.windows.length === usageRanges.length
    && usageRanges.every(range => data.windows.some(window => window?.range === range && isCount(window.members)
      && isCount(window.tokens) && isCount(window.recordedUnknownCurrency) && window.recordedUnknownCurrency <= window.members
      && isCount(window.unpricedTokens) && window.unpricedTokens <= window.tokens && window.estimatedByCurrency
      && !Array.isArray(window.estimatedByCurrency) && typeof window.estimatedByCurrency === 'object'
      && Object.entries(window.estimatedByCurrency).every(([currency, amount]) =>
        /^[A-Z]{3}$/.test(currency) && typeof amount === 'string' && /^\d+(\.\d{1,24})?$/.test(amount))));
}

export async function readPublishedBilling(range: UsageRange, database: string, publication: string): Promise<BillingReadResponse> {
  if (!isAbsolute(database) || !isAbsolute(publication)) throw Error('BILLING_READ_NOT_CONFIGURED');
  const file = await stat(publication);
  if (!file.isFile() || file.size > 64 * 1024) throw Error('INVALID_BILLING_PUBLICATION');
  const data = JSON.parse(await readFile(publication, 'utf8')) as BillingPublication;
  if (!validPublication(data)) throw Error('INVALID_BILLING_PUBLICATION');
  const live = readBillingLedgerVersion(database);
  if (live.revision !== data.revision || live.ledger !== data.ledger) throw Error('BILLING_PUBLICATION_STALE');
  const window = data.windows.find(row => row.range === range)!;
  return { run: data.run, revision: data.revision, catalog: data.catalog, asOf: data.asOf,
    range, members: window.members, tokens: window.tokens, estimatedByCurrency: window.estimatedByCurrency,
    recordedUnknownCurrency: window.recordedUnknownCurrency, unpricedTokens: window.unpricedTokens };
}
