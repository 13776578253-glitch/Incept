import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { notifyProbe } from './production-alert.mjs';

test('deduplicates failures, reports recovery and retains one retry event identity without private diagnostics', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'incept-alert-test-'));
  try {
    const configuration = { INCEPT_ALERT_WEBHOOK_URL: 'https://receiver.example', INCEPT_MONITOR_STATE_FILE: path.join(directory, 'state.json') };
    const events = []; let fail = false;
    const receiver = async (_url, request) => { events.push({ body: JSON.parse(request.body), key: request.headers['Idempotency-Key'] }); return new Response(null, { status: fail ? 503 : 204 }); };
    await notifyProbe(true, null, configuration, receiver);
    assert.equal(events.length, 0);
    await notifyProbe(false, 'health', configuration, receiver);
    await notifyProbe(false, 'health', configuration, receiver);
    assert.equal(events.length, 1);
    await notifyProbe(true, null, configuration, receiver);
    assert.equal(events[1].body.status, 'recovered');
    fail = true;
    await assert.rejects(notifyProbe(false, 'backup', configuration, receiver));
    fail = false;
    await notifyProbe(false, 'backup', configuration, receiver);
    assert.equal(events[2].key, events[3].key);
    assert.deepEqual(Object.keys(events[3].body).sort(), ['check', 'eventId', 'occurredAt', 'service', 'status']);
    const state = JSON.parse(await fs.readFile(configuration.INCEPT_MONITOR_STATE_FILE));
    assert.equal(state.pending, undefined);
    fail = true;
    await assert.rejects(notifyProbe(true, null, configuration, receiver));
    fail = false;
    await notifyProbe(true, null, configuration, receiver);
    assert.equal(events[4].key, events[5].key);
  } finally {
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.join(path.resolve(os.tmpdir()), 'incept-alert-test-')));
    await fs.rm(resolved, { recursive: true, force: true });
  }
});
