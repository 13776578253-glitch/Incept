import { billingComponents, estimateUsage, usageComponentRates, type BillingUsage } from '../domain/usage-billing';
import type { readUsageRates } from '../adapters/local/usage-rate-catalog';
import type { readBillingChannelMappings } from './usage-billing-channel-mappings';

export function estimateLedgerUsage(event: BillingUsage, rates: ReturnType<typeof readUsageRates>,
  mappings: ReturnType<typeof readBillingChannelMappings>) {
  const counters = { input: event.inputTokens, output: event.outputTokens, cacheRead: event.cacheReadTokens,
    cacheWrite: event.cacheCreationTokens, reasoning: event.reasoningTokens };
  const tokens = Object.values(counters).reduce((sum, count) => sum + count, 0);
  const mapping = mappings.get(event.source, event.modelName);
  const model = mapping?.action === 'map' ? mapping.canonicalModel : event.modelName;
  const selected = rates.select(model, event);
  const charge = mapping?.action === 'exclude'
    ? { status: 'excluded' as const, reason: 'CHANNEL_ROUTE_EXCLUDED' }
    : estimateUsage(event, selected);
  const perMillion = selected && usageComponentRates(event, selected.rate);
  const silent = charge.status === 'unpriced' && charge.reason === 'RATE_COMPONENT_MISSING'
    && mapping?.action === 'silence-missing-cache-write' && perMillion && counters.cacheWrite > 0
    && perMillion.cacheWrite === undefined
    && billingComponents.every(component => component === 'cacheWrite' || counters[component] === 0
      || perMillion[component] !== undefined);
  return { counters, tokens, model, charge, silent: !!silent };
}
