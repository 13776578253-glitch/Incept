#!/usr/bin/env node
/**
 * scripts/diff-codex-envelope.mjs
 *
 * Field-level differential analysis tool for Codex sync lineages.
 * Compares an old committed generation against a new candidate batch/stream to identify
 * the exact reason for REVISION_ENVELOPE_CHANGED or structural divergence.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

function hash(value) {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
}

function syncEnvelope(record) {
  return hash({
    ...record.event,
    eventId: undefined,
    sessionTitle: undefined,
    recordedCost: undefined,
  });
}

const argv = process.argv.slice(2);
function option(key) {
  const i = argv.indexOf('--' + key);
  return i < 0 ? undefined : argv[i + 1];
}

const stateDir = option('state');
const sessionId = option('session') ?? '01a182e1-9d59-7af0-9524-39be13fb4a7e';
const oldFile = option('old');
const newFile = option('new');
const batchId = option('batch');
const format = option('format') ?? 'text';

function loadFromDb(directory, targetSession, targetBatch) {
  const dbPath = join(directory, 'state.db');
  if (!existsSync(dbPath)) throw new Error(`STATE_DB_NOT_FOUND: ${dbPath}`);
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const scopeKey = hash(['codex', targetSession]);
    const lineageRow = db.prepare('SELECT parent_json, receipt_json FROM lineage WHERE scope=?').get(scopeKey);
    let parentHeader = null;
    let receipt = null;
    if (lineageRow) {
      const parsedParent = JSON.parse(lineageRow.parent_json);
      parentHeader = parsedParent.header;
      receipt = JSON.parse(lineageRow.receipt_json);
    }

    // Outbox candidate
    let candidateRow;
    if (targetBatch) {
      candidateRow = db.prepare('SELECT batch, header_json, state, error FROM outbox WHERE batch=?').get(targetBatch);
    } else {
      candidateRow = db.prepare("SELECT batch, header_json, state, error FROM outbox WHERE scope=? AND state IN ('pending','lineage','review') ORDER BY serial DESC LIMIT 1").get(scopeKey);
    }

    if (!candidateRow) {
      throw new Error(`NO_CANDIDATE_FOUND_FOR_SESSION: ${targetSession}`);
    }

    const candidateHeader = JSON.parse(candidateRow.header_json);
    const candidateRecords = db
      .prepare('SELECT position, json FROM records WHERE batch=? ORDER BY position')
      .all(candidateRow.batch)
      .map(r => JSON.parse(r.json));

    return {
      scope: scopeKey,
      parentHeader,
      receipt,
      candidateBatch: candidateRow.batch,
      candidateState: candidateRow.state,
      candidateError: candidateRow.error,
      candidateHeader,
      candidateRecords,
    };
  } finally {
    db.close();
  }
}

export function analyzeDiff(parentData, candidateData, targetSession = sessionId) {
  const { header: parentHeader, records: parentRecords = [] } = parentData;
  const { header: candidateHeader, records: candidateRecords = [] } = candidateData;

  const results = {
    session: targetSession,
    timestamp: new Date().toISOString(),
    parent: {
      manifestHash: parentHeader?.manifest?.manifestHash ?? null,
      generationId: parentHeader?.manifest?.generationId ?? null,
      recordCount: parentHeader?.manifest?.recordCount ?? parentRecords.length,
      rangesCount: parentHeader?.manifest?.ranges?.length ?? 0,
      ranges: parentHeader?.manifest?.ranges ?? [],
    },
    candidate: {
      manifestHash: candidateHeader?.manifest?.manifestHash ?? null,
      generationId: candidateHeader?.manifest?.generationId ?? null,
      parentManifestHash: candidateHeader?.manifest?.parent?.manifestHash ?? null,
      recordCount: candidateHeader?.manifest?.recordCount ?? candidateRecords.length,
      rangesCount: candidateHeader?.manifest?.ranges?.length ?? 0,
      ranges: candidateHeader?.manifest?.ranges ?? [],
    },
    structuralChecks: {
      parentHashMatchesHead:
        candidateHeader?.manifest?.parent?.manifestHash === parentHeader?.manifest?.manifestHash,
      generationMatches:
        candidateHeader?.manifest?.parent?.generationId === parentHeader?.manifest?.generationId,
      rangesPreserved: true,
      droppedRanges: [],
      addedRanges: [],
    },
    recordAlignment: {
      parentRecordCount: parentRecords.length,
      candidateRecordCount: candidateRecords.length,
      firstDivergenceIndex: -1,
      divergenceReason: null,
      divergenceDetails: null,
      subagentInterleavingDetected: false,
      mismatchedIndicesCount: 0,
    },
    fieldDiffs: [],
  };

  // Check ranges
  if (parentHeader?.manifest?.ranges && candidateHeader?.manifest?.ranges) {
    const parentLocators = new Set(parentHeader.manifest.ranges.map(r => r.locatorHash));
    const candLocators = new Set(candidateHeader.manifest.ranges.map(r => r.locatorHash));
    for (const r of parentHeader.manifest.ranges) {
      if (!candLocators.has(r.locatorHash)) {
        results.structuralChecks.droppedRanges.push(r.locatorHash);
      }
    }
    for (const r of candidateHeader.manifest.ranges) {
      if (!parentLocators.has(r.locatorHash) && !r.previous) {
        results.structuralChecks.addedRanges.push(r.locatorHash);
      }
    }
    if (results.structuralChecks.droppedRanges.length > 0) {
      results.structuralChecks.rangesPreserved = false;
    }
  }

  // Record lockstep check
  const minLen = Math.min(parentRecords.length, candidateRecords.length);
  for (let i = 0; i < minLen; i++) {
    const p = parentRecords[i];
    const c = candidateRecords[i];

    const pPointKey = p.pointKey ?? hash([targetSession, p.event.timestampMs]);
    const cPointKey = c.pointKey ?? hash([targetSession, c.event.timestampMs]);
    const pEnvelope = p.envelopeHash ?? syncEnvelope(p);
    const cEnvelope = c.envelopeHash ?? syncEnvelope(c);
    const pCleanEnvelope = syncEnvelope(p);
    const cCleanEnvelope = syncEnvelope(c);

    const pointKeyMatch = pPointKey === cPointKey;
    const envelopeHashMatch = pEnvelope === cEnvelope;
    const cleanEnvelopeMatch = pCleanEnvelope === cCleanEnvelope;
    const eventIdMatch = p.event.eventId === c.event.eventId;
    const timestampMatch = p.event.timestampMs === c.event.timestampMs;

    const cumulativeMatch =
      p.cumulative && c.cumulative
        ? p.cumulative.input === c.cumulative.input &&
          p.cumulative.output === c.cumulative.output &&
          p.cumulative.cache === c.cumulative.cache &&
          p.cumulative.reasoning === c.cumulative.reasoning
        : true;

    if (!pointKeyMatch || !envelopeHashMatch || !cumulativeMatch || !eventIdMatch) {
      results.recordAlignment.mismatchedIndicesCount++;
      const diffItem = {
        index: i,
        pointKeyMatch,
        envelopeHashMatch,
        cleanEnvelopeMatch,
        eventIdMatch,
        timestampMatch,
        cumulativeMatch,
        parent: {
          eventId: p.event.eventId,
          timestampMs: p.event.timestampMs,
          pointKey: pPointKey,
          envelopeHash: pEnvelope,
          cleanEnvelope: pCleanEnvelope,
          sessionTitle: p.event.sessionTitle ?? null,
          cumulative: p.cumulative ?? null,
          tokens: {
            in: p.event.inputTokens,
            out: p.event.outputTokens,
            cache: p.event.cacheReadTokens,
            reasoning: p.event.reasoningTokens,
          },
        },
        candidate: {
          eventId: c.event.eventId,
          timestampMs: c.event.timestampMs,
          pointKey: cPointKey,
          envelopeHash: cEnvelope,
          cleanEnvelope: cCleanEnvelope,
          sessionTitle: c.event.sessionTitle ?? null,
          cumulative: c.cumulative ?? null,
          tokens: {
            in: c.event.inputTokens,
            out: c.event.outputTokens,
            cache: c.event.cacheReadTokens,
            reasoning: c.event.reasoningTokens,
          },
        },
      };

      if (results.recordAlignment.firstDivergenceIndex === -1) {
        results.recordAlignment.firstDivergenceIndex = i;
        if (!pointKeyMatch && !timestampMatch) {
          results.recordAlignment.divergenceReason = 'RECORD_SEQUENCE_SHIFT_OR_SUBAGENT_DROPPED';
        } else if (!envelopeHashMatch && cleanEnvelopeMatch) {
          results.recordAlignment.divergenceReason = 'ENVELOPE_TITLE_OR_METADATA_HASH_MISMATCH';
        } else if (!envelopeHashMatch) {
          results.recordAlignment.divergenceReason = 'REVISION_ENVELOPE_CHANGED';
        } else if (!cumulativeMatch) {
          results.recordAlignment.divergenceReason = 'CUMULATIVE_COUNTER_DIVERGENCE';
        } else {
          results.recordAlignment.divergenceReason = 'AMBIGUOUS_RECORD_MISMATCH';
        }
        results.recordAlignment.divergenceDetails = diffItem;
      }

      if (results.fieldDiffs.length < 10) {
        results.fieldDiffs.push(diffItem);
      }
    }
  }

  // Classification & Verdict
  let rootCause = 'NO_DIVERGENCE_DETECTED';
  if (!results.structuralChecks.parentHashMatchesHead) {
    rootCause = 'PARENT_HEAD_MISMATCH: Candidate parent hash does not match committed parent head';
  } else if (!results.structuralChecks.rangesPreserved) {
    rootCause = `ROTATION_UNVERIFIED: Ranges dropped from parent: ${results.structuralChecks.droppedRanges.join(', ')}`;
  } else if (results.recordAlignment.firstDivergenceIndex !== -1) {
    if (results.recordAlignment.divergenceReason === 'RECORD_SEQUENCE_SHIFT_OR_SUBAGENT_DROPPED') {
      rootCause = `REVISION_ENVELOPE_CHANGED: Lockstep record sequence diverged at index ${results.recordAlignment.firstDivergenceIndex} (timestamp shifted). Indicates old generation contained amalgamated subagent records that are removed in pure parent candidate.`;
    } else if (results.recordAlignment.divergenceReason === 'ENVELOPE_TITLE_OR_METADATA_HASH_MISMATCH') {
      rootCause = `REVISION_ENVELOPE_CHANGED: Old record envelopeHash includes fields (e.g. sessionTitle) not present or rehashed differently in candidate at index ${results.recordAlignment.firstDivergenceIndex}.`;
    } else {
      rootCause = `REVISION_ENVELOPE_CHANGED: ${results.recordAlignment.divergenceReason} at index ${results.recordAlignment.firstDivergenceIndex}.`;
    }
  }

  results.rootCauseVerdict = rootCause;
  return results;
}

// CLI Execution
if (process.argv[1] && process.argv[1].endsWith('diff-codex-envelope.mjs')) {
  try {
    let parentData = null;
    let candidateData = null;

    if (oldFile && newFile) {
      parentData = JSON.parse(readFileSync(resolve(oldFile), 'utf8'));
      candidateData = JSON.parse(readFileSync(resolve(newFile), 'utf8'));
    } else if (stateDir) {
      const dbInfo = loadFromDb(resolve(stateDir), sessionId, batchId);
      candidateData = {
        header: dbInfo.candidateHeader,
        records: dbInfo.candidateRecords,
      };
      parentData = {
        header: dbInfo.parentHeader,
        records: [], // Records are pruned locally upon acknowledge; parentHeader has ranges and manifest
      };
      console.log(`[Loaded from State DB] Scope: ${dbInfo.scope}, Candidate Batch: ${dbInfo.candidateBatch} (${dbInfo.candidateState}, error: ${dbInfo.candidateError})`);
    } else {
      console.log('Usage:');
      console.log('  node scripts/diff-codex-envelope.mjs --state <dir> [--session <id>] [--batch <id>]');
      console.log('  node scripts/diff-codex-envelope.mjs --old <parent.json> --new <candidate.json>');
      process.exit(0);
    }

    const diff = analyzeDiff(parentData, candidateData, sessionId);
    if (format === 'json') {
      console.log(JSON.stringify(diff, null, 2));
    } else {
      console.log('\n=== Codex Lineage & Envelope Field-Level Differential Report ===');
      console.log(`Session:              ${diff.session}`);
      console.log(`Parent Head:          ${diff.parent.manifestHash ?? 'None'}`);
      console.log(`Candidate Batch Head: ${diff.candidate.manifestHash}`);
      console.log(`Candidate Ref Parent: ${diff.candidate.parentManifestHash}`);
      console.log(`Parent Record Count:  ${diff.parent.recordCount}`);
      console.log(`Candidate Rec Count:  ${diff.candidate.recordCount}`);
      console.log(`Parent Ranges:        ${diff.parent.rangesCount}`);
      console.log(`Candidate Ranges:     ${diff.candidate.rangesCount}`);
      console.log(`Ranges Preserved:     ${diff.structuralChecks.rangesPreserved ? 'YES' : 'NO'}`);
      console.log(`Parent Hash Matches:  ${diff.structuralChecks.parentHashMatchesHead ? 'YES' : 'NO'}`);
      console.log(`\n--- Record Lockstep Alignment ---`);
      console.log(`First Divergence Idx: ${diff.recordAlignment.firstDivergenceIndex}`);
      console.log(`Divergence Reason:    ${diff.recordAlignment.divergenceReason ?? 'NONE'}`);
      console.log(`Mismatched Records:   ${diff.recordAlignment.mismatchedIndicesCount}`);
      console.log(`\n=== Verdict ===`);
      console.log(diff.rootCauseVerdict);
      console.log('=================================================================\n');
    }
  } catch (err) {
    console.error('Error analyzing diff:', err);
    process.exit(1);
  }
}
