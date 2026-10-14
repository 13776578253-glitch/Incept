import { describe, expect, it, vi, afterEach } from 'vitest';
const service = vi.hoisted(() => ({ previewImport: vi.fn(), commitImport: vi.fn(), importHistory: vi.fn() }));
vi.mock('../adapters/local/imports/service', () => service);
import { dashboardImportPreviewPost, dashboardImportCommitPost, dashboardImportsGet } from '../next/import-routes';
import { ImportError } from '../adapters/local/imports/validation';
const request = (body: unknown, origin = 'http://localhost:3000') => new Request('http://localhost:3000/api/dashboard/imports/preview', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
afterEach(() => vi.resetAllMocks());
describe('import HTTP boundaries', () => {
  it('uses only the host-supplied public origin behind a private reverse proxy', async () => {
    service.previewImport.mockReturnValue({ previewId: 'preview' });
    service.commitImport.mockReturnValue({ id: 'batch' });
    const publicOrigin = 'https://site.example';
    expect((await dashboardImportPreviewPost(request({ bundle: {} }, publicOrigin))).status).toBe(403);
    expect((await dashboardImportPreviewPost(request({ bundle: {} }, publicOrigin), publicOrigin)).status).toBe(200);
    expect((await dashboardImportCommitPost(request({ previewId: 'a'.repeat(36) }, publicOrigin), publicOrigin)).status).toBe(200);
    expect((await dashboardImportPreviewPost(request({ bundle: {} }, 'https://evil.example'), publicOrigin)).status).toBe(403);
  });
  it('rejects cross-origin writes before reading or importing the upload', async () => {
    const response = await dashboardImportPreviewPost(request({ bundle: {} }, 'https://untrusted.test'));
    expect(response.status).toBe(403); expect(service.previewImport).not.toHaveBeenCalled();
    expect((await dashboardImportCommitPost(request({ previewId: 'a'.repeat(36) }, ''))).status).toBe(403);
  });
  it('validates request structure and converts domain conflicts to 409', async () => {
    expect((await dashboardImportPreviewPost(request({ mappings: [] }))).status).toBe(400);
    expect((await dashboardImportCommitPost(request({ previewId: 'bad' }))).status).toBe(400);
    service.commitImport.mockImplementation(() => { throw new ImportError('IMPORT_CONFLICT', 'Conflict', 409); });
    const result = await dashboardImportCommitPost(request({ previewId: 'a'.repeat(36) }));
    expect(result.status).toBe(409); expect((await result.json()).code).toBe('IMPORT_CONFLICT');
  });
  it('returns no-store previews and history without exposing storage errors', async () => {
    service.previewImport.mockReturnValue({ previewId: 'preview' });
    const result = await dashboardImportPreviewPost(request({ bundle: { format: 'fixture' }, mappings: {} }));
    expect(await result.json()).toEqual({ previewId: 'preview' }); expect(result.headers.get('cache-control')).toBe('no-store');
    service.importHistory.mockReturnValue([{ id: 'batch' }]);
    expect(await (await dashboardImportsGet()).json()).toEqual({ history: [{ id: 'batch' }] });
    service.importHistory.mockImplementation(() => { throw new Error('private filesystem path'); });
    const failure = await dashboardImportsGet(); expect(failure.status).toBe(503);
    expect(JSON.stringify(await failure.json())).not.toContain('private filesystem path');
  });
  it('enforces the stream size limit before parsing a transfer', async () => {
    const upload = new Request('http://localhost:3000/api/dashboard/imports/preview', { method: 'POST', headers: { Origin: 'http://localhost:3000' },
      body: new Uint8Array(64 * 1024 * 1024 + 1) });
    expect((await dashboardImportPreviewPost(upload)).status).toBe(413);
    expect(service.previewImport).not.toHaveBeenCalled();
  });
});
