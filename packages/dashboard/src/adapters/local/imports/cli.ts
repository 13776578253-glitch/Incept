import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { exportTokenData } from './exporter';
import { commitImport, importHistory, previewImport, rollbackImport } from './service';
import { importStorePath } from './store';
import { MAX_TRANSFER_BYTES } from './validation';
import type { ImportMappings } from '../../../domain';

function run() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || major === 22 && minor < 13) throw new Error('Node.js 22.13+ is required. Install Node.js 24 LTS and run again.');
  const args = process.argv.slice(2), command = args.shift() ?? 'export';
  const flags: Record<string, string> = {}, positional: string[] = [];
  while (args.length) {
    const arg = args.shift()!;
    if (arg.startsWith('--')) {
      if (!['--out', '--home', '--label', '--store', '--mapping'].includes(arg) || !args[0] || args[0].startsWith('--')) throw new Error('Invalid option: ' + arg);
      flags[arg.slice(2)] = args.shift()!;
    } else positional.push(arg);
  }
  const storePath = flags.store ? resolve(flags.store) : importStorePath(flags.home);
  const options = { storePath, home: flags.home };
  if (command === 'export') {
    const bundle = exportTokenData({ home: flags.home, label: flags.label });
    const path = resolve(flags.out ?? 'token-export-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
    const json = JSON.stringify(bundle);
    if (Buffer.byteLength(json) > MAX_TRANSFER_BYTES) throw new Error('Export exceeds 64 MiB; no file was written');
    writeFileSync(path, json + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ path, device: bundle.device, records: bundle.events.length,
      sources: ['codex', 'commandcode'].map(source => ({ source, records: bundle.events.filter(event => event.source === source).length })),
      warnings: bundle.warnings }, null, 2));
    return;
  }
  if (command === 'preview') {
    if (!positional[0]) throw new Error('preview requires an export JSON path');
    if (statSync(positional[0]).size > MAX_TRANSFER_BYTES) throw new Error('Transfer exceeds 64 MiB');
    const mappings = flags.mapping ? JSON.parse(readFileSync(flags.mapping, 'utf8')) as ImportMappings : {};
    if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)) throw new Error('Invalid project mappings');
    console.log(JSON.stringify(previewImport(JSON.parse(readFileSync(positional[0], 'utf8')), mappings, options), null, 2));
    return;
  }
  if (command === 'history') { console.log(JSON.stringify(importHistory(storePath), null, 2)); return; }
  if (command === 'commit' || command === 'rollback') {
    if (!positional[0]) throw new Error(command + ' requires an identifier');
    console.log(JSON.stringify(command === 'commit' ? commitImport(positional[0], options) : rollbackImport(positional[0], storePath), null, 2));
    return;
  }
  throw new Error('Usage: dashboard-data [export --out FILE | preview FILE | commit PREVIEW_ID | history | rollback BATCH_ID] [--store DB]');
}
try { run(); } catch (error) { console.error(error instanceof Error ? error.message : 'Token transfer failed'); process.exitCode = 1; }
