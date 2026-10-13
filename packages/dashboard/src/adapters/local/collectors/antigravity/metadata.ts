import 'server-only';
import { fields, integer, integers, message, messages, string, timestamp, type Field } from './protobuf';

export type NativeUsage = { modelId?: number; inputTokens: number; outputTokens: number; reasoningTokens: number;
  cacheReadTokens: number; cacheCreationTokens: number; identities: string[] };
export type NativeEvent = { usage: NativeUsage; timestampMs?: number; key: string; modelName?: string };
export type NativeRow = { modelId?: number; modelName?: string; placeholder?: string; timestampMs?: number; steps: number[]; events: NativeEvent[] };

function identity(slug?: string, label?: string): string | undefined {
  return [slug, label].find(value => value && !/^model_placeholder_m\d+$/i.test(value));
}
function usage(data: Field[]): NativeUsage {
  const reasoningTokens = integer(data, 9) ?? 0, visible = integer(data, 10) ?? 0;
  const totalOutput = Math.max(integer(data, 3) ?? 0, visible + reasoningTokens);
  const identities = [[11, 'response'], [12, 'provider'], [7, 'message']] as const;
  return { modelId: integer(data, 1) || undefined, inputTokens: integer(data, 2) ?? 0,
    outputTokens: Math.max(visible, totalOutput - reasoningTokens), reasoningTokens,
    cacheCreationTokens: integer(data, 4) ?? 0, cacheReadTokens: integer(data, 5) ?? 0,
    identities: identities.flatMap(([field, prefix]) => { const value = string(data, field); return value ? [prefix + ':' + value] : []; }) };
}
function events(data: Field[], usageField: number, retryField: number, key: string, modelId?: number, timestampMs?: number): NativeEvent[] {
  const candidates = [...messages(data, usageField).map((item, index) => ({ item, key: key + ':usage:' + index })),
    ...messages(data, retryField).flatMap((retry, index) => messages(retry, 2).map(item => ({ item, key: key + ':retry:' + index })))];
  return candidates.map(({ item, key }) => {
    const value = usage(item); value.modelId ??= modelId;
    return { usage: value, timestampMs, key };
  }).filter(event => event.usage.inputTokens + event.usage.outputTokens + event.usage.reasoningTokens + event.usage.cacheReadTokens + event.usage.cacheCreationTokens > 0);
}
export function generation(index: number, data: Uint8Array): NativeRow {
  const metadata = fields(data), chat = message(metadata, 1);
  const placeholder = messages(chat, 20).find(item => string(item, 1) === 'model_enum');
  const modelId = integer(chat, 3) || undefined;
  const timestampMs = timestamp(message(message(chat, 9), 4));
  return { modelId, timestampMs, placeholder: placeholder ? string(placeholder, 2)?.toLowerCase() : undefined,
    modelName: identity(string(chat, 19), string(chat, 21, 22)), steps: integers(metadata, 2),
    events: events(chat, 4, 17, 'generation:' + index, modelId, timestampMs) };
}
export function step(index: number, data: Uint8Array): NativeRow {
  const metadata = fields(data), info = message(metadata, 24), modelId = integer(info, 1) || undefined;
  const timestampMs = timestamp(message(metadata, 8)) ?? timestamp(message(metadata, 1));
  return { modelId, timestampMs, modelName: identity(string(info, 12), string(info, 8)), steps: [],
    events: events(metadata, 9, 28, 'step:' + index, modelId, timestampMs) };
}
