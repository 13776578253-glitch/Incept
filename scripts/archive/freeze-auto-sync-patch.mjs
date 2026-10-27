// Freeze local patch artifacts only. Never installs a state or contacts production.
import assert from 'node:assert/strict';
import { createReadStream, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

const read = file => JSON.parse(readFileSync(file, 'utf8'));
async function sha(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
const root = resolve('output/auto-sync-patch-2026-10-20');
assert(!existsSync(join(root, 'PATCH-MANIFEST.json')), 'PATCH_ALREADY_FROZEN');
const appPath = 'output/release-app-build-auto-refresh-20261020.json';
const agentPath = 'output/release-agent-build-2026-10-20-auto-sync-final.json';
const candidatePath = 'output/auto-sync-candidate-2026-10-20.json';
const app = read(appPath), agent = read(agentPath), candidate = read(candidatePath);
assert.equal(app.status, 'passed'); assert.equal(agent.status, 'passed');
assert.equal(candidate.status, 'prepared-not-started');
assert.equal(candidate.protectedInputsUnchanged, true);
assert.equal(candidate.formalStateModified, false);
assert.equal(candidate.agentStarted, false);
assert.equal(candidate.counts.tokens, 4558021501);
assert.equal(candidate.counts.archivedReviewRecords, 72);
for (const input of agent.source.buildInputs) assert.equal(await sha(input.path), input.sha256, 'AGENT_SOURCE_CHANGED');
const artifacts = [];
async function add(file, kind, expected) {
  const actual = await sha(file);
  if (expected) assert.equal(actual, expected, 'ARTIFACT_CHANGED');
  artifacts.push({ path: resolve(file), kind, bytes: statSync(file).size, sha256: actual });
}
await add(app.archive.path, 'app-image', app.archive.sha256);
await add(agent.zip.path, 'windows-agent', agent.zip.sha256);
for (const file of candidate.artifacts) await add(join(candidate.candidateDirectory, file.path), 'private-candidate-and-audit', file.sha256);
await add(join(candidate.candidateDirectory, 'CANDIDATE-MANIFEST.json'), 'private-candidate-manifest');
for (const file of [appPath, agentPath, candidatePath, 'output/auto-refresh-targeted-validation-20261020.json',
  'scripts/archive/prepare-auto-sync-candidate.mjs', 'scripts/archive/prepare-auto-sync-candidate.test.mjs',
  'scripts/archive/freeze-auto-sync-patch.mjs']) await add(file, 'local-evidence-and-tools');
const fixed = read('output/release-clean-candidate-2026-10-20.json');
const snapshot = fixed.files.find(file => file.file === 'v4-release.db');
await add(join(fixed.candidateDirectory, snapshot.file), 'unchanged-frozen-snapshot', snapshot.sha256);
mkdirSync(root, { recursive: true });
const manifest = { format: 'incept-v4-auto-sync-patch/1', frozenAt: new Date().toISOString(),
  status: 'awaiting_separate_app_and_agent_authorization', app: { image: app.image, identity: app.identity },
  agent: { zip: agent.zip.path, sha256: agent.zip.sha256 }, candidateEvidence: resolve(candidatePath),
  fixedSnapshot: { scopes: 362, receipts: 362, tokens: 4558021501, revision: 387, sha256: snapshot.sha256 },
  artifacts, productionModified: false, formalStateModified: false, formalAgentStarted: false,
  approvalRequests: ['App image replacement preserving current live database and routes', 'Back up formal state; install verified candidate and Agent; start and enable current-user logon task'] };
const file = join(root, 'PATCH-MANIFEST.json');
writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
const manifestSha256 = await sha(file);
writeFileSync(join(root, 'SHA256SUMS'), [...artifacts.map(item => `${item.sha256}  ${item.path}`), `${manifestSha256}  ${file}`].join('\n') + '\n', { flag: 'wx' });
console.log(JSON.stringify({ manifest: file, sha256: manifestSha256, artifacts: artifacts.length }));
