import 'server-only';
import type { SqliteDatabaseSync } from '../../types';
import { generation, step, type NativeEvent, type NativeRow } from './metadata';
import { fields, message, timestamp } from './protobuf';

export function readConversation(db: SqliteDatabaseSync): { events: NativeEvent[]; errors: number; createdAt?: number; cwd?: string } {
  const generations = new Map<number, NativeRow>(), steps = new Map<number, NativeRow>();
  let errors = 0, createdAt: number | undefined, cwd: string | undefined;
  for (const [table, column, destination, parse] of [
    ['gen_metadata', 'data', generations, generation], ['steps', 'metadata', steps, step],
  ] as const) {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) { errors++; continue; }
    for (const row of db.prepare(`SELECT idx, ${column} AS data FROM ${table} WHERE ${column} IS NOT NULL ORDER BY idx`).all()) {
      try { destination.set(Number(row.idx), parse(Number(row.idx), row.data as Uint8Array)); } catch { errors++; }
    }
  }
  try {
    const row = db.prepare('SELECT data FROM trajectory_metadata_blob LIMIT 1').get();
    if (row?.data) {
      const data = Buffer.from(row.data as Uint8Array);
      createdAt = timestamp(message(fields(data), 2));
      const uri = data.toString('utf8').match(/file:\/\/\/([^\x00-\x1f\s#"'*?<>|]+)/)?.[1];
      if (uri) cwd = decodeURIComponent(uri);
    }
  } catch { /* Metadata is optional; usage timestamps are preferred. */ }
  const learned = new Map<number, string>();
  for (const row of [...generations.values(), ...steps.values()]) if (row.modelId && row.modelName && !learned.has(row.modelId)) learned.set(row.modelId, row.modelName);
  const result: NativeEvent[] = [], linked = new Set<number>();
  let previousStep = -1;
  for (const row of generations.values()) {
    const lastStep = Math.max(previousStep, ...row.steps);
    const related = [...steps].filter(([index]) => index > previousStep && index <= lastStep);
    const linkedTime = row.steps.map(index => steps.get(index)?.timestampMs).find(value => value !== undefined);
    const append = (event: NativeEvent, owner: NativeRow) => {
      const id = event.usage.modelId;
      const modelName = owner.modelName && (id === undefined || owner.modelId === undefined || id === owner.modelId) ? owner.modelName
        : id !== undefined ? learned.get(id) : row.modelName;
      result.push({ ...event, modelName: modelName ?? owner.placeholder ?? (id === undefined ? 'unknown' : 'model-id:' + id),
        timestampMs: event.timestampMs ?? linkedTime ?? row.timestampMs ?? createdAt });
    };
    for (const [index, item] of related) { linked.add(index); for (const event of item.events) append(event, item.modelName ? item : row); }
    for (const event of row.events) append(event, row);
    previousStep = lastStep;
  }
  for (const [index, row] of steps) if (!linked.has(index)) for (const event of row.events) result.push({ ...event,
    modelName: row.modelName ?? (event.usage.modelId ? learned.get(event.usage.modelId) ?? 'model-id:' + event.usage.modelId : 'unknown'),
    timestampMs: event.timestampMs ?? createdAt });
  return { events: deduplicateRequests(result), errors, createdAt, cwd };
}

function deduplicateRequests(events: NativeEvent[]) {
  const slots: Array<NativeEvent | undefined> = [], identities = new Map<string, number>();
  for (const event of events) {
    const matches = [...new Set(event.usage.identities.flatMap(id => identities.has(id) ? [identities.get(id)!] : []))];
    const index = matches[0] ?? slots.length;
    if (!matches.length) slots.push(event);
    const target = slots[index]!;
    for (const duplicate of [event, ...matches.slice(1).map(match => slots[match]!)]) {
      if (target !== duplicate) {
        if (target.usage.modelId === undefined || duplicate.usage.modelId === undefined || target.usage.modelId === duplicate.usage.modelId) {
          for (const key of ['inputTokens', 'outputTokens', 'reasoningTokens', 'cacheReadTokens', 'cacheCreationTokens'] as const) target.usage[key] = Math.max(target.usage[key], duplicate.usage[key]);
          if ((!target.modelName || /^(unknown|model-id:|model_placeholder_)/.test(target.modelName)) && duplicate.modelName) target.modelName = duplicate.modelName;
        }
        target.usage.identities = [...new Set([...target.usage.identities, ...duplicate.usage.identities])];
        if (duplicate.timestampMs !== undefined) target.timestampMs = Math.min(target.timestampMs ?? duplicate.timestampMs, duplicate.timestampMs);
      }
    }
    for (const match of matches.slice(1)) slots[match] = undefined;
    for (const id of target.usage.identities) identities.set(id, index);
  }
  return slots.filter((event): event is NativeEvent => event !== undefined);
}
