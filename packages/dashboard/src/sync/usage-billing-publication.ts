import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { hash } from '../adapters/local/imports/identity';
import { readUsageRates } from '../adapters/local/usage-rate-catalog';
import { usageRanges } from '../domain/window';
import type { BillingReadWindow } from '../domain/usage-billing-read';

export type BillingPublication = {
  version: 1;
  run: string;
  input: string;
  revision: number;
  ledger: string;
  catalog: string;
  asOf: string;
  windows: (BillingReadWindow & { baselineCost: number })[];
};

function readCandidate(path: string, run: string) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec('PRAGMA query_only=ON; BEGIN');
    const row = db.prepare('SELECT input,catalog,baseline_json,result_json FROM usage_billing_runs WHERE id=?').get(run);
    if (!row?.result_json || typeof row.input !== 'string') throw Error('BILLING_RUN_NOT_FOUND');
    const result = JSON.parse(String(row.result_json));
    const baseline = JSON.parse(String(row.baseline_json));
    if (typeof result.ledger !== 'string') throw Error('BILLING_RUN_REBUILD_REQUIRED');
    const catalog = readUsageRates(db);
    if (row.catalog !== catalog.version) throw Error('BILLING_CATALOG_CHANGED');
    const priceVersions = Number(db.prepare('SELECT COUNT(*) n FROM usage_rate_versions').get()?.n);
    const unpriced = db.prepare(`SELECT channel,model,reason,observations FROM usage_unpriced_models
      WHERE run=? ORDER BY channel,model,reason`).all(run);
    const recorded = db.prepare(`SELECT source,model,COUNT(*) observations FROM usage_billing_details
      WHERE run=? AND charge_status='recorded' AND currency IS NULL GROUP BY source,model ORDER BY source,model`).all(run);
    const publication: BillingPublication = {
      version: 1, run, input: row.input, revision: result.revision, ledger: result.ledger, catalog: catalog.version,
      asOf: new Date(baseline.checkedAt).toISOString(), windows: result.windows,
    };
    return {
      publication, priceVersions, unpriced, recorded,
      pricingReviewDigest: hash(['billing-pricing-review/1', row.input, catalog.version, unpriced, recorded]),
    };
  } finally { db.close(); }
}

export function reviewBillingRead(path: string, run: string, report: string) {
  const candidate = readCandidate(path, run);
  writeFileSync(report, JSON.stringify(candidate, null, 2), { flag: 'wx', mode: 0o600 });
  return { ok: true, run, revision: candidate.publication.revision, priceVersions: candidate.priceVersions,
    pricingReviewDigest: candidate.pricingReviewDigest, unpricedGroups: candidate.unpriced.length };
}

export function publishBillingRead(path: string, run: string, approvalPath: string, output: string) {
  const candidate = readCandidate(path, run);
  const approval = JSON.parse(readFileSync(approvalPath, 'utf8'));
  const { publication } = candidate;
  if (!approval || approval.input !== publication.input || approval.revision !== publication.revision
    || approval.ledger !== publication.ledger || approval.asOf !== publication.asOf
    || typeof approval.baselineEvidence !== 'string' || !approval.baselineEvidence.trim()
    || !Array.isArray(approval.windows) || approval.windows.length !== usageRanges.length
    || !usageRanges.every(range => {
      const expected = approval.windows.find((window: { range?: unknown }) => window?.range === range);
      const actual = publication.windows.find(window => window.range === range);
      return !!actual && expected?.tokens === actual.tokens && expected?.baselineCost === actual.baselineCost;
    })) throw Error('BILLING_BASELINE_APPROVAL_MISMATCH');
  if (candidate.priceVersions < 1 || approval.catalog !== publication.catalog
    || approval.pricingReviewDigest !== candidate.pricingReviewDigest
    || typeof approval.pricingEvidence !== 'string' || !approval.pricingEvidence.trim()) {
    throw Error('BILLING_PRICING_APPROVAL_MISMATCH');
  }
  const lock = output + '.lock';
  const temporary = output + '.' + randomUUID() + '.tmp';
  writeFileSync(lock, '', { flag: 'wx', mode: 0o600 });
  try {
    if (existsSync(output)) throw Error('BILLING_PUBLICATION_ALREADY_EXISTS');
    writeFileSync(temporary, JSON.stringify(publication), { flag: 'wx', mode: 0o600 });
    renameSync(temporary, output);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
    unlinkSync(lock);
  }
  return { ok: true, run, revision: publication.revision, catalog: publication.catalog };
}
