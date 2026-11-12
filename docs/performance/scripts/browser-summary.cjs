const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const round = x => Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null;
const delta = (a, b) => Number.isFinite(a) && Number.isFinite(b) ? round(b - a) : null;
const traceDelta = (a, b) => Number.isFinite(a) && Number.isFinite(b) ? round((b - a) / 1000) : null;

function quantify(rows, key) {
  const values = rows.map(row => row[key]).filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return null;
  return [values.length, round((values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2),
    values[Math.ceil(values.length * 0.95) - 1], values.at(-1)];
}

function analyze(directory, sample) {
  const id = `${sample.name}-${sample.mode}-${sample.index}`;
  const file = path.join(directory, id + '.json.gz');
  const events = JSON.parse(zlib.gunzipSync(fs.readFileSync(file))).traceEvents;
  const record = sample.records.at(-1);
  const mark = events.find(e => e.name === 'nav-probe-click');
  if (!mark) throw new Error('Missing click marker in ' + file);
  const main = events.filter(e => e.pid === mark.pid && e.tid === mark.tid);
  const event = main.filter(e => e.name === 'EventTiming' && e.args?.data?.type === 'click')
    .sort((a, b) => Math.abs(a.ts - mark.ts) - Math.abs(b.ts - mark.ts))[0];
  const input = event?.ts ?? mark.ts - (record.dispatch - record.click) * 1000;
  const urlEvent = main.find(e => e.name === 'SoftNavigationHeuristics::SameDocumentNavigationCommitted' && e.ts >= input &&
    e.args.context?.URL && new URL(e.args.context.URL).pathname === sample.target);
  const soft = main.find(e => e.name === 'SoftNavigationEmitted' && e.args?.context?.timeOrigin === input &&
    new URL(e.args.context.URL).pathname === sample.target)?.args.context;
  const fallbackEnd = events.find(e => e.name === 'nav-probe-target' && e.ts >= input)?.ts;
  const end = soft?.firstContentfulPaint ?? fallbackEnd;
  const url = soft?.urlChangeTime ?? urlEvent?.args.context.urlChangeTime ??
    (Number.isFinite(record.url) ? input + (record.url - record.click) * 1000 : null);
  const commits = sample.commits.filter(c => c.route === sample.target && c.at >= record.click);
  const commit = commits[0];
  const targetRequests = sample.requests.filter(r => r.route === sample.target && r.search.includes('_rsc='));
  const startRelative = r => r.epoch - record.timeOrigin - record.click;
  const dynamic = targetRequests.filter(r => r.prefetch === null && startRelative(r) >= -1).sort((a, b) => a.start - b.start)[0];
  const navDuration = traceDelta(input, url);
  const items = main.filter(e => e.dur > 0 && e.ts < end && e.ts + e.dur > input);
  const duration = name => end ? round(items.filter(e => e.name === name)
    .reduce((sum, e) => sum + Math.max(0, Math.min(end, e.ts + e.dur) - Math.max(input, e.ts)), 0) / 1000) : null;
  const updateCounters = main.filter(e => e.name === 'UpdateCounters' && e.ts >= input && e.ts <= end)
    .map(e => e.args.data.nodes);
  const long = items.filter(e => e.name === 'RunTask' && e.dur >= 50000);
  const commitTask = main.find(e => e.name === 'RunTask' && e.ts <= url && e.ts + e.dur > url);
  const cachedAssets = sample.assets.filter(a => a[1] === 0 && a[2] > 0);
  const pageAssets = sample.assets.filter(a => a[3] >= record.click);
  return {
    name: sample.name, mode: sample.mode, index: sample.index, source: sample.source, target: sample.target,
    h1: sample.h1, browser: sample.browser, feedback: delta(record.click, record.feedback),
    feedbackKind: record.feedbackKind ?? null, skeleton: delta(record.click, record.skeleton),
    event: event?.args.data.duration ?? null,
    handler: delta(event?.args.data.processingStart, event?.args.data.processingEnd),
    clickURL: navDuration, contentRaf: delta(record.click, record.targetAfterFrame),
    contentFCP: traceDelta(input, soft?.firstContentfulPaint), urlFCP: traceDelta(url, soft?.firstContentfulPaint),
    urlToCommitHook: delta(record.url, commit?.at), commitTask: traceDelta(0, commitTask?.dur),
    actualRender: Number.isFinite(commit?.actualDuration) && commit.actualDuration > 0 ? round(commit.actualDuration) : null,
    clickSend: dynamic ? round(startRelative(dynamic)) : null,
    ttfb: dynamic?.timing ? delta(dynamic.timing.sendEnd, dynamic.timing.receiveHeadersStart) : null,
    body: dynamic ? traceDelta(dynamic.response * 1e6, dynamic.end * 1e6) : null,
    rsc: dynamic ? traceDelta(dynamic.start * 1e6, dynamic.end * 1e6) : null,
    rscCache: dynamic ? Boolean(dynamic.cached || dynamic.disk) : null,
    rscPrefetchBefore: targetRequests.filter(r => r.prefetch !== null && startRelative(r) < 0).length,
    rscPrefetchFinishedBefore: targetRequests.filter(r => r.prefetch !== null && startRelative(r) + 1000 * (r.end - r.start) < 0).length,
    rscHeader: dynamic?.cacheControl ?? null,
    rscEncoded: dynamic?.encoded ?? null,
    layout: duration('Layout'), style: duration('UpdateLayoutTree'), paint: duration('Paint'),
    maxLayout: end ? round(Math.max(0, ...items.filter(e => e.name === 'Layout').map(e => e.dur)) / 1000) : null,
    longCount: end ? long.length : null,
    longMax: end ? round(Math.max(0, ...long.map(e => e.dur)) / 1000) : null,
    firstElements: sample.firstElements, lastElements: record.elements ?? null,
    firstNodes: sample.firstDom.nodes, finalNodes: sample.finalDom.nodes,
    peakNodes: updateCounters.length ? Math.max(sample.firstDom.nodes, ...updateCounters) : null,
    cachedAssets: cachedAssets.length,
    navAssets: pageAssets.length,
    cachedNavAssets: pageAssets.filter(a => a[1] === 0 && a[2] > 0).length,
    firstDocumentTTFB: delta(sample.navigation?.requestStart, sample.navigation?.responseStart),
  };
}

for (const directory of process.argv.slice(2)) {
  const source = path.join(directory, 'samples.jsonl');
  if (!fs.existsSync(source)) continue;
  const rows = fs.readFileSync(source, 'utf8').trim().split('\n').filter(Boolean)
    .map(line => analyze(directory, JSON.parse(line)));
  const groups = {};
  for (const row of rows) (groups[`${row.name}/${row.mode}`] ??= []).push(row);
  const keys = ['feedback', 'skeleton', 'event', 'handler', 'clickURL', 'contentRaf', 'contentFCP', 'urlFCP',
    'urlToCommitHook', 'commitTask', 'actualRender', 'clickSend', 'ttfb', 'body', 'rsc', 'rscEncoded',
    'layout', 'style', 'paint', 'maxLayout', 'longCount', 'longMax', 'firstElements', 'lastElements',
    'firstNodes', 'finalNodes', 'peakNodes', 'cachedAssets', 'navAssets', 'cachedNavAssets', 'firstDocumentTTFB'];
  const summary = Object.fromEntries(Object.entries(groups).map(([key, group]) => [key, {
    n: group.length, rscNetwork: group.filter(r => r.rsc !== null && !r.rscCache).length,
    rscCached: group.filter(r => r.rscCache).length,
    prefetched: group.filter(r => r.rscPrefetchBefore > 0).length,
    prefetchFinished: group.filter(r => r.rscPrefetchFinishedBefore > 0).length,
    ...Object.fromEntries(keys.map(k => [k, quantify(group, k)])),
  }]));
  const errorsFile = path.join(directory, 'errors.jsonl');
  const errors = fs.existsSync(errorsFile)
    ? fs.readFileSync(errorsFile, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
    : [];
  for (const error of errors) {
    const group = summary[`${error.name}/${error.mode}`] ??= { n: 0 };
    group.failures = (group.failures ?? 0) + 1;
  }
  for (const group of Object.values(summary)) {
    group.failures ??= 0;
    group.attempts = group.n + group.failures;
    group.failureRate = group.attempts ? round(group.failures / group.attempts) : 0;
  }
  fs.writeFileSync(path.join(directory, 'summary.json'), JSON.stringify({ summary, rows, errors }, null, 2));
  console.log(directory);
  for (const [key, s] of Object.entries(summary)) console.log(key, s.n,
    'URL', s.clickURL, 'content', s.contentRaf, 'FCP', s.contentFCP, 'RSC', s.rsc, 'TTFB', s.ttfb,
    'layout', s.layout, 'commit task', s.commitTask, 'net/prefetch/cache', [s.rscNetwork, s.prefetchFinished, s.cachedAssets]);
}
