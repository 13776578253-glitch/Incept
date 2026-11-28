import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  readDeviceIntegrityMap,
  validateDeviceIntegrityPayload,
  writeDeviceIntegrityReport,
} from '../integrity';

describe('device pre-commit integrity report store', () => {
  it('validates sanitized integrity payloads and persists per-device reports atomically', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'incept-integrity-store-'));
    try {
      const file = path.join(dir, 'device-integrity.json');
      const report = validateDeviceIntegrityPayload({
        version: 1,
        collectedAt: '2026-11-28T10:00:00.000Z',
        outcome: 'partial_success',
        lastConfirmedRevision: 4633,
        totalIsolatedSessions: 116,
        actionableSessions: 2,
        totalBlockedRecords: 347,
        totalBlockedTokens: 88084618,
        earliestAffectedAt: '2026-11-26T08:00:00.000Z',
        items: [
          {
            source: 'codex',
            sessionHash: '6a9be12c6ea0',
            models: ['gpt-6.2-sol'],
            reason: 'ROTATION_UNVERIFIED',
            affectedRecords: 426,
            blockedRecords: 277,
            blockedTokens: 67624768,
            firstAffectedAt: '2026-11-26T08:00:00.000Z',
            lastAffectedAt: '2026-11-28T09:50:00.000Z',
            lastConfirmedRevision: 4345,
          },
        ],
      }, '2026-11-28T10:00:05.000Z');

      writeDeviceIntegrityReport(file, 'device-a', report);
      const map = readDeviceIntegrityMap(file);
      expect(map['device-a']?.actionableSessions).toBe(2);
      expect(map['device-a']?.totalBlockedTokens).toBe(88084618);
      expect(map['device-a']?.items[0]?.models).toEqual(['gpt-6.2-sol']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects unexpected private fields or raw session identifiers', () => {
    expect(() =>
      validateDeviceIntegrityPayload({
        version: 1,
        collectedAt: '2026-11-28T10:00:00.000Z',
        outcome: 'partial_success',
        lastConfirmedRevision: 4633,
        totalIsolatedSessions: 1,
        actionableSessions: 1,
        totalBlockedRecords: 1,
        totalBlockedTokens: 100,
        earliestAffectedAt: null,
        items: [
          {
            source: 'codex',
            sessionHash: 'not-a-hex-hash-path',
            models: ['gpt-6.2-sol'],
            reason: 'ROTATION_UNVERIFIED',
            affectedRecords: 1,
            blockedRecords: 1,
            blockedTokens: 100,
            firstAffectedAt: null,
            lastAffectedAt: null,
            lastConfirmedRevision: null,
          },
        ],
      }),
    ).toThrow(/INVALID_INTEGRITY_SESSION_HASH/);
  });
});
