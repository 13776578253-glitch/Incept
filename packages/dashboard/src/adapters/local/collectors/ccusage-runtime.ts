import 'server-only';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, dirname, join } from 'node:path';

export function ccusageBinary() {
  const configured = process.env.INCEPT_DASHBOARD_CCUSAGE_BIN;
  if (configured && existsSync(configured)) return configured;
  // Resolve the packaged native executable without loading cli.js: its ESM
  // wrapper contains top-level await and cannot be required by a CJS Next server.
  const resolver = createRequire(join(process.cwd(), 'package.json'));
  let directory = process.cwd();
  while (true) {
    try {
      const entry = resolver.resolve('ccusage/src/cli.js', { paths: [directory, join(directory, 'packages', 'dashboard')] });
      const native = createRequire(entry).resolve(`@ccusage/ccusage-${process.platform}-${process.arch}/bin/ccusage${process.platform === 'win32' ? '.exe' : ''}`);
      if (existsSync(native)) return native;
    } catch { /* Try the workspace parent, then PATH. */ }
    if (dirname(directory) === directory) break;
    directory = dirname(directory);
  }
  for (const folder of (process.env.PATH ?? '').split(delimiter)) {
    const path = join(folder, process.platform === 'win32' ? 'ccusage.exe' : 'ccusage');
    if (existsSync(path)) return path;
  }
}
