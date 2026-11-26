import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('./', import.meta.url));
const root = resolve(dir, '../../..');
const files = readdirSync(dir);
const read = name => readFileSync(resolve(dir, name), 'utf8');
const load = name => JSON.parse(read(name));
const metricDictionary = load('metrics-dictionary.json');
const capabilityMatrix = load('capability-matrix.json');
const samples = load('api-samples.json');
const metricIds = new Set(metricDictionary.metrics.map(item => item.id));
const capabilityIds = new Set(capabilityMatrix.capabilities.map(item => item.id));

assert.equal(metricIds.size, metricDictionary.metrics.length);
assert.equal(capabilityIds.size, capabilityMatrix.capabilities.length);
assert.equal(metricDictionary.revision, capabilityMatrix.revision);
assert.equal(samples.revision, capabilityMatrix.revision);

const lineCount = path => readFileSync(path, 'utf8').split(/\r?\n/).length;
const headingAnchor = heading => heading.toLowerCase().replace(/[^\p{L}\p{N}_\- ]/gu, '').replaceAll(' ', '-');
const references = [];
for (const file of files) {
  const text = read(file);
  assert(text.endsWith('\n'), file + ' must end in a newline');
  assert(!/[^\S\r\n]+$/m.test(text), file + ' has trailing whitespace');
  if (!file.endsWith('.md')) continue;
  for (const match of text.matchAll(/\]\((?!https?:)([^\s)]+)\)/g)) {
    const [path, anchor] = match[1].split('#');
    const target = resolve(dir, path || file);
    if (!existsSync(target)) references.push(file + ' -> ' + match[1]);
    else if (/^L\d+/.test(anchor ?? '')) {
      const lastLine = Math.max(...anchor.match(/\d+/g).map(Number));
      if (lastLine > lineCount(target)) references.push(file + ' -> ' + match[1]);
    } else if (anchor && target.endsWith('.md')) {
      const headings = readFileSync(target, 'utf8').matchAll(/^#+\s+([^\r\n]+)$/gm);
      if (![...headings].some(heading => headingAnchor(heading[1]) === decodeURIComponent(anchor))) {
        references.push(file + ' -> ' + match[1]);
      }
    }
  }
}
for (const metric of metricDictionary.metrics) {
  assert(read('03-metrics-dictionary.md').includes(metric.id), metric.id + ' missing from Markdown');
  for (const evidence of metric.evidence) {
    const target = resolve(root, evidence.path);
    if (!existsSync(target) || evidence.endLine > lineCount(target)) {
      references.push(metric.id + ' -> ' + evidence.path + ':' + evidence.endLine);
    }
  }
}
for (const row of capabilityMatrix.capabilities) {
  assert(read('07-data-capability-matrix.md').includes(row.id), row.id + ' missing from Markdown');
  assert(row.metricIds.every(id => metricIds.has(id)), row.id + ' references an unknown metric');
  assert(/^L[0-4]$/.test(row.level), row.id + ' has an invalid change level');
}
assert.deepEqual(references, [], 'Broken relative links or source ranges');

const { usageGuest: usage, usageDetails, billingOwner: billing, proposedDayQuality } = samples.fixtures;
const fields = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheCreationTokens', 'reasoningTokens'];
const groups = [usage.daily, usage.monthly, usage.models, usage.sources, usageDetails.projects, usageDetails.sessions];
const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
for (const row of [...groups.flat(), usage.totals, samples.realUsageExcerpt.totals]) {
  assert.equal(fields.reduce((total, key) => total + row[key], 0), row.totalTokens);
}
for (const rows of groups) {
  for (const key of [...fields, 'totalTokens']) assert.equal(sum(rows, key), usage.totals[key]);
}
assert.equal(usage.projects.length + usage.sessions.length, 0);
assert.equal(usageDetails.sessions.length, usage.totals.sessionCount);
assert.equal(billing.estimatedTokens + billing.unpricedTokens + billing.excludedTokens, billing.tokens);
assert(billing.revision < billing.liveRevision, 'Expected a stale Billing fixture');
const fixedUsd = value => BigInt(value.split('.')[0]) * 1_000_000n
  + BigInt((value.split('.')[1] ?? '').padEnd(6, '0'));
for (const rows of [billing.breakdown.days, billing.breakdown.models]) {
  assert.equal(rows.reduce((total, row) => total + fixedUsd(row.estimatedCostUsd), 0n), fixedUsd(billing.estimatedCostUsd));
}
assert.equal(proposedDayQuality.hourAttributedTokens + proposedDayQuality.hourUnattributedTokens, proposedDayQuality.knownTokens);
console.log(`Verified ${metricIds.size} metrics, ${capabilityIds.size} capabilities, relative source links and sample reconciliations.`);
