import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, copyFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CompatibleSyncService } from '../adapters/local/imports/sync/legacy';
import { AgentState } from '../../../../apps/sync-agent/src/state';
import type { SyncHeader, SyncRecord } from '../domain/sync';

const v4Source = 'C:\\Users\\86139\\.gemini\\antigravity\\brain\\fcdd7add-659f-4f00-bc3e-ef32b5d21269\\scratch\\v4_preflight.db';
const preflightState = join(process.env.LOCALAPPDATA ?? '', 'Incept', 'backup-recovery-preflight-20261022T100500', 'state.db');
const hasSandboxFiles = existsSync(v4Source) && existsSync(preflightState);

describe.skipIf(!hasSandboxFiles)('Recovery Sandbox E2E Protocol Rehearsal', () => {
  let tempDir: string;
  let serviceDbPath: string;
  let stateDbPath: string;
  let service: CompatibleSyncService | undefined;
  let agentState: AgentState | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'incept-recovery-rehearsal-'));
    serviceDbPath = join(tempDir, 'sync.db');
    stateDbPath = join(tempDir, 'state.db');

    // Seed server DB with real v4 preflight database (Rev 597)
    copyFileSync(v4Source, serviceDbPath);

    // Seed client state DB with real preflight local state
    copyFileSync(preflightState, stateDbPath);
  });

  afterEach(() => {
    service?.close();
    agentState?.close();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('submits real Codex batch 19af00be to real v4 ledger and updates client lineage', async () => {
    service = new CompatibleSyncService(serviceDbPath);
    agentState = new AgentState(tempDir);

    // Initial server state verification
    expect(service.revision()).toBe(597);
    const scopeBefore = service.db.prepare('SELECT head_manifest, head_generation, token_total FROM sync_scopes WHERE scope_id = ?').get('b3ca714cfa34e9e9f2d0121bf6e6829932404cf05768bca21b8acceefa0fa052');
    expect(scopeBefore).toBeDefined();

    // Load real batch 19af00be (which was falsely rejected by v2)
    const batchFile = 'C:\\Users\\86139\\.gemini\\antigravity\\brain\\fcdd7add-659f-4f00-bc3e-ef32b5d21269\\scratch\\batch_19af00be.json';
    const { header, records } = JSON.parse(readFileSync(batchFile, 'utf8')) as { header: SyncHeader; records: SyncRecord[] };

    const deviceId = header.manifest.scope.deviceId;
    const actor = { role: 'device' as const, deviceId };

    // 1. Begin Staging on Server
    const beginRes = service.begin(header, actor);
    expect(beginRes.nextOffset).toBe(0);

    // 2. Stage Records in chunks (100 per page)
    let offset = 0;
    while (offset < records.length) {
      const chunk = records.slice(offset, offset + 100);
      offset = service.stage(deviceId, header.batchId, offset, chunk, actor);
    }
    expect(offset).toBe(records.length);

    // 3. Commit on Server
    const receipt = service.commit(deviceId, header.batchId, actor);
    expect(receipt.status).toBe('committed');
    expect(receipt.batchId).toBe(header.batchId);
    expect(receipt.outcome).toBe('updated');
    expect(receipt.dataRevision).toBe(598); // Monotonically advanced from 597!

    // 4. Verify Server Ledger Post-State
    expect(service.revision()).toBe(598);
    const scopeAfter = service.db.prepare('SELECT head_manifest, head_generation, token_total FROM sync_scopes WHERE scope_id = ?').get('b3ca714cfa34e9e9f2d0121bf6e6829932404cf05768bca21b8acceefa0fa052') as { head_manifest: string; head_generation: string; token_total: number };
    expect(scopeAfter.head_manifest).toBe(header.manifest.manifestHash);
    expect(scopeAfter.head_generation).toBe(header.manifest.generationId);
    expect(scopeAfter.token_total).toBeGreaterThan(0);

    // 5. Client Acknowledges Real Receipt
    agentState.acknowledge(header.batchId, receipt);

    // 6. Verify Client State Database Updates
    const savedReceipt = agentState.db.prepare('SELECT json FROM receipts WHERE batch = ?').get(header.batchId);
    expect(savedReceipt).toBeDefined();
    const parsedReceipt = JSON.parse(savedReceipt!.json as string);
    expect(parsedReceipt.dataRevision).toBe(598);
    expect(parsedReceipt.status).toBe('committed');

    // Outbox entry is cleanly evicted upon commit acknowledge
    const outboxRow = agentState.db.prepare('SELECT state FROM outbox WHERE batch = ?').get(header.batchId);
    expect(outboxRow).toBeUndefined();

    // Records for this batch are cleanly evicted
    const remainingRecords = agentState.db.prepare('SELECT COUNT(*) as c FROM records WHERE batch = ?').get(header.batchId) as { c: number };
    expect(remainingRecords.c).toBe(0);

    const metaRev = agentState.get<number>('dataRevision');
    expect(metaRev).toBe(598);

    // Verify lineage table has the scope updated
    const scopeId = 'b3ca714cfa34e9e9f2d0121bf6e6829932404cf05768bca21b8acceefa0fa052';
    const lineageRow = agentState.db.prepare('SELECT receipt_json FROM lineage WHERE scope = ?').get(scopeId) as { receipt_json: string } | undefined;
    if (lineageRow) {
      const lr = JSON.parse(lineageRow.receipt_json);
      expect(lr.batchId).toBe(header.batchId);
    }
  });

  it('verifies real AgentHttp wire upload loop, commit, receipt acknowledgement and outbox eviction', async () => {
    const { createServer } = await import('node:http');
    const { AgentHttp } = await import('../../../../apps/sync-agent/src/transport');

    service = new CompatibleSyncService(serviceDbPath);
    agentState = new AgentState(tempDir);

    const batchFile = 'C:\\Users\\86139\\.gemini\\antigravity\\brain\\fcdd7add-659f-4f00-bc3e-ef32b5d21269\\scratch\\batch_19af00be.json';
    const { header, records } = JSON.parse(readFileSync(batchFile, 'utf8')) as { header: SyncHeader; records: SyncRecord[] };
    const deviceId = header.manifest.scope.deviceId;
    const actor = { role: 'device' as const, deviceId };

    // Setup an HTTP server implementing the /api/dashboard/sync protocol backed by the real authoritative service
    const server = createServer(async (req, res) => {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const pathname = url.pathname;

      const readBody = async (): Promise<any> => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const text = Buffer.concat(chunks).toString('utf8');
        return text ? JSON.parse(text) : undefined;
      };

      try {
        if (pathname === '/api/dashboard/sync/scopes/resolve' && req.method === 'POST') {
          const body = await readBody();
          const scope = { deviceId, source: body.source, sessionId: body.sessionId };
          const head = service!.db.prepare('SELECT head_manifest FROM sync_scopes WHERE scope_id = ?').get('b3ca714cfa34e9e9f2d0121bf6e6829932404cf05768bca21b8acceefa0fa052') as { head_manifest: string } | undefined;
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ scope, headManifest: head?.head_manifest ?? null, status: 'registered' }));
          return;
        }

        if (pathname === '/api/dashboard/sync/batches' && req.method === 'POST') {
          const body = await readBody();
          const beginRes = service!.begin(body.header, actor);
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ status: 'staging', nextOffset: beginRes.nextOffset }));
          return;
        }

        const pageMatch = pathname.match(/^\/api\/dashboard\/sync\/batches\/([^/]+)\/pages\/(\d+)$/);
        if (pageMatch && req.method === 'PUT') {
          const batchId = pageMatch[1];
          const offset = Number(pageMatch[2]);
          const body = await readBody();
          const nextOffset = service!.stage(deviceId, batchId, offset, body.records, actor);
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ nextOffset }));
          return;
        }

        const commitMatch = pathname.match(/^\/api\/dashboard\/sync\/batches\/([^/]+)\/commit$/);
        if (commitMatch && req.method === 'POST') {
          const batchId = commitMatch[1];
          const receipt = service!.commit(deviceId, batchId, actor);
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ receipt }));
          return;
        }

        const batchMatch = pathname.match(/^\/api\/dashboard\/sync\/batches\/([^/]+)$/);
        if (batchMatch && req.method === 'GET') {
          const batchId = batchMatch[1];
          const receipt = service!.receipt(deviceId, batchId);
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ receipt, state: receipt ? 'committed' : 'staging' }));
          return;
        }

        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'NOT_FOUND' }));
      } catch (err: any) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as any).port;
    const endpoint = `http://127.0.0.1:${port}`;

    try {
      const transport = new AgentHttp(endpoint, 'mock-token', { allowLoopbackHttp: true, paceMs: 0 });

      // 1. Resolve scope over HTTP
      const admission = await transport.request<{ scope: any; headManifest: string | null }>('/scopes/resolve', 'POST', {
        source: header.manifest.scope.source,
        sessionId: header.manifest.scope.sessionId,
      });
      expect(admission.headManifest).toBeDefined();

      // 2. Begin batch over HTTP
      const beginReply = await transport.request<{ nextOffset: number }>('/batches', 'POST', { header });
      expect(beginReply.nextOffset).toBe(0);

      // 3. Stage pages over HTTP
      let offset = 0;
      while (offset < records.length) {
        const page = records.slice(offset, offset + 100);
        const stageReply = await transport.request<{ nextOffset: number }>(`/batches/${header.batchId}/pages/${offset}`, 'PUT', { records: page });
        offset = stageReply.nextOffset;
      }
      expect(offset).toBe(records.length);

      // 4. Commit batch over HTTP
      const commitReply = await transport.request<{ receipt: any }>(`/batches/${header.batchId}/commit`, 'POST');
      expect(commitReply.receipt.status).toBe('committed');
      expect(commitReply.receipt.dataRevision).toBe(598);

      // 5. Query batch confirmed status over HTTP
      const confirmed = await transport.request<{ receipt: any }>(`/batches/${header.batchId}`, 'GET');
      expect(confirmed.receipt.status).toBe('committed');
      expect(confirmed.receipt.dataRevision).toBe(598);

      // 6. Client processes confirmed receipt
      agentState.acknowledge(header.batchId, confirmed.receipt);

      // 7. Verify Client State Database is cleanly updated
      expect(agentState.get<number>('dataRevision')).toBe(598);
      expect(agentState.db.prepare('SELECT state FROM outbox WHERE batch = ?').get(header.batchId)).toBeUndefined();
      expect((agentState.db.prepare('SELECT COUNT(*) c FROM records WHERE batch = ?').get(header.batchId) as any).c).toBe(0);

      const clientReceipt = agentState.db.prepare('SELECT json FROM receipts WHERE batch = ?').get(header.batchId) as any;
      expect(JSON.parse(clientReceipt.json).dataRevision).toBe(598);

      // 8. Verify Server Database state
      expect(service.revision()).toBe(598);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
