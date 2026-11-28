import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { TRANSFER_SOURCES, type TransferSource } from '@incept/dashboard/domain';

export type DeviceIntegrityItem = {
  source: TransferSource;
  sessionHash: string;
  models: string[];
  reason: string;
  affectedRecords: number;
  blockedRecords: number;
  blockedTokens: number;
  firstAffectedAt: string | null;
  lastAffectedAt: string | null;
  lastConfirmedRevision: number | null;
};

export type DeviceIntegrityReport = {
  version: 1;
  collectedAt: string;
  reportedAt: string;
  outcome: string;
  lastConfirmedRevision: number | null;
  totalIsolatedSessions: number;
  actionableSessions: number;
  totalBlockedRecords: number;
  totalBlockedTokens: number;
  earliestAffectedAt: string | null;
  items: DeviceIntegrityItem[];
};

const VALID_SOURCES = new Set<string>(TRANSFER_SOURCES);
const VALID_OUTCOMES = new Set(['complete_success', 'partial_success', 'no_change', 'source_failed']);
const MAX_ITEMS = 32;

function safeIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value))) {
    throw new Error('INVALID_INTEGRITY_TIMESTAMP');
  }
  return new Date(Date.parse(value)).toISOString();
}

function safeNonNegInt(value: unknown, max = 1e13): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new Error('INVALID_INTEGRITY_COUNT');
  }
  return value;
}

function safeNullableRevision(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return safeNonNegInt(value, 1e9);
}

export function validateDeviceIntegrityPayload(input: unknown, reportedAt = new Date().toISOString()): DeviceIntegrityReport {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('INVALID_INTEGRITY_REPORT');
  }
  const body = input as Record<string, unknown>;
  const allowedTop = new Set([
    'version',
    'collectedAt',
    'outcome',
    'lastConfirmedRevision',
    'totalIsolatedSessions',
    'actionableSessions',
    'totalBlockedRecords',
    'totalBlockedTokens',
    'earliestAffectedAt',
    'items',
  ]);
  for (const key of Object.keys(body)) {
    if (!allowedTop.has(key)) throw new Error('INVALID_INTEGRITY_REPORT');
  }
  if (body.version !== 1) throw new Error('INVALID_INTEGRITY_VERSION');
  const collectedAt = safeIsoOrNull(body.collectedAt);
  if (!collectedAt) throw new Error('INVALID_INTEGRITY_TIMESTAMP');
  const outcome = typeof body.outcome === 'string' && VALID_OUTCOMES.has(body.outcome) ? body.outcome : null;
  if (!outcome) throw new Error('INVALID_INTEGRITY_OUTCOME');
  if (!Array.isArray(body.items) || body.items.length > MAX_ITEMS) {
    throw new Error('INVALID_INTEGRITY_ITEMS');
  }
  const allowedItem = new Set([
    'source',
    'sessionHash',
    'models',
    'reason',
    'affectedRecords',
    'blockedRecords',
    'blockedTokens',
    'firstAffectedAt',
    'lastAffectedAt',
    'lastConfirmedRevision',
  ]);
  const items: DeviceIntegrityItem[] = body.items.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('INVALID_INTEGRITY_ITEM');
    }
    const row = raw as Record<string, unknown>;
    for (const key of Object.keys(row)) {
      if (!allowedItem.has(key)) throw new Error('INVALID_INTEGRITY_ITEM');
    }
    if (typeof row.source !== 'string' || !VALID_SOURCES.has(row.source)) {
      throw new Error('INVALID_INTEGRITY_SOURCE');
    }
    if (typeof row.sessionHash !== 'string' || !/^[a-f0-9]{8,32}$/i.test(row.sessionHash)) {
      throw new Error('INVALID_INTEGRITY_SESSION_HASH');
    }
    if (typeof row.reason !== 'string' || !/^[A-Z][A-Z0-9_]{1,63}$/.test(row.reason)) {
      throw new Error('INVALID_INTEGRITY_REASON');
    }
    if (!Array.isArray(row.models) || row.models.length > 12) {
      throw new Error('INVALID_INTEGRITY_MODELS');
    }
    const models = row.models.map((m) => {
      if (typeof m !== 'string' || !m.trim() || m.length > 120 || /[\x00-\x1f]/.test(m)) {
        throw new Error('INVALID_INTEGRITY_MODELS');
      }
      return m.trim();
    });
    return {
      source: row.source as TransferSource,
      sessionHash: row.sessionHash.toLowerCase(),
      models,
      reason: row.reason,
      affectedRecords: safeNonNegInt(row.affectedRecords, 1e8),
      blockedRecords: safeNonNegInt(row.blockedRecords, 1e8),
      blockedTokens: safeNonNegInt(row.blockedTokens, 1e13),
      firstAffectedAt: safeIsoOrNull(row.firstAffectedAt),
      lastAffectedAt: safeIsoOrNull(row.lastAffectedAt),
      lastConfirmedRevision: safeNullableRevision(row.lastConfirmedRevision),
    };
  });

  return {
    version: 1,
    collectedAt,
    reportedAt,
    outcome,
    lastConfirmedRevision: safeNullableRevision(body.lastConfirmedRevision),
    totalIsolatedSessions: safeNonNegInt(body.totalIsolatedSessions, 1e6),
    actionableSessions: safeNonNegInt(body.actionableSessions, 1e6),
    totalBlockedRecords: safeNonNegInt(body.totalBlockedRecords, 1e9),
    totalBlockedTokens: safeNonNegInt(body.totalBlockedTokens, 1e14),
    earliestAffectedAt: safeIsoOrNull(body.earliestAffectedAt),
    items,
  };
}

export function resolveIntegrityFilePath(syncDatabaseFile = process.env.INCEPT_SYNC_DATABASE_FILE): string | null {
  if (!syncDatabaseFile || !path.isAbsolute(syncDatabaseFile)) return null;
  return path.join(path.dirname(syncDatabaseFile), 'device-integrity.json');
}

export function readDeviceIntegrityMap(filePath: string | null): Record<string, DeviceIntegrityReport> {
  if (!filePath) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { version?: number; devices?: Record<string, DeviceIntegrityReport> };
    if (parsed?.version !== 1 || !parsed.devices || typeof parsed.devices !== 'object') return {};
    return parsed.devices;
  } catch {
    return {};
  }
}

export function writeDeviceIntegrityReport(filePath: string | null, deviceId: string, report: DeviceIntegrityReport): void {
  if (!filePath) return;
  const existing = readDeviceIntegrityMap(filePath);
  const next = {
    version: 1,
    updatedAt: report.reportedAt,
    devices: {
      ...existing,
      [deviceId]: report,
    },
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempFile = `${filePath}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tempFile, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    fs.renameSync(tempFile, filePath);
  } finally {
    try { fs.rmSync(tempFile, { force: true }); } catch { /* ignore */ }
  }
}
