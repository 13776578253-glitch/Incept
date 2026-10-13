import 'server-only';
import { commitImport, importHistory, previewImport } from '../adapters/local/imports/service';
import { ImportError, MAX_TRANSFER_BYTES } from '../adapters/local/imports/validation';
import type { ImportMappings } from '../domain';

const headers = { 'Cache-Control': 'no-store' };
async function readJson(request: Request) {
  if (!request.body) throw new ImportError('INVALID_REQUEST', 'Missing request body');
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_TRANSFER_BYTES) { await reader.cancel(); throw new ImportError('FILE_TOO_LARGE', 'Transfer exceeds 64 MiB', 413); }
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>; }
    catch { throw new ImportError('INVALID_JSON', 'Invalid JSON file'); }
  } finally { reader.releaseLock(); }
}
function checkOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new ImportError('INVALID_ORIGIN', 'Same-origin request required', 403);
}
function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof ImportError ? error.message : 'Unable to access import storage',
    code: error instanceof ImportError ? error.code : 'IMPORT_STORAGE_ERROR' }, { status: error instanceof ImportError ? error.status : 503, headers });
}
export async function dashboardImportsGet() {
  try { return Response.json({ history: importHistory() }, { headers }); } catch (error) { return errorResponse(error); }
}
export async function dashboardImportPreviewPost(request: Request) {
  try {
    checkOrigin(request);
    const body = await readJson(request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ImportError('INVALID_REQUEST', 'Expected import request');
    const mappings = body.mappings ?? {};
    if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)
      || Object.values(mappings).some(value => value !== null && (typeof value !== 'string' || value.length > 512))) {
      throw new ImportError('INVALID_MAPPING', 'Invalid project mapping');
    }
    return Response.json(previewImport(body.bundle, mappings as ImportMappings), { headers });
  } catch (error) { return errorResponse(error); }
}
export async function dashboardImportCommitPost(request: Request) {
  try {
    checkOrigin(request);
    const body = await readJson(request);
    if (typeof body?.previewId !== 'string' || body.previewId.length !== 36) throw new ImportError('INVALID_REQUEST', 'Invalid preview identifier');
    return Response.json(commitImport(body.previewId), { headers });
  } catch (error) { return errorResponse(error); }
}
