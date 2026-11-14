import type { DatabaseSync } from 'node:sqlite';
import type { TransferSource } from '../domain/imports';
import { formatDecimal } from '../domain/usage-billing';
import type { BillingModelCost, BillingUnpricedGroup } from '../domain/usage-billing-read';

export type BillingMemberCost = {
  day: string;
  source: TransferSource;
  model: string;
  canonical_model: string | null;
  tokens: number;
  status: 'estimated' | 'unpriced' | 'excluded';
  amount: string;
};

type Cost = { estimated: number; unpriced: number; excluded: number; amount: bigint };
export const emptyCost = (): Cost => ({ estimated: 0, unpriced: 0, excluded: 0, amount: BigInt(0) });

export function applyCost(total: Cost, member: BillingMemberCost, direction: 1 | -1) {
  total[member.status] += direction * member.tokens;
  total.amount += BigInt(direction) * BigInt(member.amount);
}

export function costBreakdown(cost: Cost) {
  return { estimatedCostUsd: formatDecimal(cost.amount, 24), estimatedTokens: cost.estimated,
    unpricedTokens: cost.unpriced, excludedTokens: cost.excluded };
}

type StoredCost = Omit<Cost, 'amount'> & { amount: string };
const decodeCost = (row: StoredCost): Cost => ({ ...row, amount: BigInt(row.amount) });

function addCost(total: Cost, delta: Cost) {
  total.estimated += delta.estimated;
  total.unpriced += delta.unpriced;
  total.excluded += delta.excluded;
  total.amount += delta.amount;
}

const modelFor = (member: BillingMemberCost) => member.canonical_model ?? member.model;

export function prepareBillingBreakdown(state: DatabaseSync) {
  const existed = state.prepare("SELECT 1 FROM sqlite_schema WHERE name='billing_model_days'").get();
  state.exec(`
    CREATE TABLE IF NOT EXISTS billing_model_days (
      day TEXT NOT NULL, model TEXT NOT NULL, source TEXT NOT NULL, estimated INTEGER NOT NULL,
      unpriced INTEGER NOT NULL, excluded INTEGER NOT NULL, amount TEXT NOT NULL,
      PRIMARY KEY(day,model,source)
    );
  `);
  const find = state.prepare('SELECT estimated,unpriced,excluded,amount FROM billing_model_days WHERE day=? AND model=? AND source=?');
  const save = state.prepare('INSERT OR REPLACE INTO billing_model_days VALUES (?,?,?,?,?,?,?)');
  const remove = state.prepare('DELETE FROM billing_model_days WHERE day=? AND model=? AND source=?');
  const changes = new Map<string, { day: string; model: string; source: TransferSource; cost: Cost }>();

  function apply(member: BillingMemberCost, direction: 1 | -1) {
    const { day, source } = member, model = modelFor(member);
    const key = JSON.stringify([day, model, source]);
    let change = changes.get(key);
    if (!change) {
      if (changes.size >= 512) flush();
      change = { day, model, source, cost: emptyCost() };
      changes.set(key, change);
    }
    applyCost(change.cost, member, direction);
  }

  function flush() {
    for (const { day, model, source, cost } of changes.values()) {
      const previous = find.get(day, model, source) as StoredCost | undefined;
      if (previous) addCost(cost, decodeCost(previous));
      if (cost.estimated + cost.unpriced + cost.excluded > 0) {
        save.run(day, model, source, cost.estimated, cost.unpriced, cost.excluded, String(cost.amount));
      } else {
        remove.run(day, model, source);
      }
    }
    changes.clear();
  }

  if (!existed) {
    // Upgrade existing checkpoints from their already-priced members.
    const rows = state.prepare('SELECT day,source,model,canonical_model,tokens,status,amount FROM billing_members WHERE tokens>0');
    for (const row of rows.iterate()) {
      apply(row as BillingMemberCost, 1);
    }
    flush();
  }

  const modelDays = state.prepare('SELECT model,source,estimated,unpriced,excluded,amount FROM billing_model_days WHERE day BETWEEN ? AND ?');
  const unpriced = state.prepare(`SELECT source AS channel, model, reason, count(*) AS observations
    FROM billing_members WHERE reason IS NOT NULL AND silent=0 AND day>=? AND timestamp<=?
    GROUP BY source,model,reason ORDER BY observations DESC,source,model,reason`);
  const conflicted = state.prepare(`SELECT count(*) n FROM billing_members
    WHERE anchor_kind IS NOT NULL AND event_id IS NULL AND day>=? AND timestamp<=?`);

  function read(from: string, to: string, at: number, future: Iterable<BillingMemberCost>) {
    const byModel = new Map<string, Map<TransferSource, Cost>>();
    function channelCost(model: string, source: TransferSource) {
      let channels = byModel.get(model);
      if (!channels) {
        channels = new Map();
        byModel.set(model, channels);
      }
      let cost = channels.get(source);
      if (!cost) {
        cost = emptyCost();
        channels.set(source, cost);
      }
      return cost;
    }
    for (const row of modelDays.iterate(from, to)) {
      const stored = row as StoredCost & { model: string; source: TransferSource };
      addCost(channelCost(stored.model, stored.source), decodeCost(stored));
    }
    for (const member of future) applyCost(channelCost(modelFor(member), member.source), member, -1);
    const models: BillingModelCost[] = [];
    for (const [model, channels] of byModel) {
      const total = emptyCost();
      const breakdown = [...channels].filter(([, cost]) => cost.estimated + cost.unpriced + cost.excluded > 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([channel, cost]) => {
          addCost(total, cost);
          return { channel, ...costBreakdown(cost) };
        });
      if (breakdown.length) models.push({ model, ...costBreakdown(total), channels: breakdown });
    }
    return { models, unpriced: unpriced.all(from, at) as BillingUnpricedGroup[],
      conflicted: Number(conflicted.get(from, at)?.n) };
  }

  return { apply, flush, read };
}
