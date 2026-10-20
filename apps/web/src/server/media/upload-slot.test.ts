import { describe, expect, it } from 'vitest';
import { withUploadSlot } from './upload-slot';

describe('heavy upload admission', () => {
  it('rejects a concurrent body reader and releases the slot after completion', async () => {
    let finish!: (response: Response) => void;
    const first = withUploadSlot(() => new Promise<Response>(resolve => { finish = resolve; }));
    let secondRead = false;
    const rejected = await withUploadSlot(async () => { secondRead = true; return new Response(); });
    expect(rejected.status).toBe(429);
    expect(rejected.headers.get('Retry-After')).toBe('5');
    expect(secondRead).toBe(false);
    finish(new Response(null, { status: 201 }));
    expect((await first).status).toBe(201);
    expect((await withUploadSlot(async () => new Response())).status).toBe(200);
  });
  it('releases admission after an aborted or failed upload', async () => {
    await expect(withUploadSlot(async () => { throw new Error('Body stream aborted'); })).rejects.toThrow('Body stream aborted');
    expect((await withUploadSlot(async () => new Response())).status).toBe(200);
  });
});
