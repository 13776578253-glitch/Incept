import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(process.argv[2] || join(root, 'output/release-candidate-2026-10-20/agent-final'));
const reportPath = resolve(process.argv[3] || join(root, 'output/release-agent-build-2026-10-20.json'));
if (process.platform !== 'win32') throw Error('WINDOWS_REQUIRED');
if (existsSync(destination) || existsSync(reportPath)) throw Error('FROZEN_OUTPUT_EXISTS');
const sha = data => createHash('sha256').update(data).digest('hex');
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, windowsHide: true, encoding: 'utf8' });
  if (result.status !== 0) throw Error(`${command} FAILED: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
};
function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : [path];
  });
}
const git = (...args) => run('git', ['-c', 'core.fsmonitor=false', ...args]);
const inputPaths = [
  ...filesIn(join(root, 'apps/sync-agent/src')),
  ...filesIn(join(root, 'packages/dashboard/src')),
  ...filesIn(join(root, 'apps/sync-agent/windows')),
  join(root, 'apps/sync-agent/tools/build.mjs'),
  join(root, 'apps/sync-agent/README.md'),
  join(root, 'apps/sync-agent/package.json'),
  join(root, 'pnpm-lock.yaml'),
];
const inputs = () => inputPaths.map(path => ({ path: relative(root, path).replaceAll('\\', '/'), sha256: sha(readFileSync(path)) })).sort((a, b) => a.path.localeCompare(b.path));
const sourceInputs = inputs();
const source = { head: git('rev-parse', 'HEAD'), branch: git('branch', '--show-current'), dirty: !!git('status', '--porcelain'), status: git('status', '--porcelain').split('\n'), buildInputs: sourceInputs, buildInputManifestSha256: sha(JSON.stringify(sourceInputs)) };
const startedAt = new Date().toISOString();
run(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'apps/sync-agent/tsconfig.json']);
const buildOutput = run(process.execPath, ['apps/sync-agent/tools/build.mjs']);
if (sha(JSON.stringify(inputs())) !== source.buildInputManifestSha256) throw Error('SOURCE_CHANGED_DURING_BUILD');
const staging = join(destination, 'incept-sync-agent-win-node24');
mkdirSync(join(staging, 'dist'), { recursive: true });
mkdirSync(join(staging, 'windows'), { recursive: true });
for (const name of ['agent.mjs', 'collect-worker.mjs']) copyFileSync(join(root, 'apps/sync-agent/dist', name), join(staging, 'dist', name));
for (const name of ['Bind.ps1', 'Common.ps1', 'Install.ps1', 'Invoke-Agent.ps1', 'Start.ps1', 'Stop.ps1', 'Uninstall.ps1']) copyFileSync(join(root, 'apps/sync-agent/windows', name), join(staging, 'windows', name));
copyFileSync(join(root, 'apps/sync-agent/README.md'), join(staging, 'README.md'));
const payloadFiles = filesIn(staging).map(path => ({ path: relative(staging, path).replaceAll('\\', '/'), bytes: readFileSync(path).length, sha256: sha(readFileSync(path)) })).sort((a, b) => a.path.localeCompare(b.path));
const manifest = { format: 'incept-windows-agent-candidate/1', createdAt: new Date().toISOString(), source, runtime: { builtWith: process.version, required: 'Node.js >=24.15.0 <25 on Windows', runtimeBundled: false }, payloadFiles, automaticStart: false, credentialsIncluded: false, stateIncluded: false };
writeFileSync(join(staging, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
const zipPath = join(destination, 'incept-sync-agent-win-node24.zip');
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const archiveScript = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory(${quote(staging)},${quote(zipPath)},[System.IO.Compression.CompressionLevel]::Optimal,$true); $archive=[System.IO.Compression.ZipFile]::OpenRead(${quote(zipPath)}); try { @($archive.Entries | Where-Object { $_.Name } | ForEach-Object { $stream=$_.Open(); try { $hash=[System.Security.Cryptography.SHA256]::Create(); [pscustomobject]@{path=$_.FullName.Replace('\\','/');bytes=$_.Length;sha256=([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-','').ToLowerInvariant()} } finally { $stream.Dispose() } }) | ConvertTo-Json -Depth 5 -Compress } finally { $archive.Dispose() }`;
const entries = JSON.parse(run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(archiveScript, 'utf16le').toString('base64')]));
const expectedFiles = filesIn(staging).map(path => ({ path: 'incept-sync-agent-win-node24/' + relative(staging, path).replaceAll('\\', '/'), bytes: readFileSync(path).length, sha256: sha(readFileSync(path)) }));
if (entries.length !== expectedFiles.length || expectedFiles.some(file => !entries.some(entry => entry.path === file.path && entry.bytes === file.bytes && entry.sha256 === file.sha256))) throw Error('ZIP_CONTENT_MISMATCH');
const report = { status: 'passed', startedAt, completedAt: new Date().toISOString(), source, runtime: manifest.runtime, typecheck: 'passed', buildOutput, zip: { path: zipPath, bytes: readFileSync(zipPath).length, sha256: sha(readFileSync(zipPath)), entries }, candidateManifest: join(staging, 'release-manifest.json'), oldPackagesPreserved: true, agentStarted: false, formalStateModified: false };
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
writeFileSync(join(destination, 'SHA256SUMS'), `${report.zip.sha256}  incept-sync-agent-win-node24.zip\n`, { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, reportPath, zip: report.zip.path, sha256: report.zip.sha256, files: entries.length }));
