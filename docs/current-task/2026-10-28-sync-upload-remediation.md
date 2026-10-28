# Sync Upload Remediation — Offline Implementation Record

Date: 2026-10-28 (Asia/Singapore). Branch `fix/sync-safety` in `.worktrees/sync-safety`, based on deployed sync baseline `17ffd36`. Production deployment and owner-approved historical rebase were executed; no push/merge.

## Implemented

- **Phase 0B audit**: `packages/dashboard/src/sync/review-audit.ts` and `sync-maintenance audit-accepted-reviews`.
  - Reconstructs the historical parent/current from `sync_generations` + `sync_changes`, not the current head.
  - Reports per review: members, sequenceHash, range/records/tokens/commitment/legacy stages, dependencies, later committed descendants, current head, and `repairRecommendation` (`none` / `owner-rebase` / `fence`).
  - Read-only; accepts `--source` and optional `--report`; refuses writes.
- **Phase 1 safe acceptance**: `validation.ts` pure evidence validation; `acceptReview` one `BEGIN IMMEDIATE` transaction with parent/head re-check, contiguous members, full sequenceHash, range/record/legacy validation, generation/manifest collision typing, receipt payload/status idempotency, resolution idempotency, and atomic rollback. Normal `commit` uses the same validation.
- **Schema**: schema version 3; unique `(scope_id, manifest_id)` guards for generations/reviews after duplicate scan. A duplicate existing ledger fails closed as `SYNC_SCHEMA_DUPLICATE_REVIEW_REQUIRED` rather than deleting rows.
- **Phase 2 client recovery**: exact committed-batch acknowledgement without requiring the current head; review-required receipts become durable `review` state; 400/413 quarantine only the failed batch; 409 enters `lineage`; review is never the fallback for permanent validation errors; no cascade review to later batches; 20,000-record client guard; OUTBOX capacity stops only the affected source.
- **Phase 3 Antigravity semantics**: compact `stable-key-set` commitment (`keyRoot`, `count`, `schemaHash`); metadata/status in-place changes no longer produce false `PREFIX_LOST`; missing old usage keys still review; schema changes review; old manifests without commitments are `UNSUPPORTED_EVIDENCE`, never silent passes. The old `schemasMatch && noRowsDeleted && records.length >= parent.recordCount` shortcut is removed. Capture uses one SQLite backup snapshot, `busy_timeout`, a 1 GiB budget, zstd output bounds, and no whole-home inventory abort. Owner approved the source-semantics matrix on 2026-10-28.
- **Repair tooling**: `sync-agent export-rebase` exports a fresh source snapshot for one or more sessions; `sync-maintenance rebase-scope` constructs an Owner-approved `rebase` manifest against the current head, validates it, stages pages, commits a new auditable generation, and writes `owner-repair-rebase` audit evidence. Rehearsed on a production backup: 11 scopes, revision 869→880, all committed, all parents correct, and all visible record sequences byte-for-byte identical before/after.
- **Phase 4**: job TTL 15 minutes with a 30-minute running grace; `/complete` no longer rejects a running job solely because its expiry passed; remote owner callbacks require recent authentication and write a start audit; pre-auth rate limiter; tray restarts a stale agent on a 15s health interval and keeps `Attention` while review/held/quarantine/lineage values remain; Windows package carries a SHA-256 manifest and the launcher verifies it before starting Node.

## Verification

| Check | Result |
|---|---|
| `pnpm typecheck` | passed (all workspaces + scripts) |
| `pnpm lint` | 0 errors, 8 pre-existing warnings |
| `pnpm --filter @incept/dashboard test` | 298 passed / 2 skipped (50 files) |
| `pnpm --filter @incept/sync-agent test` | 102 passed / 0 failed (includes resolved-review and lineage/recovery tests) |
| `pnpm --filter web test` | 137 passed / 55 skipped; integration suites gated by DB env |
| `pnpm --filter web exec vitest run src/server/sync/__tests__/integration.test.ts` (isolated `incept_sync_phase2`) | 15 passed / 0 failed |
| `pnpm --filter web exec vitest run src/server/sync/__tests__/agent.integration.test.ts` (isolated `incept_sync_phase3`, test TLS fixture) | 3 passed / 1 five-minute test skipped |
| `pnpm --filter web exec vitest run src/server/sync/__tests__/remote.integration.test.ts` (isolated `incept_sync_phase4`) | 7 passed / 0 failed; eight-source recent-window fixture, fresh test certificate |
| `pnpm test:ops` | 157 passed / 1 skipped |
| Tray `tools/test.ps1` | 56 passed / 0 failed |
| Windows package | built; manifest hash verified; tamper rejected with `AGENT_PACKAGE_HASH_MISMATCH` |

The remote WSS fixture now derives its counts from `TRANSFER_SOURCES` (8 sources), writes recent timestamps so 7d/30d/all use the same data, and ignores the transaction-only `status` field when replaying a stored completion. Its local test certificate was regenerated for IP `127.0.0.1`/`localhost`; the previous `.scratch` certificate expired on 2026-10-19.

## Offline production audit

Ran `audit-accepted-reviews` against a local copy of `/srv/incept/shared/sync/phase0b-audit.db`:

- 22 accepted-successor reviews; **0 pass, 22 fail, 0 unprovable**.
- All 22 failures are the range stage `PREFIX_LOST`; every record stage passes and every member sequenceHash matches.
- Repair summary: `none=0`, `owner-rebase=22`, `fence=0`. Report digest `3ab4313d394f48122274984d5eceeea667211b3b9c149c3e682f2e17ebfbb5fd`.
- #28: 22 members, range fail, records pass.
- #29: 2974 members, range fail, records pass.
- #30: 2999 members, range fail, records pass.
- #31: 3021 members, range fail, records pass.
- All 22 are `repairRecommendation = owner-rebase`: records are valid, but the historical range proof predates the stable-key commitment and cannot be re-certified offline.
- Later committed descendants are listed per review; the audit does not propose deleting or restoring over them.

## Production deployment and rebase

- Backups: `/srv/incept/backups/phase0b-repair-20261028T061500Z/` containing `v4.db` (111,714,304 bytes, SHA-256 `d81586328c6b65025db17da447a82c60ad931fb14239eb5291421575513902f4`), `postgres.dump`, and `env.before`.
- Release commit: `14d118e`; server image `sha256:2c03b477368ffa6b713612e5ef350db233354b91d6964e166a93071ed0992c93`; release dir `/srv/incept/releases/14d118e`. A follow-up agent-only commit `5143a77` splits the capture heap budget (SQLite snapshots no longer consume the JSON heap budget) and is installed in the local tray/agent package.
- Final server image: `sha256:82a73becb271ca9168000e3a02ab54961fa16be6faa89a94dfffa543351a970b` from release commit `c5608d5`, installed at `/srv/incept/releases/c5608d5`; env backup `.env.production.bak-pre-c5608d5`. It adds resolved-review reporting on batch status and the tray attention wording.
- Rebase applied to 11 affected scopes (9 antigravity, 2 zcode) with fresh source captures: revision 869→880, 11 committed `rebase` generations, each parented to the old visible generation. All old rows remain; all 11 visible record sequences are byte-for-byte identical to the pre-rebase backup. Schema is now 3; `PRAGMA integrity_check` is `ok`.
- Owner-approved commandcode rebase for #32–#34 used fresh captures of 445 / 10 / 16 records, created auditable `rebase` generations parented to the old heads, retained every old generation/manifest, and marked each review `accepted-successor`. Revision 880→883; resolutions 883→886.
- App, gateway and proxy are healthy; `/api/health/ready` is 200; `sync-maintenance status` reports revision 889, 966 receipts, 0 unresolved reviews, 0 incomplete staging.
- Follow-up agent reconciliation: after the owner rebase, the local lineage still pointed at the pre-rebase heads, so replay candidates hit `LOCAL_PARENT_MISMATCH` and stale staging consumed the four-batch device limit. Stale staging was verified to have no receipts and was removed; the three commandcode scopes were re-captured against the server heads, their local lineage was reset to the committed heads, and the remaining candidates uploaded successfully. The local outbox is now empty; `lastErrorCode` is null and `lastReportAt` is current.
- Canary: local agent restarted on the new build; `run-once` captured 152 antigravity sessions with no `CAPTURE_LIMIT`, and the commandcode recovery added only new auditable generations. No duplicate commits and no old evidence were rewritten. The tray attention state is now connected; the former “Unknown error” was a UI-label issue for review/held states, fixed to report the actual reason.

## Remaining work

1. **Large-capture split**: the 20,000-record guard is enforced, but a single session above that limit needs a future delta/Merkle protocol; cumulative chunks cannot satisfy the current `recordCount >= parent.recordCount` rule without exceeding the server batch limit.
2. **Source matrix**: `docs/research/sync-source-semantics-matrix.md` was approved by the Owner on 2026-10-28; opencode/zcode/aiusage remain on the existing review path until their mutation rules are exercised.
3. **Rollback note**: production SQLite is schema 3. The previous image expects schema 2, so a code rollback requires the pre-deploy database backup or a compatibility layer.
4. **Owner rebase follow-up**: a server-side owner rebase changes the authoritative head outside the normal receipt flow; the local lineage must be refreshed before the next upload. This run performed that reconciliation explicitly, and stale staging with no receipts was cleared after verification.
