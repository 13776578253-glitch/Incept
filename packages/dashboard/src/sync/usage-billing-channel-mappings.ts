import { readFileSync } from 'node:fs';
import { TRANSFER_SOURCES, type TransferSource } from '../domain/imports';
import defaults from './usage-billing-channel-mappings.json';

type ChannelMapping = { channel: TransferSource; model: string; evidence: string } & (
  | { action: 'rate'; rateModel: string }
  | { action: 'exclude' }
  | { action: 'silence-missing-cache-write' }
);

const key = (channel: TransferSource, model: string) => JSON.stringify([channel, model]);
const isText = (value: unknown): value is string => typeof value === 'string' && !!value && value === value.trim();

export function readBillingChannelMappings(path?: string) {
  const rules = new Map<string, ChannelMapping>();
  const input = path === undefined ? defaults : JSON.parse(readFileSync(path, 'utf8'));
  if (input?.version !== 1 || !Array.isArray(input.rules)) throw Error('INVALID_BILLING_CHANNEL_MAPPINGS');
  for (const rule of input.rules) {
    if (!rule || !TRANSFER_SOURCES.includes(rule.channel) || !isText(rule.model) || !isText(rule.evidence)) {
      throw Error('INVALID_BILLING_CHANNEL_MAPPING');
    }
    const { channel, model, evidence, action, rateModel } = rule;
    const id = key(channel, model);
    if (rules.has(id)) throw Error('DUPLICATE_BILLING_CHANNEL_MAPPING');
    if (action === 'rate' && isText(rateModel) && rateModel !== model) {
      rules.set(id, { channel, model, evidence, action, rateModel });
    } else if (action === 'exclude' || action === 'silence-missing-cache-write') {
      rules.set(id, { channel, model, evidence, action });
    } else throw Error('INVALID_BILLING_CHANNEL_MAPPING');
  }
  return {
    rules: [...rules.keys()].sort().map(id => rules.get(id)!),
    get: (channel: TransferSource, model: string) => rules.get(key(channel, model)),
  };
}
