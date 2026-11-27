import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { pruneLocalBackups, verifyBackupDirectory } from './production-backup-pull.mjs';

async function createSnapshot(root, name, createdAt, payloadSize) {
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  const files = {
    'database.dump': Buffer.alloc(Math.max(16, Math.floor(payloadSize / 2)), 0x41),
    'data.tar.gz': Buffer.alloc(Math.max(16, Math.ceil(payloadSize / 2)), 0x42),
    'auth-key.json': Buffer.from(JSON.stringify({ INCEPT_AUTH_ENCRYPTION_KEY: 'a'.repeat(64) })),
  };
  const sha256 = {};
  for (const [fileName, bytes] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, fileName), bytes);
    sha256[fileName] = createHash('sha256').update(bytes).digest('hex');
  }
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({
    version: 1,
    createdAt,
    image: 'incept-v4-release:test',
    sha256,
  }, null, 2));
  return dir;
}

test('verifyBackupDirectory accepts intact snapshots and rejects tampered payloads', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'incept-pull-test-'));
  try {
    const dir = await createSnapshot(root, '2026-11-26T19-01-18.673Z-0aeae3a2-4436-4c21-a650-41d6bf435490', '2026-11-26T19:01:18.673Z', 1024);
    const ok = await verifyBackupDirectory(dir);
    assert.equal(ok.files.length, 3);
    assert.ok(ok.totalBytes > 1024);

    await fs.writeFile(path.join(dir, 'data.tar.gz'), Buffer.from('corrupted'));
    await assert.rejects(() => verifyBackupDirectory(dir), /CHECKSUM_MISMATCH:data\.tar\.gz/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('pruneLocalBackups enforces size cap while preserving at least minKeep newest snapshots', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'incept-pull-prune-'));
  try {
    const names = [
      ['2026-11-01T19-00-00.000Z-11111111-1111-4111-8111-111111111111', '2026-11-01T19:00:00.000Z'],
      ['2026-11-08T19-00-00.000Z-22222222-2222-4222-8222-222222222222', '2026-11-08T19:00:00.000Z'],
      ['2026-11-15T19-00-00.000Z-33333333-3333-4333-8333-333333333333', '2026-11-15T19:00:00.000Z'],
      ['2026-11-22T19-00-00.000Z-44444444-4444-4444-8444-444444444444', '2026-11-22T19:00:00.000Z'],
      ['2026-11-29T19-00-00.000Z-55555555-5555-4555-8555-555555555555', '2026-11-29T19:00:00.000Z'],
    ];
    for (const [name, createdAt] of names) {
      await createSnapshot(root, name, createdAt, 4000);
    }
    // Non-snapshot folder must never be deleted.
    await fs.mkdir(path.join(root, 'manual-notes'), { recursive: true });
    await fs.writeFile(path.join(root, 'manual-notes', 'readme.txt'), 'keep');

    const result = await pruneLocalBackups(root, { maxBytes: 10000, minKeep: 3 });
    assert.equal(result.keptCount, 3);
    assert.deepEqual(result.removed.map((item) => item.name), [names[0][0], names[1][0]]);
    assert.equal((await fs.readFile(path.join(root, 'manual-notes', 'readme.txt'), 'utf8')), 'keep');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
