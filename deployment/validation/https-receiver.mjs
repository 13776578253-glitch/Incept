import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import assert from 'node:assert/strict';

// A loopback-only synthetic health/alert receiver, never a production notification destination.
assert.equal(process.env.INCEPT_TEST_DEPLOYMENT, '1');
const root = process.env.INCEPT_VALIDATION_ROOT;
assert.ok(path.isAbsolute(root) && path.basename(root).startsWith('incept-readiness-'));
const key = await fs.readFile(path.join(root, 'receiver.key'));
const cert = await fs.readFile(path.join(root, 'receiver.pem'));
const credential = (await fs.readFile(path.join(root, 'receiver-token'), 'utf8')).trim();
const events = new Map();
const server = https.createServer({ key, cert }, async (request, response) => {
  if (request.url === '/api/health/ready') {
    const state = JSON.parse(await fs.readFile(path.join(root, 'receiver-state.json')));
    response.writeHead(state.healthy ? 200 : 503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: state.healthy ? 'ready' : 'unavailable' })); return;
  }
  if (request.url !== '/alerts' || request.method !== 'POST' || request.headers.authorization !== `Bearer ${credential}`) { response.writeHead(404); response.end(); return; }
  let body = '';
  for await (const bytes of request) { body += bytes; if (body.length > 4096) { response.writeHead(413); response.end(); return; } }
  try {
    const event = JSON.parse(body);
    assert.deepEqual(Object.keys(event).sort(), ['check','eventId','occurredAt','service','status']);
    assert.equal(event.eventId, request.headers['idempotency-key']);
    events.set(event.eventId, event);
    await fs.writeFile(path.join(root, 'received-events.json'), JSON.stringify([...events.values()]), { mode: 0o600 });
    response.writeHead(204); response.end();
  } catch { response.writeHead(400); response.end(); }
});
server.listen(30344, '127.0.0.1', () => console.log('synthetic_https_receiver_started'));
process.on('SIGTERM', () => server.close());
