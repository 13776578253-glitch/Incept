import { zstdDecompressSync } from 'node:zlib';

/** Decode every concatenated frame and retain the complete prefix on interrupted writes. */
export function decodeHarnessZstd(bytes: Uint8Array): { text: string; consumedBytes: number; error?: string } {
  const chunks: Buffer[] = [];
  let consumedBytes = 0, error: string | undefined;
  while (consumedBytes < bytes.length) {
    try {
      const frame = zstdDecompressSync(bytes.subarray(consumedBytes), { info: true }) as unknown as {
        buffer: Buffer; engine: { bytesWritten: number };
      };
      if (!frame.engine.bytesWritten) throw new Error('Empty Zstandard frame');
      consumedBytes += frame.engine.bytesWritten;
      chunks.push(frame.buffer);
    } catch {
      error = 'UNREADABLE_COMPRESSED_SUFFIX';
      break;
    }
  }
  return { text: Buffer.concat(chunks).toString('utf8'), consumedBytes, ...(error ? { error } : {}) };
}
