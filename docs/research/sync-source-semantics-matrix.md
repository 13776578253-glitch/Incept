# Sync Source Semantics Matrix (Phase 3 design gate)

Status: approved by Owner on 2026-10-28. The implementation in `fix/sync-safety` applies the conservative rules marked **implemented**; rows marked **pending** keep the existing review path until their mutation rules are separately exercised.

## Matrix

| Source | Storage | Identity | Ordering | Allowed mutation | Retention semantics | Status |
|---|---|---|---|---|---|---|
| Codex | JSONL sessions/archive | session + line/event id | append | append, rotation | ordered prefix; missing/rotated history review | existing prefix + rotation review |
| CommandCode | JSONL/projects | event id or filename namespace | append | append, rotation | ordered prefix; weak identity requires review | existing |
| Claude Code | JSONL | session + event id | append | append, rotation | ordered prefix; missing prefix review | existing |
| Gemini CLI | JSON/JSONL | session + event id | append | append, rotation | ordered prefix; rotation needs explicit proof | existing |
| Antigravity | SQLite | stable row/event key | not append-only | in-place status/metadata; rows may move | stable usage-key set; metadata/status changes allowed; missing old usage key = review; schema change = review | **implemented** (`stable-key-set`) |
| opencode | SQLite/log | stable event id | per source | define | stable-key set candidate; not yet enabled | pending |
| zcode | SQLite | stable event id | per source | define | stable-key set candidate; not yet enabled | pending |
| aiusage / deepseekHarness | SQLite/JSONL | stable event id | per source | define | fallback/weak identity keeps review path | existing |

## Antigravity trusted commitment

- `SyncRange.commitment = { version:1, kind:'stable-key-set', keyRoot, count, schemaHash }`.
- `keyRoot` is `hash(sorted(nativeKey.keyHash))` for the usage-bearing records in that range; `count` is their number.
- The client computes the commitment from the captured records and table schemas.
- The server:
  1. requires both parent and child ranges to use the same commitment kind;
  2. requires the table `schemaHash` to match;
  3. requires `child.count >= parent.count`;
  4. verifies `child.keyRoot/count` against the incoming records and `parent.keyRoot/count` against the reconstructed current records;
  5. uses `qualifyRecords` to prove every old usage key is still present.
- Metadata/status-only changes change the SQLite file/range root but not the usage-key commitment, so they do not produce false `PREFIX_LOST`.
- A deleted usage record is detected by the key count/subset checks and enters review with the old head retained.
- A schema change enters review as `SOURCE_REVISION_UNVERIFIED`.
- An old parent manifest without a commitment enters review as `UNSUPPORTED_EVIDENCE`; it is never a silent pass. This is the one-time baseline/review path.
- The client no longer uses the `schemasMatch && noRowsDeleted && records.length >= parent.recordCount` shortcut; that shortcut is removed.

## Evidence rules

1. The parent manifest stores the old commitment; the client never supplies a trusted `retainedRoot` for Antigravity.
2. Append-only sources keep ordered-prefix proofs; rotation requires the explicit rotation proof and remains review-gated.
3. Schema/commitment version changes are a new baseline or review, never a comparison of incompatible roots.
4. Missing members, observations, historical parent, or accepted generation make a replay `unprovable`, not `pass`.
5. A review acceptance must re-run the same pure validation against the current head; a historical audit replays against the historical parent and reports range/record/legacy stages separately.

## Open decisions

- Owner approval of this matrix before enabling `stable-key-set` for opencode/zcode/aiusage.
- Whether a future schema version should add a Merkle accumulator for delta-only chunks above the 20,000-record batch limit.
- Owner-approved signature key/version handshake for the Windows package; the current package now carries a SHA-256 manifest and the launcher verifies it before `node` starts the Agent.
