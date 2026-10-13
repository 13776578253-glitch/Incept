import 'server-only';
import { readFile, stat, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { TokenDashboardData, UsageRange } from '../../domain';
import { overridesPath } from '../local/overrides';

type Snapshots = Partial<Record<UsageRange, TokenDashboardData>>;
const memory = new Map<string, Snapshots>();
const reads = new Map<string, Promise<Snapshots>>();
const writes = new Map<string, Promise<void>>();
export function snapshotContext() {
  const home = resolve(process.env.INCEPT_DASHBOARD_HOME ?? homedir());
  const path = resolve(process.env.INCEPT_DASHBOARD_CACHE_FILE ?? join(home, '.incept', 'dashboard-snapshots.json'));
  const scope = createHash('sha256').update(JSON.stringify([home, process.env.INCEPT_DASHBOARD_IMPORTS_FILE,
    overridesPath(), process.env.INCEPT_COMMANDCODE_CATALOG_FILE])).digest('hex');
  return { home, path, scope, key: path + ':' + scope };
}
function isSnapshot(value: unknown, range: string): value is TokenDashboardData {
  if (!value || typeof value !== 'object') return false;
  const data = value as TokenDashboardData;
  return data.range === range && typeof data.checkedAt === 'string' && Number.isFinite(Date.parse(data.checkedAt))
    && !!data.totals && !!data.costs && !!data.dateRange && ['daily', 'monthly', 'models', 'sources', 'projects', 'sessions'].every(key => Array.isArray(data[key as keyof TokenDashboardData]));
}
export async function readDashboardSnapshot(range: UsageRange = '30d'): Promise<TokenDashboardData | null> {
  const context = snapshotContext();
  if (!memory.has(context.key)) {
    if (!reads.has(context.key)) reads.set(context.key, (async () => {
      let snapshots: Snapshots = {};
      try {
        if ((await stat(context.path)).size > 64 * 1024 * 1024) throw new Error('Snapshot exceeds cache limit');
        const file = await readFile(context.path, 'utf8');
        if (file.length <= 64 * 1024 * 1024) {
          const stored = JSON.parse(file);
          if (stored.version === 1 && stored.scope === context.scope) {
            for (const range of ['7d', '14d', '30d', 'all'] as const) if (isSnapshot(stored.snapshots?.[range], range)) snapshots[range] = stored.snapshots[range];
          }
        }
      } catch { /* Missing or damaged history must not delay navigation. */ }
      // A completed worker request can populate memory while this disk read is pending.
      snapshots = { ...snapshots, ...memory.get(context.key) };
      memory.set(context.key, snapshots); return snapshots;
    })().finally(() => reads.delete(context.key)));
    await reads.get(context.key);
  }
  return memory.get(context.key)?.[range] ?? null;
}
export async function saveDashboardSnapshot(data: TokenDashboardData) {
  const context = snapshotContext(), range = data.range;
  if (!range) return;
  await readDashboardSnapshot(range);
  memory.get(context.key)![range] = data;
  const previous = writes.get(context.key) ?? Promise.resolve();
  const write = previous.catch(() => {}).then(async () => {
    const temporary = context.path + '.' + randomUUID() + '.tmp';
    try {
      await mkdir(dirname(context.path), { recursive: true });
      await writeFile(temporary, JSON.stringify({ version: 1, scope: context.scope, snapshots: memory.get(context.key) }), { flag: 'wx', mode: 0o600 });
      await rename(temporary, context.path);
    } finally { await unlink(temporary).catch(() => {}); }
  });
  writes.set(context.key, write);
  try { await write; } catch { /* A cache write failure must not discard successful collection. */ }
  finally { if (writes.get(context.key) === write) writes.delete(context.key); }
}
