import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { PassThrough } from 'node:stream';
import { createAcceptanceProxy } from '../deployment/v4-http-entry.mjs';

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

function cleanup(t, server) {
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(resolve);
  }));
}

async function fixture(t, handler) {
  const calls = [];
  const upstream = http.createServer(handler);
  const upstreamPort = await listen(upstream);
  cleanup(t, upstream);
  const proxy = createAcceptanceProxy((options, callback) => {
    calls.push(options);
    return http.request({ ...options, hostname: '127.0.0.1', port: upstreamPort }, callback);
  });
  const port = await listen(proxy);
  cleanup(t, proxy);
  return { port, calls };
}

function request(port, { path = '/api/health/ready', method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

function rawRequest(port, value) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    let output = '';
    socket.setTimeout(3000, () => socket.destroy(new Error('Synthetic request timed out')));
    socket.on('connect', () => socket.write(value));
    socket.on('data', (chunk) => { output += chunk.toString(); });
    socket.on('error', reject);
    socket.on('end', () => resolve(output));
  });
}

test('origin-form requests use only the fixed app upstream and preserve path/query', async (t) => {
  const { port, calls } = await fixture(t, (req, res) => res.end(req.url));
  const response = await request(port, { path: '/api/health/ready?probe=1', headers: { host: 'attacker.invalid:99' } });
  assert.equal(response.status, 200);
  assert.equal(response.body.toString(), '/api/health/ready?probe=1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].hostname, 'app');
  assert.equal(calls[0].port, 3000);
  assert.equal(calls[0].headers.host, '127.0.0.1:3305');
});

test('POST body and streamed response pass through without modification', async (t) => {
  const payload = Buffer.from('synthetic acceptance payload\u0000\u4e2d\u6587');
  const { port } = await fixture(t, (req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      assert.deepEqual(Buffer.concat(chunks), payload);
      res.writeHead(201, { 'content-type': 'application/octet-stream', 'x-synthetic-result': 'ok' });
      res.write(payload.subarray(0, 5));
      res.end(payload.subarray(5));
    });
  });
  const response = await request(port, { method: 'POST', path: '/api/synthetic', body: payload });
  assert.equal(response.status, 201);
  assert.deepEqual(response.body, payload);
  assert.equal(response.headers['x-synthetic-result'], 'ok');
});

test('connection-nominated and proxy headers are removed and forwarded identity is fixed', async (t) => {
  let received;
  const { port } = await fixture(t, (req, res) => { received = req.headers; res.end('ok'); });
  await request(port, {
    headers: {
      connection: 'close, X-Remove-Me', 'x-remove-me': 'unsafe',
      'proxy-authorization': 'Bearer synthetic-private', 'proxy-connection': 'keep-alive',
      forwarded: 'for=attacker;host=attacker.invalid;proto=https',
      'x-forwarded-host': 'attacker.invalid', 'x-forwarded-proto': 'https',
      'x-forwarded-port': '443', 'x-forwarded-for': '203.0.113.10',
    },
  });
  assert.equal(received['x-remove-me'], undefined);
  assert.equal(received['proxy-authorization'], undefined);
  assert.equal(received['proxy-connection'], undefined);
  assert.equal(received['x-forwarded-host'], '127.0.0.1:3305');
  assert.equal(received['x-forwarded-proto'], 'http');
  assert.equal(received['x-forwarded-port'], '3305');
  assert.ok(!String(received.forwarded).includes('attacker'));
  assert.ok(!String(received['x-forwarded-for']).includes('203.0.113.10'));
});

for (const path of ['http://attacker.invalid/api', '//attacker.invalid/api', '/api\\escape']) {
  test(`unsafe target is rejected before contacting upstream: ${path}`, async (t) => {
    const { port, calls } = await fixture(t, (_req, res) => res.end('unexpected'));
    const response = await request(port, { path });
    assert.equal(response.status, 400);
    assert.equal(calls.length, 0);
  });
}

for (const [label, input] of [
  ['CONNECT', 'CONNECT attacker.invalid:443 HTTP/1.1\r\nHost: attacker.invalid\r\nConnection: close\r\n\r\n'],
  ['Upgrade', 'GET /api/health/ready HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'],
]) {
  test(`${label} is rejected without upstream access`, async (t) => {
    const { port, calls } = await fixture(t, (_req, res) => res.end('unexpected'));
    const output = await rawRequest(port, input);
    assert.match(output, /^HTTP\/1\.1 405 /);
    assert.equal(calls.length, 0);
  });
}

test('upstream failures return a generic 502 without secrets', async (t) => {
  const proxy = createAcceptanceProxy(() => {
    const upstreamRequest = new PassThrough();
    upstreamRequest.setTimeout = () => upstreamRequest;
    process.nextTick(() => upstreamRequest.destroy(new Error('ENOTFOUND secret-token-DO-NOT-EXPOSE')));
    return upstreamRequest;
  });
  const port = await listen(proxy);
  cleanup(t, proxy);
  const response = await request(port);
  assert.equal(response.status, 502);
  assert.doesNotMatch(response.body.toString(), /ENOTFOUND|secret-token|DO-NOT-EXPOSE/);
});

test('body larger than 2 MiB is rejected', async (t) => {
  const { port } = await fixture(t, (req, res) => { req.resume(); req.on('end', () => res.end('unexpected')); });
  const response = await request(port, { method: 'POST', body: Buffer.alloc(2 * 1024 * 1024 + 1, 97) });
  assert.equal(response.status, 413);
});

test('body at the 2 MiB limit is accepted without truncation', async (t) => {
  let receivedBytes = 0;
  const { port } = await fixture(t, (req, res) => {
    req.on('data', (chunk) => { receivedBytes += chunk.length; });
    req.on('end', () => res.end(String(receivedBytes)));
  });
  const response = await request(port, { method: 'POST', body: Buffer.alloc(2 * 1024 * 1024, 97) });
  assert.equal(response.status, 200);
  assert.equal(response.body.toString(), String(2 * 1024 * 1024));
});

test('response hop-by-hop and connection-nominated headers are removed', async (t) => {
  const { port } = await fixture(t, (_req, res) => {
    res.writeHead(200, {
      connection: 'close, X-Upstream-Private', 'x-upstream-private': 'hidden',
      'proxy-authenticate': 'Basic realm="private"', 'keep-alive': 'timeout=600',
      trailer: 'X-Discard', 'x-preserved': 'visible',
    });
    res.end('ok');
  });
  const response = await request(port);
  assert.equal(response.headers['x-upstream-private'], undefined);
  assert.equal(response.headers['proxy-authenticate'], undefined);
  assert.equal(response.headers['keep-alive'], undefined);
  assert.equal(response.headers.trailer, undefined);
  assert.equal(response.headers['x-preserved'], 'visible');
});

test('environment variables cannot override the fixed upstream', async (t) => {
  const names = ['UPSTREAM_URL', 'UPSTREAM_HOST', 'UPSTREAM_PORT', 'HTTP_PROXY', 'HTTPS_PROXY'];
  const original = new Map(names.map((name) => [name, process.env[name]]));
  for (const name of names) process.env[name] = 'http://attacker.invalid:4444';
  t.after(() => {
    for (const [name, value] of original) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  const { port, calls } = await fixture(t, (_req, res) => res.end('ok'));
  assert.equal((await request(port)).status, 200);
  assert.equal(calls[0].hostname, 'app');
  assert.equal(calls[0].port, 3000);
});
