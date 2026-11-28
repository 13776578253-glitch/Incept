import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const ALLOWED_ALERT_CHECKS = new Set([
  'configuration',
  'health',
  'disk',
  'backup',
  'sync_504',
  'snapshot_lag',
  'collection_isolation',
]);

export function formatAlertRequest(event, format = 'json') {
  const normalized = (format || 'json').trim().toLowerCase();
  const headers = { 'Idempotency-Key': event.eventId };
  const summary = event.status === 'recovered'
    ? `[${event.service}] RECOVERED at ${event.occurredAt} (id=${event.eventId})`
    : `[${event.service}] ALERT failure check=${event.check} at ${event.occurredAt} (id=${event.eventId})`;
  if (normalized === 'json') {
    return {
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    };
  }
  if (normalized === 'ntfy') {
    return {
      headers: {
        ...headers,
        'Content-Type': 'text/plain; charset=utf-8',
        Title: event.status === 'recovered' ? 'Incept Recovered' : `Incept Alert: ${event.check}`,
        Priority: event.status === 'recovered' ? 'default' : 'high',
        Tags: event.status === 'recovered' ? 'white_check_mark' : 'warning',
      },
      body: summary,
    };
  }
  if (normalized === 'feishu') {
    return {
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg_type: 'text', content: { text: summary } }),
    };
  }
  if (normalized === 'bark') {
    return {
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: event.status === 'recovered' ? 'Incept Recovered' : `Incept Alert: ${event.check}`,
        body: summary,
        group: event.service,
      }),
    };
  }
  if (normalized === 'discord') {
    return {
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: summary }),
    };
  }
  if (normalized === 'slack') {
    return {
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: summary }),
    };
  }
  throw new Error(`Unsupported alert format: ${normalized}`);
}

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
  const safeReason = ALLOWED_ALERT_CHECKS.has(reason) ? reason : 'configuration';
  const changed = previousStatus !== status || (!ok && state?.reason !== safeReason);
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
  const event = !changed && state?.pending ? state.pending : {
    eventId: randomUUID(), service: 'incept', status: ok ? 'recovered' : 'failure',
    check: ok ? null : safeReason, occurredAt: new Date(now).toISOString(),
  };
  state = { status, reason: ok ? null : safeReason, deliveredAt: state?.deliveredAt ?? 0, pending: event };
  await persist(state);
  const formatted = formatAlertRequest(event, configuration.INCEPT_ALERT_WEBHOOK_FORMAT ?? 'json');
  const headers = { ...formatted.headers };
  if (configuration.INCEPT_ALERT_BEARER_FILE) {
    const credential = (await fs.readFile(configuration.INCEPT_ALERT_BEARER_FILE, 'utf8')).trim();
    if (!credential || /[\r\n]/.test(credential)) throw new Error('Invalid alert credential file.');
    headers.Authorization = `Bearer ${credential}`;
  }
  const response = await fetchImplementation(endpoint, { method: 'POST', headers, body: formatted.body,
    redirect: 'error', signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error('Alert delivery failed.');
  await response.body?.cancel();
  await persist({ status, reason: state.reason, deliveredAt: now });
}
