import 'server-only';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function walkFiles(dir: string, predicate: (filePath: string) => boolean, onUnreadable?: () => void): string[] {
  if(!existsSync(dir)) return [];
  const results: string[] = [];
  const stack = [dir];
  while(stack.length > 0) {
    const current = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      onUnreadable?.();
      continue;
    }
    for(const entry of entries) {
      const fullPath = join(current, entry.name);
      if(entry.isDirectory()) {
        stack.push(fullPath);
      } else if(entry.isFile() && predicate(fullPath)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}
