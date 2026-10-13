import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { mediaFileResponse } from './file-response';

let directory: string;
const name = `${'a'.repeat(64)}.mp3`;
beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'incept-media-response-')); });
afterEach(async () => {
  if (!path.resolve(directory).startsWith(path.join(path.resolve(os.tmpdir()), 'incept-media-response-'))) throw new Error('Unsafe fixture cleanup');
  await fs.rm(directory, { recursive: true, force: true });
});
it('serves a newly published file immediately and streams ranges without caching', async () => {
  await fs.writeFile(path.join(directory, name), Buffer.from('0123456789'));
  const response = await mediaFileResponse(new Request('http://site/audio', { headers: { Range: 'bytes=2-5' } }), directory, name);
  expect(response.status).toBe(206);
  expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(await response.text()).toBe('2345');
});
it('supports suffixes and HEAD and rejects invalid ranges and traversal', async () => {
  await fs.writeFile(path.join(directory, name), Buffer.from('0123456789'));
  const suffix = await mediaFileResponse(new Request('http://site/audio', { headers: { Range: 'bytes=-2' } }), directory, name);
  expect(await suffix.text()).toBe('89');
  const head = await mediaFileResponse(new Request('http://site/audio', { method: 'HEAD' }), directory, name);
  expect(head.headers.get('content-length')).toBe('10'); expect(await head.text()).toBe('');
  expect((await mediaFileResponse(new Request('http://site/audio', { headers: { Range: 'bytes=20-30' } }), directory, name)).status).toBe(416);
  expect((await mediaFileResponse(new Request('http://site/audio'), directory, '../secret.mp3')).status).toBe(404);
});
