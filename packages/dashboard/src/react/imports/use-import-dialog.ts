import { useEffect, useState } from 'react';
import type { ImportMappings, ImportPreview, ImportReceipt } from '../../domain';
import { dashboardEndpoints } from '../../endpoints';

async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? 'Import request failed');
  return payload as T;
}
export function useImportDialog(onImported: () => void) {
  const [bundle, setBundle] = useState<unknown>();
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportPreview>();
  const [mappings, setMappings] = useState<ImportMappings>({});
  const [dirty, setDirty] = useState(false);
  const [history, setHistory] = useState<ImportReceipt[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<ImportReceipt>();
  async function loadHistory() { const result = await request<{ history: ImportReceipt[] }>(dashboardEndpoints.imports); setHistory(result.history); }
  useEffect(() => { loadHistory().catch(error => setError(String(error.message))); }, []);
  async function chooseFile(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true); setError(''); setPreview(undefined); setReceipt(undefined); setBundle(undefined); setFileName(file.name); setMappings({});
    try {
      if (file.size > 64 * 1024 * 1024) throw new Error('File exceeds 64 MiB');
      const input: unknown = JSON.parse(await file.text());
      setBundle(input);
      setPreview(await request<ImportPreview>(dashboardEndpoints.importPreview, { bundle: input, mappings: {} }));
      setDirty(false);
    } catch (error) { setError(error instanceof Error ? error.message : 'Invalid file'); }
    finally { setBusy(false); }
  }
  function changeMapping(key: string, target: string) { setMappings(current => ({ ...current, [key]: target || null })); setDirty(true); setReceipt(undefined); }
  async function revalidate() {
    setBusy(true); setError('');
    try { setPreview(await request<ImportPreview>(dashboardEndpoints.importPreview, { bundle, mappings })); setDirty(false); }
    catch (error) { setError(error instanceof Error ? error.message : 'Validation failed'); }
    finally { setBusy(false); }
  }
  async function commit() {
    if (!preview || dirty || busy || preview.conflicts || receipt) return;
    setBusy(true); setError('');
    try {
      const imported = await request<ImportReceipt>(dashboardEndpoints.importCommit, { previewId: preview.previewId });
      setReceipt(imported); onImported(); await loadHistory();
    } catch (error) { setDirty(true); setError(error instanceof Error ? error.message : 'Import failed'); }
    finally { setBusy(false); }
  }
  return { fileName, preview, mappings, dirty, history, busy, error, receipt, chooseFile, changeMapping, revalidate, commit };
}
export type ImportDialogState = ReturnType<typeof useImportDialog>;
