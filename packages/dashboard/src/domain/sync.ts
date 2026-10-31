import type { TransferEvent, TransferPrice, TransferSource } from './imports';

// Unmounted Node service contract. Device/Owner contexts are supplied by a trusted
// in-process caller; a transport and credential verifier belong to Phase 2.
export type SyncScope = { deviceId: string; source: TransferSource; sessionId: string; originId: string };
export type SyncBasis = { rates: Record<string, TransferPrice>; aliases: Record<string, string>; schedule: 'commandcode-peak-v1' };
export type SyncCounters = { input: number; cache: number; output: number; reasoning: number };
export type SyncRecord = { event: TransferEvent; envelopeHash: string; nativeKey?: { source: TransferSource; keyHash: string };
  pointKey?: string; cumulative?: SyncCounters };
export type SyncCommitment = { version: 1; kind: 'stable-key-set'; keyRoot: string; count: number; schemaHash: string };
export type SyncRange = { locatorHash: string; identityHash: string; root: string; envelopeRoot: string; byteLength: number;
  kind: 'jsonl' | 'json' | 'sqlite' | 'compressed'; sessionAnchorHash?: string;
  commitment?: SyncCommitment;
  previous?: { locatorHash: string; root: string; retainedRoot: string; retainedBytes: number; change: 'append' | 'usage-revision' | 'rotation' } };
export type SyncManifest = { version: 2; scope: SyncScope; reader: TransferSource | 'aiusage'; collectorVersion: 'incept-collector/1'; epoch: number;
  parent: { generationId: string; manifestHash: string } | null; read: { status: 'complete' | 'partial' | 'unavailable' | 'failed';
    inventoryHash: string; beforeRoot: string; afterRoot: string; snapshotRoot: string };
  ranges: SyncRange[]; recordCount: number; sequenceHash: string; basisHash: string; mappingsHash: string;
  merkleRoot?: string;
  generationId: string; manifestHash: string; intent: 'observe' | 'rebase' | 'reprice' };
export type SyncHeader = { batchId: string; manifest: SyncManifest; basis: SyncBasis; mappings: Record<string, string | null> };
export type SyncActor = { role: 'device'; deviceId: string } | { role: 'owner'; subject: string; reason: string };
export type SyncReceipt = { batchId: string; payloadHash: string; generationId: string; manifestHash: string; dataRevision: number;
  status: 'committed' | 'review-required'; outcome: 'inserted' | 'updated' | 'unchanged' | 'conflict'; code: string };
export type SyncConflict = 'INCOMPLETE_READ' | 'PREFIX_LOST' | 'ROTATION_UNVERIFIED' | 'WEAK_REVISION_REVIEW_REQUIRED'
  | 'NATIVE_ANCHOR_CHANGED' | 'REVISION_ENVELOPE_CHANGED' | 'DB_REPLACED_UNVERIFIED' | 'SOURCE_REVISION_UNVERIFIED'
  | 'CODEX_COUNTER_INVALID' | 'PARENT_MISMATCH' | 'SCOPE_MISMATCH' | 'V1_ADOPTION_REVIEW_REQUIRED'
  | 'ROLLED_BACK_LINEAGE' | 'EXPLICIT_OWNER_REQUIRED' | 'UNSUPPORTED_EVIDENCE';
