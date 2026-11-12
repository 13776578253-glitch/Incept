const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID } = require('node:crypto');
const { channel } = require('node:diagnostics_channel');
const { performance } = require('node:perf_hooks');

const rate = Math.min(1, Number(process.env.INCEPT_NAV_TRACE_SAMPLE_RATE));
const context = new AsyncLocalStorage();
const round = value => Math.round(value * 100) / 100;

function routeGroup(pathname) {
  const match = /^\/(?:en|zh)\/(docs|about|roadmap|dashboard|settings)(\/[^?]*)?$/.exec(pathname);
  if (!match) return pathname === '/api/dashboard/usage' ? 'dashboard-usage' : null;
  const [, section, tail] = match;
  if (section === 'docs') {
    if (!tail) return 'docs-index';
    if (tail.startsWith('/series/')) return 'docs-series';
    if (/^\/[^/]+$/.test(tail) && !['/reference', '/archive'].includes(tail)) return 'docs-article';
  }
  return tail ? null : section;
}

globalThis[Symbol.for('incept.navigationTiming')] = async (phase, work) => {
  const sample = context.getStore();
  if (!sample) return work();
  const start = performance.now();
  try {
    return await work();
  } finally {
    const entry = sample.phases[phase] ??= { count: 0, ms: 0 };
    entry.count++;
    entry.ms += performance.now() - start;
  }
};

channel('http.server.request.start').subscribe(({ request, response }) => {
  const path = request.url?.split('?', 1)[0];
  const route = request.method === 'GET' && path ? routeGroup(path) : null;
  if (!route || (route !== 'dashboard-usage' && request.headers.rsc !== '1') || !(Math.random() < rate)) {
    if (context.getStore()) context.enterWith(undefined);
    return;
  }

  const forwarded = request.headers['x-request-id'];
  const requestId = typeof forwarded === 'string' && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(forwarded)
    ? forwarded : randomUUID();
  const started = performance.now();
  const phases = Object.create(null);
  context.enterWith({ phases });
  response.setHeader('X-Request-ID', requestId);

  let headersAt;
  let firstWrite;
  let lastWrite;
  let bytes = 0;
  const { writeHead, write, end } = response;
  const elapsed = () => round(performance.now() - started);
  function recordChunk(chunk, encoding) {
    if (typeof chunk === 'string') bytes += Buffer.byteLength(chunk, typeof encoding === 'string' ? encoding : undefined);
    else if (chunk instanceof Uint8Array) bytes += chunk.byteLength;
    else return;
    if (chunk.length === 0) return;
    lastWrite = elapsed();
    firstWrite ??= lastWrite;
  }

  response.writeHead = function (...args) {
    headersAt ??= elapsed();
    return writeHead.apply(this, args);
  };
  response.write = function (...args) {
    recordChunk(...args);
    return write.apply(this, args);
  };
  response.end = function (...args) {
    recordChunk(...args);
    return end.apply(this, args);
  };
  response.once('close', () => {
    for (const phase of Object.values(phases)) phase.ms = round(phase.ms);
    console.log(JSON.stringify({
      event: 'navigation_timing',
      requestId,
      route,
      prefetch: request.headers['next-router-prefetch'] === '1',
      status: response.statusCode,
      finished: response.writableFinished,
      receivedAt: Math.round(performance.timeOrigin + started),
      headersMs: headersAt ?? null,
      firstWriteMs: firstWrite ?? null,
      lastWriteMs: lastWrite ?? null,
      totalMs: elapsed(),
      bytes,
      phases,
    }));
  });
});
