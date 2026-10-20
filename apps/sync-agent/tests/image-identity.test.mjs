import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { verifyR5ImageIdentity, classifyR5Digest, R5_IMAGE } from '../dist/library.mjs';

const fixturePath = new URL('./fixtures/r5-image-evidence.json', import.meta.url);
const fixture = () => JSON.parse(readFileSync(fixturePath, 'utf8'));
const identities = [
  ['manifestListDigest', 'manifest-list'],
  ['platformManifestDigest', 'platform-manifest'],
  ['configId', 'image-config'],
];

for (const [key, kind] of identities) test(`r5 runtime ID can identify ${kind}`, () => {
  const evidence = fixture();
  evidence.observed.id = R5_IMAGE[key];
  assert.equal(classifyR5Digest(evidence.observed.id), kind);
  const result = verifyR5ImageIdentity(evidence);
  assert.equal(result.passed, true, JSON.stringify(result.errors));
  assert.equal(result.observedIdKind, kind);
  assert.deepEqual(result.errors, []);
});

for (const id of ['incept-sync-trusted:mvp-r3', `sha256:${'0'.repeat(64)}`]) test(`reject wrong runtime ID ${id}`, () => {
  const evidence = fixture();
  evidence.observed.id = id;
  assert.equal(classifyR5Digest(id), undefined);
  const result = verifyR5ImageIdentity(evidence);
  assert.equal(result.passed, false);
  assert.ok(result.errors.includes('RUNTIME_IMAGE_ID_MISMATCH'));
});

for (const [field, value] of [['os', 'windows'], ['architecture', 'arm64']]) test(`reject wrong ${field}`, () => {
  const evidence = fixture();
  evidence.observed[field] = value;
  const result = verifyR5ImageIdentity(evidence);
  assert.equal(result.passed, false);
  assert.ok(result.errors.includes('IMAGE_PLATFORM_MISMATCH'));
});

test('reject damaged runtime rootfs', () => {
  const evidence = fixture();
  evidence.observed.rootfsDiffIds[0] = `sha256:${'0'.repeat(64)}`;
  const result = verifyR5ImageIdentity(evidence);
  assert.equal(result.passed, false);
  assert.ok(result.errors.includes('RUNTIME_ROOTFS_MISMATCH'));
});

for (const [field, error] of [
  ['indexJson', 'MANIFEST_LIST_DIGEST_MISMATCH'],
  ['manifestJson', 'PLATFORM_MANIFEST_DIGEST_MISMATCH'],
  ['configJson', 'IMAGE_CONFIG_DIGEST_MISMATCH'],
]) test(`reject any raw ${field} byte mutation even when parsed JSON is unchanged`, () => {
  const evidence = fixture();
  evidence[field] += '\n';
  const result = verifyR5ImageIdentity(evidence);
  assert.equal(result.passed, false);
  assert.ok(result.errors.includes(error));
});

test('tag or runtime metadata without the graph is insufficient', () => {
  for (const evidence of [{ tag: 'incept-sync-trusted:mvp-r5' }, { observed: fixture().observed }, null]) {
    assert.deepEqual(verifyR5ImageIdentity(evidence).errors, ['IMAGE_GRAPH_EVIDENCE_REQUIRED']);
    assert.equal(verifyR5ImageIdentity(evidence).passed, false);
  }
});

test('each missing raw graph blob fails closed', () => {
  for (const field of ['indexJson', 'manifestJson', 'configJson']) {
    const evidence = fixture();
    delete evidence[field];
    assert.equal(verifyR5ImageIdentity(evidence).passed, false);
  }
});

test('actual identity CLI exits 0 for r5 and 2 for an identity mismatch', () => {
  const directory = mkdtempSync(join(tmpdir(), 'incept-r5-identity-'));
  try {
    const evidenceFile = join(directory, 'evidence.json');
    const script = fileURLToPath(new URL('../../../scripts/check-r5-image.mjs', import.meta.url));
    const evidence = fixture();
    writeFileSync(evidenceFile, JSON.stringify(evidence));
    const invoke = () => spawnSync(process.execPath, [script, evidenceFile], { encoding: 'utf8' });
    const positive = invoke();
    assert.equal(positive.status, 0, positive.stderr);
    assert.equal(JSON.parse(positive.stdout).passed, true);
    evidence.observed.id = `sha256:${'0'.repeat(64)}`;
    writeFileSync(evidenceFile, JSON.stringify(evidence));
    const negative = invoke();
    assert.equal(negative.status, 2, negative.stderr);
    assert.equal(JSON.parse(negative.stdout).passed, false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
