import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { UnitPricing } from './types';

// CommandCode currently distributes its model catalog inside cli.mjs. Read only literal
// catalog entries; never import or execute the CLI (which also performs authentication/telemetry).
export function loadCommandCodePricing(home: string): Map<string, UnitPricing> {
  const prices = new Map<string, UnitPricing>();
  if (!existsSync(join(home, '.commandcode'))) return prices;
  const path = process.env.INCEPT_COMMANDCODE_CATALOG_FILE
    ?? join(dirname(process.execPath), 'node_modules', 'command-code', 'dist', 'cli.mjs');
  try {
    const catalog = readFileSync(path, 'utf8');
    const entries = catalog.matchAll(/"([^"\n]+)":\{inputCost:([\d.eE+-]+),outputCost:([\d.eE+-]+)((?:,[a-zA-Z]+Cost:[\d.eE+-]+)*)\}/g);
    for (const [, model, input, output, extras] of entries) {
      const rates: UnitPricing = { inputPerMillion: Number(input), outputPerMillion: Number(output) };
      for (const [, key, value] of extras.matchAll(/,(cacheReadCost|cacheWriteCost):([\d.eE+-]+)/g)) {
        rates[key === 'cacheReadCost' ? 'cacheReadPerMillion' : 'cacheWritePerMillion'] = Number(value);
      }
      if (Object.values(rates).every(rate => Number.isFinite(rate) && rate >= 0)) prices.set(model.toLowerCase(), rates);
    }
  } catch { /* Optional installed catalog; local registry and overrides still work. */ }
  return prices;
}
