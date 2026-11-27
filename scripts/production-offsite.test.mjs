import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { checkCommand, retentionArgs } from './production-offsite.mjs';

test('rejects incomplete backups before invoking or initializing any repository', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'incept-offsite-test-'));
  try {
    await fs.writeFile(path.join(root, 'password'), 'a1b2c3d4'.repeat(8), { mode: 0o600 });
    await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), sha256: { 'database.dump': '0'.repeat(64), 'data.tar.gz': '0'.repeat(64) } }));
    await fs.writeFile(path.join(root, 'database.dump'), 'incomplete fixture');
    await fs.writeFile(path.join(root, 'data.tar.gz'), 'incomplete fixture');
    await fs.writeFile(path.join(root, 'env'), `RESTIC_REPOSITORY=${path.join(root,'must-not-exist')}\nRESTIC_PASSWORD_FILE=${path.join(root,'password')}\nINCEPT_BACKUP_HOST_ID=test\nINCEPT_RESTIC_BIN=${path.join(root,'not-a-command')}\n`);
    const child = spawn(process.execPath, ['scripts/production-offsite.mjs', '--env-file', path.join(root,'env'), '--backup', root, '--init']);
    let output = ''; child.stdout.on('data', b=>output+=b); child.stderr.on('data',b=>output+=b);
    const code = await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
    assert.equal(code, 1);
    assert.deepEqual(JSON.parse(output.trim()), { event: 'offsite_backup_failed', phase: 'configuration' });
    await assert.rejects(fs.stat(path.join(root, 'must-not-exist')));
    await assert.rejects(fs.stat(path.join(root, 'offsite-receipt.json')));
  } finally {
    const absolute = path.resolve(root);
    assert.ok(absolute.startsWith(path.join(path.resolve(os.tmpdir()),'incept-offsite-test-')));
    await fs.rm(absolute, { recursive: true, force: true });
  }
});

test('checks the independent authentication key before initializing or acknowledging an encrypted backup', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'incept-offsite-test-'));
  try {
    const sha256 = {};
    for (const name of ['database.dump', 'data.tar.gz', 'auth-key.json']) {
      const bytes = Buffer.from(name);
      await fs.writeFile(path.join(root, name), bytes, { mode: 0o600 });
      sha256[name] = createHash('sha256').update(bytes).digest('hex');
    }
    await fs.writeFile(path.join(root, 'auth-key.json'), 'tampered key', { mode: 0o600 });
    await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), sha256 }));
    await fs.writeFile(path.join(root, 'password'), 'a1b2c3d4'.repeat(8), { mode: 0o600 });
    await fs.writeFile(path.join(root, 'env'), `RESTIC_REPOSITORY=${path.join(root, 'must-not-exist')}\nRESTIC_PASSWORD_FILE=${path.join(root, 'password')}\nINCEPT_BACKUP_HOST_ID=test\nINCEPT_RESTIC_BIN=${path.join(root, 'not-a-command')}\n`);
    const child = spawn(process.execPath, ['scripts/production-offsite.mjs', '--env-file', path.join(root, 'env'), '--backup', root, '--init']);
    let output = ''; child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { output += value; });
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    assert.equal(code, 1);
    assert.deepEqual(JSON.parse(output.trim()), { event: 'offsite_backup_failed', phase: 'configuration' });
    await assert.rejects(fs.stat(path.join(root, 'offsite-receipt.json')));
  } finally {
    const absolute = path.resolve(root);
    assert.ok(absolute.startsWith(path.join(path.resolve(os.tmpdir()), 'incept-offsite-test-')));
    await fs.rm(absolute, { recursive: true, force: true });
  }
});

test('checkCommand and retentionArgs avoid full daily read-data and support custom retention', () => {
  assert.deepEqual(checkCommand({}), ['check', '--read-data']);
  assert.deepEqual(checkCommand({ INCEPT_RESTIC_CHECK_MODE: 'metadata' }), ['check']);
  assert.deepEqual(checkCommand({ INCEPT_RESTIC_CHECK_MODE: 'subset', INCEPT_RESTIC_CHECK_SUBSET: '5%' }), ['check', '--read-data-subset=5%']);
  // Sunday UTC -> subset check; Monday UTC -> metadata check
  assert.deepEqual(checkCommand({ INCEPT_RESTIC_CHECK_MODE: 'auto', INCEPT_RESTIC_CHECK_SUBSET: '5%' }, new Date('2026-11-29T03:00:00Z')), ['check', '--read-data-subset=5%']);
  assert.deepEqual(checkCommand({ INCEPT_RESTIC_CHECK_MODE: 'auto', INCEPT_RESTIC_CHECK_SUBSET: '5%' }, new Date('2026-11-30T03:00:00Z')), ['check']);

  assert.deepEqual(
    retentionArgs({ INCEPT_RESTIC_KEEP_DAILY: '30', INCEPT_RESTIC_KEEP_WEEKLY: '12', INCEPT_RESTIC_KEEP_MONTHLY: '24' }, 'prod-1'),
    ['forget', '--host', 'prod-1', '--tag', 'incept-production', '--group-by', 'host', '--keep-daily', '30', '--keep-weekly', '12', '--keep-monthly', '24', '--prune']
  );
  assert.deepEqual(
    retentionArgs({}, 'prod-1'),
    ['forget', '--host', 'prod-1', '--tag', 'incept-production', '--group-by', 'host', '--keep-within', '14d', '--keep-last', '2', '--prune']
  );
});
