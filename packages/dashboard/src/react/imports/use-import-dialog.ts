import { useEffect, useRef, useState } from 'react';
import type { ImportMappings, ImportPreview, ImportReceipt } from '../../domain';
import { dashboardEndpoints } from '../../endpoints';

class ImportRequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new ImportRequestError(response.status, payload.error ?? 'Import request failed');
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
  const [reauthRequired, setReauthRequired] = useState(false);
  const [authError, setAuthError] = useState('');
  const submitting = useRef(false);
  async function loadHistory() { const result = await request<{ history: ImportReceipt[] }>(dashboardEndpoints.imports); setHistory(result.history.slice(0, 10)); }
  useEffect(() => {
    let active = true;
    request<{ history: ImportReceipt[] }>(dashboardEndpoints.imports)
      .then(result => { if (active) setHistory(result.history.slice(0, 10)); })
      .catch(error => { if (active) setError(String(error.message)); });
    return () => { active = false; };
  }, []);
  async function chooseFile(file: File | undefined) {
    if (!file || busy || reauthRequired) return;
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
  function changeMapping(key: string, target: string) { if (busy || reauthRequired) return; setMappings(current => ({ ...current, [key]: target || null })); setDirty(true); setReceipt(undefined); }
  async function revalidate() {
    if (busy || reauthRequired) return;
    setBusy(true); setError('');
    try { setPreview(await request<ImportPreview>(dashboardEndpoints.importPreview, { bundle, mappings })); setDirty(false); }
    catch (error) { setError(error instanceof Error ? error.message : 'Validation failed'); }
    finally { setBusy(false); }
  }
  async function submitPreview(previewId: string) {
    try {
      const imported = await request<ImportReceipt>(dashboardEndpoints.importCommit, { previewId });
      setReceipt(imported); setReauthRequired(false); onImported();
      await loadHistory().catch(error => setError(error instanceof Error ? error.message : 'History unavailable'));
    } catch (error) {
      if (error instanceof ImportRequestError && error.status === 428) { setReauthRequired(true); return; }
      setReauthRequired(false); setDirty(true); setError(error instanceof Error ? error.message : 'Import failed');
    }
  }
  async function commit() {
    if (!preview || dirty || busy || submitting.current || reauthRequired || preview.conflicts || receipt) return;
    submitting.current = true; setBusy(true); setError(''); setAuthError('');
    try { await submitPreview(preview.previewId); }
    finally { submitting.current = false; setBusy(false); }
  }
  async function reauthenticate(password: string, code: string) {
    if (!reauthRequired || !preview || dirty || receipt || busy || submitting.current) return;
    if (!password || !/^\d{6}$/.test(code)) { setAuthError(!password ? 'password_required' : 'totp_format'); return; }
    submitting.current = true; setBusy(true); setAuthError(''); setError('');
    try {
      const result = await request<{ authenticated: boolean }>(dashboardEndpoints.reauthenticate, { password, code });
      if (!result.authenticated) { setAuthError('invalid_credentials'); return; }
      await submitPreview(preview.previewId);
    } catch (error) {
      setAuthError(error instanceof ImportRequestError ? error.message : 'service_unavailable');
    } finally { submitting.current = false; setBusy(false); }
  }
  function cancelReauthentication() { if (busy || submitting.current) return; setReauthRequired(false); setAuthError(''); }
  return { fileName, preview, mappings, dirty, history, busy, error, receipt, reauthRequired, authError,
    chooseFile, changeMapping, revalidate, commit, reauthenticate, cancelReauthentication };
}
export type ImportDialogState = ReturnType<typeof useImportDialog>;
