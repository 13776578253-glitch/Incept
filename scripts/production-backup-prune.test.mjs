import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pruneServerBackups } from './production-backup-prune.mjs';

async function mkDaily(root, name, createdAt) {
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({
    version: 1,
    createdAt,
    sha256: { 'database.dump': '0'.repeat(64), 'data.tar.gz': '0'.repeat(64) },
  }));
}

test('pruneServerBackups keeps newest N daily backups and never touches release rollback directories', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'incept-prune-test-'));
  try {
    const names = [
      ['2026-11-22T19-00-00.000Z-11111111-1111-4111-8111-111111111111', '2026-11-22T19:00:00.000Z'],
      ['2026-11-23T19-00-00.000Z-22222222-2222-4222-8222-222222222222', '2026-11-23T19:00:00.000Z'],
      ['2026-11-24T19-00-00.000Z-33333333-3333-4333-8333-333333333333', '2026-11-24T19:00:00.000Z'],
      ['2026-11-25T19-00-00.000Z-44444444-4444-4444-8444-444444444444', '2026-11-25T19:00:00.000Z'],
      ['2026-11-26T19-00-00.000Z-55555555-5555-4555-8555-555555555555', '2026-11-26T19:00:00.000Z'],
    ];
    for (const [name, createdAt] of names) await mkDaily(root, name, createdAt);
    await fs.mkdir(path.join(root, 'release-wave2-20261126-20261126T162506Z'), { recursive: true });
    await fs.writeFile(path.join(root, 'release-wave2-20261126-20261126T162506Z', 'marker.txt'), 'keep');

    const result = await pruneServerBackups(root, { keep: 3 });
    assert.deepEqual(result.kept, [names[4][0], names[3][0], names[2][0]]);
    assert.deepEqual(result.removed, [names[1][0], names[0][0]]);
    assert.equal(await fs.readFile(path.join(root, 'release-wave2-20261126-20261126T162506Z', 'marker.txt'), 'utf8'), 'keep');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
