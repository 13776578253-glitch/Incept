import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

const types: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac',
};

export function isMediaFileName(value: string) {
  return /^[a-f0-9]{64}\.(?:png|jpe?g|gif|webp|avif|mp3|wav|flac)$/.test(value);
}

// Stream validated files without buffering whole audio; honor a single HTTP Range.
export async function mediaFileResponse(request: Request, directory: string, fileName: string): Promise<Response> {
  const denied = () => new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  if (!isMediaFileName(fileName)) return denied();
  let file: string, size: number;
  try {
    const root = await fs.realpath(directory);
    file = await fs.realpath(path.join(root, fileName));
    const relative = path.relative(root, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return denied();
    const stats = await fs.stat(file);
    if (!stats.isFile()) return denied();
    size = stats.size;
  } catch { return denied(); }
  const headers: Record<string, string> = { 'Content-Type': types[path.extname(fileName)],
    'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store' };
  let start = 0, end = size - 1, status = 200;
  const range = request.headers.get('range');
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
    if (!match[1]) { start = Math.max(0, size - Number(match[2])); }
    else { start = Number(match[1]); end = match[2] ? Math.min(end, Number(match[2])) : end; }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
      return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length'] = String(Math.max(0, end - start + 1));
  if (request.method === 'HEAD' || size === 0) return new Response(null, { status, headers });
  const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream<Uint8Array>;
  return new Response(stream, { status, headers });
}
