import 'server-only';
import { join } from 'node:path';
import { openSqliteReadOnly } from '../sqlite';

export function loadOpenCodeSessions(
  home: string,
): Map<string, { title?: string; directory?: string }> {
  const map = new Map<string, { title?: string; directory?: string }>();
  const dbPath = join(home, '.local', 'share', 'opencode', 'opencode.db');
  const db = openSqliteReadOnly(dbPath);
  if(!db) return map;

  try {
    const rows = db.prepare('SELECT id, title, directory FROM session').all();
    for(const row of rows) {
      const id = String(row.id ?? '').trim();
      if(!id) continue;
      map.set(id, {
        title: row.title ? String(row.title) : undefined,
        directory: row.directory ? String(row.directory) : undefined,
      });
    }
  } catch {
    // ignore
  } finally {
    db.close();
  }

  return map;
}
