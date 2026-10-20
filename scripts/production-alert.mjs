import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Persist transitions and event identifiers so a retry cannot create a new notification identity.
export async function notifyProbe(ok, reason, configuration = process.env, fetchImplementation = fetch) {
  const endpoint = new URL(configuration.INCEPT_ALERT_WEBHOOK_URL ?? '');
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new Error('Configure an HTTPS alert endpoint.');
  const stateFile = configuration.INCEPT_MONITOR_STATE_FILE;
  if (!stateFile || !path.isAbsolute(stateFile)) throw new Error('Configure an absolute monitor state file.');
  const repeatMinutes = Number(configuration.INCEPT_ALERT_REPEAT_MINUTES ?? '60');
  if (!Number.isFinite(repeatMinutes) || repeatMinutes < 15) throw new Error('Invalid alert reminder interval.');
  let state;
  try { state = JSON.parse(await fs.readFile(stateFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const now = Date.now(), status = ok ? 'healthy' : 'failed';
  const previousStatus = state?.status;
  const changed = previousStatus !== status || (!ok && state?.reason !== reason);
  const remind = !ok && now - (state?.deliveredAt ?? 0) >= repeatMinutes * 60_000;
  const pendingMatches = state?.pending && state.pending.status === (ok ? 'recovered' : 'failure');
  const shouldSend = pendingMatches || (!ok && (changed || remind)) || (ok && previousStatus === 'failed');
  async function persist(value) {
    await fs.mkdir(path.dirname(stateFile), { recursive: true, mode: 0o700 });
    const temporary = `${stateFile}.${randomUUID()}.tmp`;
    try { await fs.writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 }); await fs.rename(temporary, stateFile); }
    finally { await fs.rm(temporary, { force: true }); }
  }
  if (!shouldSend) {
    if (!state) await persist({ status, reason: null, deliveredAt: now });
    return;
  }
  const safeReason = ['configuration', 'health', 'disk', 'backup'].includes(reason) ? reason : 'configuration';
  const event = !changed && state?.pending ? state.pending : {
    eventId: randomUUID(), service: 'incept', status: ok ? 'recovered' : 'failure',
    check: ok ? null : safeReason, occurredAt: new Date(now).toISOString(),
  };
  state = { status, reason: ok ? null : safeReason, deliveredAt: state?.deliveredAt ?? 0, pending: event };
  await persist(state);
  const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': event.eventId };
  if (configuration.INCEPT_ALERT_BEARER_FILE) {
    const credential = (await fs.readFile(configuration.INCEPT_ALERT_BEARER_FILE, 'utf8')).trim();
    if (!credential || /[\r\n]/.test(credential)) throw new Error('Invalid alert credential file.');
    headers.Authorization = `Bearer ${credential}`;
  }
  const response = await fetchImplementation(endpoint, { method: 'POST', headers, body: JSON.stringify(event),
    redirect: 'error', signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error('Alert delivery failed.');
  await response.body?.cancel();
  await persist({ status, reason: state.reason, deliveredAt: now });
}
