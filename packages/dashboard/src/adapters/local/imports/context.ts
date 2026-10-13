import { homedir } from 'node:os';
import { collectAiusageAndRawAgentEvents } from '../collectors/agents';
import { normalizeFile } from '../collectors/common';
import { collectCommandCodeEvents } from '../collectors/commandcode';
import { loadLocalPricingMap } from '../pricing';
import { readLocalOverrides } from '../overrides';
import type { RawUsageEvent, UnitPricing } from '../types';

export type ImportContext = { events: RawUsageEvent[]; aliases: Record<string, string>; pricing: Map<string, UnitPricing> };
export function collectImportContext(home = homedir()): ImportContext {
  const overrides = readLocalOverrides();
  const pricing = loadLocalPricingMap(home, overrides);
  const commandcode = collectCommandCodeEvents(home, pricing);
  const commandFiles = new Set(commandcode.events.flatMap(event => event.sourceFile ? [normalizeFile(event.sourceFile)] : []));
  const agents = collectAiusageAndRawAgentEvents(home, pricing);
  const events = [...commandcode.events, ...agents.events.filter(event => event.sourceId !== 'commandcode' || !event.sourceFile || !commandFiles.has(normalizeFile(event.sourceFile)))];
  return { events,
    pricing, aliases: overrides.aliases };
}
