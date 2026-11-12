const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');

const base = new URL(process.argv[2]);
const output = process.argv[3];
const rounds = Number(process.argv[4] || 5);
const tls = base.protocol === 'https:';
const client = tls ? https : http;
const agent = new client.Agent({ keepAlive: true });
const now = () => performance.now();
const rounded = ms => Math.round(ms * 100) / 100;

function request(range, acceptEncoding, validator) {
  const start = now();
  return new Promise((resolve, reject) => {
    const req = client.get(new URL('/api/dashboard/usage?range=' + range, base), {
      agent,
      ...(tls && base.hostname === 'localhost' ? { rejectUnauthorized: false } : {}),
      headers: {
        'Accept-Encoding': acceptEncoding,
        ...(validator ? { 'If-None-Match': validator } : {}),
      },
    }, res => {
      const ttfb = rounded(now() - start);
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => {
        try {
          const total = rounded(now() - start);
          const encoded = Buffer.concat(chunks);
          const encoding = res.headers['content-encoding'] ?? 'identity';
          const decoded = encoding === 'gzip' ? gunzipSync(encoded) : encoded;
          const data = decoded.length && res.statusCode === 200 ? JSON.parse(decoded) : null;
          resolve({
            range, acceptEncoding, sentValidator: Boolean(validator), status: res.statusCode, encoding, ttfb, total,
            encoded: encoded.length, decoded: decoded.length, etag: res.headers.etag ?? null,
            vary: res.headers.vary ?? null, cache: res.headers['cache-control'] ?? null,
            role: res.headers['x-incept-dashboard-role'] ?? null, id: res.headers['x-request-id'] ?? null,
            checkedAt: data?.checkedAt ?? null, hash: createHash('sha256').update(decoded).digest('hex'),
          });
        } catch (error) { reject(error); }
      });
    });
    req.setTimeout(30000, () => req.destroy(new Error('Dashboard request timed out')));
    req.on('error', reject);
  });
}

(async () => {
  const rows = [];
  const errors = [];
  try {
    for (const range of ['30d', 'all']) {
      for (let round = 1; round <= rounds; round++) {
        try {
          const identity = await request(range, 'identity');
          const gzip = await request(range, 'gzip');
          rows.push(identity, gzip);
          assert.equal(identity.status, 200);
          assert.equal(gzip.status, 200);
          if (identity.checkedAt === gzip.checkedAt) assert.equal(identity.hash, gzip.hash);
          if (identity.etag) {
            const conditional = await request(range, 'gzip', identity.etag);
            rows.push(conditional);
            if (identity.etag === (gzip.etag?.replace(/-gzip"$/, '"') ?? gzip.etag)) {
              assert.equal(conditional.status, 304);
              assert.equal(conditional.encoded, 0);
            }
          }
        } catch (error) {
          errors.push({ range, round, error: error.message });
        }
      }
    }
  } finally {
    agent.destroy();
    fs.writeFileSync(output, JSON.stringify({ base: base.origin, rows, errors }, null, 2));
  }
  for (const range of ['30d', 'all']) {
    for (const group of ['identity', 'gzip', 'conditional']) {
      const selected = rows.filter(row => row.range === range
        && (group === 'conditional' ? row.sentValidator : !row.sentValidator && row.acceptEncoding === group));
      if (!selected.length) continue;
      console.log(range, group, 'n', selected.length, 'status', [...new Set(selected.map(row => row.status))],
        'bytes', [...new Set(selected.map(row => row.encoded))]);
    }
  }
  if (errors.length) {
    console.error(errors);
    process.exitCode = 1;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
