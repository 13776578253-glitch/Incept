import { isIP } from 'node:net';

const attempts = new Map<string, { count: number; until: number }>();

// The production reverse proxy replaces forwarding headers; the app port stays private.
export function limitAuthRequest(request: Request, action: 'owner' | 'redeem') {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const address = isIP(forwarded) ? forwarded : 'direct';
  const now = Date.now(), key = `${action}:${address}`;
  for (const [entry, value] of attempts) if (value.until <= now) attempts.delete(entry);
  const previous = attempts.get(key);
  if ((!previous && attempts.size >= 10_000) || (previous && previous.count >= (action === 'owner' ? 10 : 20))) {
    return Response.json({ error: 'Too many attempts. Try again later.' }, {
      status: 429, headers: { 'Retry-After': '600', 'Cache-Control': 'no-store' },
    });
  }
  attempts.set(key, { count: (previous?.count ?? 0) + 1, until: previous?.until ?? now + 600_000 });
  return null;
}

export async function readSmallJson(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.body || Number(request.headers.get('content-length')) > 4096) return null;
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch { return null; }
  finally { reader.releaseLock(); }
}
