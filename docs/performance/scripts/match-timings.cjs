const fs = require('node:fs');
const path = require('node:path');

const [directory, telemetryPath] = process.argv.slice(2);
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const telemetry = readJson(telemetryPath);
const { rows } = readJson(path.join(directory, 'summary.json'));
const browserSamples = fs.readFileSync(path.join(directory, 'samples.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const proxyById = new Map(telemetry.proxy.map(entry => [entry.request_id, entry]));
const nodeById = new Map(telemetry.node.map(entry => [entry.requestId, entry]));
const results = [];

for (const row of rows) {
  const sample = browserSamples.find(sample => sample.name === row.name && sample.mode === row.mode && sample.index === row.index);
  const click = sample.records.at(-1);
  const request = sample.requests.filter(request => request.route === sample.target && request.prefetch === null
    && request.search.includes('_rsc=') && request.epoch - click.timeOrigin - click.click >= -1)
    .sort((a, b) => a.start - b.start)[0];
  const id = request?.requestId;
  if (!id) continue;
  results.push({
    index: row.index,
    target: row.target,
    id,
    browser: {
      clickToSendMs: row.clickSend, ttfbMs: row.ttfb, bodyMs: row.body, flightMs: row.rsc,
      clickToUrlMs: row.clickURL, clickToContentMs: row.contentRaf, commitTaskMs: row.commitTask, layoutMs: row.layout,
    },
    proxy: proxyById.get(id) ?? null,
    node: nodeById.get(id) ?? null,
  });
}

fs.writeFileSync(path.join(directory, 'matched-timings.json'), JSON.stringify(results, null, 2));
console.log({
  browser: results.length, proxy: results.filter(row => row.proxy).length,
  full: results.filter(row => row.proxy && row.node).length,
});
