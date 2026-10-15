import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';

function run(command, args, input, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', value => { output += value; });
    child.stderr.on('data', value => { output += value; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, output }));
    child.stdin.end(input);
  });
}

const helper = ['packages/db/node_modules/tsx/dist/cli.mjs', 'scripts/owner-local.mts', 'prepare'];

test('refuses an unconfirmed reset without disclosing submitted secrets', async () => {
  const secret = 'test-only-do-not-print-password';
  const result = await run(process.execPath, helper, JSON.stringify({ password: secret }));
  assert.equal(result.code, 1);
  assert.ok(!result.output.includes(secret));
});

test('refuses remote and wrong local databases before touching accounts', async () => {
  for (const target of ['postgresql://localhost/incept_test', 'postgresql://example.invalid/incept']) {
    const result = await run(process.execPath, helper, JSON.stringify({ confirm: true, password: 'test-only-do-not-print-password' }), { DATABASE_URL: target });
    assert.equal(result.code, 1);
    assert.ok(!result.output.includes('test-only-do-not-print-password'));
    assert.ok(!result.output.includes(target));
  }
});

test('Windows helper refuses a reset without the explicit switch', { skip: process.platform !== 'win32' }, async () => {
  const result = await run('pwsh', ['-NoProfile', '-File', 'scripts/owner-local.ps1', '-Action', 'Prepare'], '');
  assert.notEqual(result.code, 0);
  assert.match(result.output, /ConfirmReset/);
});

test('Windows helper refuses to send decrypted credentials into redirected output', { skip: process.platform !== 'win32' }, async () => {
  const result = await run('pwsh', ['-NoProfile', '-File', 'scripts/owner-local.ps1', '-Action', 'Show'], '');
  assert.notEqual(result.code, 0);
  assert.match(result.output, /interactive terminal/);
});
