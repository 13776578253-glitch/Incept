// Bundled by the test with already-installed esbuild; each invocation exits.
import { readFileSync, writeFileSync } from 'node:fs';
import { LineageClient, LineageServer } from './phase0c-lineage';
import { scan } from './phase0c-evidence';
import type { Scope, PriceBasis } from '../phase0b/phase0b-contract';

async function main() {
  const [action, inputPath, outputPath] = process.argv.slice(2);
  const input = JSON.parse(readFileSync(inputPath, 'utf8')) as { home: string; server: string; client: string; scope: Scope; basis: PriceBasis; batchId: string };
  const server = new LineageServer(input.server), client = new LineageClient(input.client, input.scope);
  try {
    if (action === 'prepare') {
      server.register(input.scope);
      const manifest = await scan(input.home, input.scope, input.basis, client.state().acknowledged);
      client.prepare(input.batchId, manifest);
    } else if (action === 'remote-failure' || action === 'ack-loss' || action === 'retry' || action === 'crash-during-commit') {
      const pending = client.state().pending; if (!pending) throw new Error('NO_PENDING_BATCH');
      if (action === 'remote-failure') {
        try { await server.submit(pending.batchId, pending.manifest, input.scope.deviceId, { failCommit: true }); } catch (error) {
          if ((error as Error).message !== 'INJECTED_COMMIT_FAILURE') throw error;
        }
      } else {
        const receipt = await server.submit(pending.batchId, pending.manifest, input.scope.deviceId,
          action === 'crash-during-commit' ? { onStage: () => process.exit(23) } : {});
        if (action === 'retry') client.acknowledge(receipt, server);
      }
    } else throw new Error('UNKNOWN_ACTION');
    writeFileSync(outputPath, JSON.stringify({ pid: process.pid, client: client.state(), server: server.state(), inputTokens: server.view().reduce((sum, row) => sum + row.inputTokens, 0) }));
  } finally { server.close(); }
}
main().catch(error => { process.stderr.write(String(error)); process.exitCode = 1; });
