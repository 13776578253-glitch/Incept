import type { TransferBundle } from '../../../domain';
import type { UnitPricing } from '../types';
import { canonicalModelName } from '../overrides';
import { lookupPricing } from '../pricing';
import type { StoredBatch } from './store';

// A batch's own captured reference rates precede catalogs inherited from other snapshots.
export function capturedPricing(bundle: TransferBundle, aliases: Record<string, string>) {
  const pricing = new Map<string, UnitPricing>(Object.entries(bundle.prices).map(([model, price]) => [model.toLowerCase(), price]));
  for (const [model, price] of Object.entries(bundle.prices)) {
    const canonical = canonicalModelName(model, aliases).toLowerCase();
    if (!pricing.has(canonical)) pricing.set(canonical, price);
  }
  return pricing;
}

export function inheritedPricing(receiver: Map<string, UnitPricing>, aliases: Record<string, string>, newestFirst: StoredBatch[]) {
  const combined = new Map(receiver);
  for (const batch of newestFirst) for (const [model, price] of capturedPricing(batch.bundle, aliases)) {
    if (!lookupPricing(combined, model)) combined.set(model, price);
  }
  return combined;
}
