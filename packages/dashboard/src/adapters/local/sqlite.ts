import 'server-only';
import { existsSync } from 'node:fs';
import { type SqliteDatabaseSync } from './types';

export function openSqliteReadOnly(dbPath: string): SqliteDatabaseSync | null {
  if(!existsSync(dbPath)) return null;
  try {
    const sqliteModule = (
      process as unknown as {
        getBuiltinModule?: (id: string) => {
          DatabaseSync?: new (
            path: string,
            options?: { open?: boolean; readOnly?: boolean },
          ) => SqliteDatabaseSync;
        };
      }
    ).getBuiltinModule?.('node:sqlite');
    if(!sqliteModule?.DatabaseSync) return null;
    return new sqliteModule.DatabaseSync(dbPath, { open: true, readOnly: true });
  } catch {
    return null;
  }
}
