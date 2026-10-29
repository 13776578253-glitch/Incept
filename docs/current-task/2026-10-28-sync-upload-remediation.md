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
| `pnpm --filter @incept/dashboard test` | 299 passed / 2 skipped (50 files; includes 25k Merkle batch) |
| `pnpm --filter @incept/sync-agent test` | 103 passed / 0 failed (includes resolved-review, reconcile-heads and lineage/recovery tests) |
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
- Dashboard refresh fix: `/api/dashboard/sync/devices/status` was returning 428 after the five-minute recent-auth window because read-only GETs also called `requireRecentOwnerSession`. Only mutating owner actions now require recent auth; read-only status/review reads keep the normal owner-session check. Image `sha256:51e38a56d5c2b15c442219d74315dd298737f628f9afb7f8083bf2cfd0a93203` from `a2327c2` is installed at `/srv/incept/releases/a2327c2` (env backup `.env.production.bak-pre-a2327c2`).
- Rebase applied to 11 affected scopes (9 antigravity, 2 zcode) with fresh source captures: revision 869→880, 11 committed `rebase` generations, each parented to the old visible generation. All old rows remain; all 11 visible record sequences are byte-for-byte identical to the pre-rebase backup. Schema is now 3; `PRAGMA integrity_check` is `ok`.
- Owner-approved commandcode rebase for #32–#34 used fresh captures of 445 / 10 / 16 records, created auditable `rebase` generations parented to the old heads, retained every old generation/manifest, and marked each review `accepted-successor`. Revision 880→883; resolutions 883→886.
- Worker timeout tuning after a five-agent concurrent load produced `RESULT_UNKNOWN`: the failed request was an antigravity begin with 23 records, the server returned `BATCH_NOT_FOUND`, and no staging or receipt was created. Server queued/active job timeout is now 120s (was 30s), `INCEPT_SYNC_MAX_QUEUE` is 16 (was 4), and the agent HTTP wait is 120s (was 60s). The retry cleared the error without data loss. Config-only release `91d4832` is current; the app image remains `17c16ba5…`.
- App, gateway and proxy are healthy; `/api/health/ready` is 200; after the auth-fix rollout and review #35 repair, `sync-maintenance status` reports revision 964, 1042 receipts, 0 open reviews, 0 incomplete staging.
- Review #35 repair: antigravity session `015eea61-e793-4823-b93c-33ba15a20a50` was recaptured at 34 records, committed as a new `rebase` generation parented to the old head, and marked `accepted-successor`. The old generation/manifest remain auditable.
- Owner rebase reconciliation is now scripted: `agent.mjs reconcile-heads --state <dir> --confirm-reviewed [--session=<id>]` (agent stopped) reads the committed server head, supersedes stale pending/review/held/lineage candidates, clears old lineage/token state, and adopts the server head so the next capture produces one fresh parented candidate. It refuses to run while the agent is running, skips quarantined scopes, and requires an explicit Owner confirmation.
- Follow-up agent reconciliation: after the owner rebase, the local lineage still pointed at the pre-rebase heads, so replay candidates hit `LOCAL_PARENT_MISMATCH` and stale staging consumed the four-batch device limit. Stale staging was verified to have no receipts and was removed; the affected scopes were re-captured against the server heads, their local lineage was reset to the committed heads, and the remaining candidates uploaded successfully. The local outbox now has no active entries.
- Canary: local agent restarted on the new build; `run-once` captured 152 antigravity sessions with no `CAPTURE_LIMIT`, and the commandcode recovery added only new auditable generations. No duplicate commits and no old evidence were rewritten. The former “Unknown error” tray label was also caused by a stale local tray executable: the installed binary was built at 13:25, before the 18:27 attention-label source change. Rebuilding and restarting the tray produces the correct `Lineage conflict` label; after review #35 was rebased, the lineage/pending pair cleared and the local outbox has no active entries.

## Schema rollback drill

Ran on isolated copies under `/srv/incept/drills/schema3-rollback`; production was not touched. Schema-2 backup `v4.db` (revision 869) starts, checkpoints and writes under old image `sha256:9f0d…`. Old image can read schema 3 in `status`, but its write path fails `SCHEMA_VERSION_MISMATCH`; image-only rollback is therefore unsafe. Current image `sha256:51e38a56…` migrates the schema-2 copy to schema 3 with revision unchanged. Full procedure and restore steps: `docs/runbooks/sync-schema-rollback.md`.

## Large-session Merkle batches

`SyncManifest` now has an optional `merkleRoot`; capture computes it, the server verifies it against the committed records, and old manifests without the field remain valid. The large-batch ceiling is 100,000 records while the existing 500-record/512 KiB page contract is unchanged. A 25,000-record synthetic session is covered end-to-end in `sync-executor.test.ts`. This is a Merkle-verified full-snapshot path, not a per-record delta; a true delta/segment protocol remains the next optimization if a session exceeds 100k or upload bandwidth becomes material.

The deployment image `sha256:17c16ba5fbb7ddc1b5307bdfc90f955ececea40380394defb3548c6bfb4013e0` from `6c7c2d6` is installed at `/srv/incept/releases/6c7c2d6` with `INCEPT_SYNC_MAX_BATCH_RECORDS=100000`; local agent/tray were updated to the matching build.

## Roadmap merge and combined release

`main` (`8e5e084`) was merged into `fix/sync-safety` at `fb75fa8`; the merge was clean and the roadmap surface fix is now on the sync release line. Combined verification: roadmap 76, roadmap page 8, dashboard 299/2 skipped, sync-agent 103, phase 2 integration 15, phase 3 integration 3/1 skipped, typecheck and lint (0 errors). Image `sha256:a5003d4f…` (`20261028-sync6`) is deployed from release `043bc5f`; production is revision 1096 with 1174 receipts, 0 reviews and 0 incomplete staging. Handover: `2026-10-27-agent-handover.md` now marks its 2026-10-27 status as historical.

## Review #36 and envelope semantics

Review #36 was a commandcode metadata change: 14 existing records gained only `sessionTitle: "Visualization Optimization"`; IDs, timestamps, model, project and usage counters were identical. Owner-approved rebase committed the 58-record candidate as generation `ad8ae3ab…` with new head `4b920397…` at revision 1109; review #36 was resolved as `accepted-successor` at revision 1110, local lineage was reconciled, and the batch was superseded. `syncEnvelope` now ignores `sessionTitle`, with canonical-equality acceptance for historical envelopes; regression test added; dashboard suite 300 passed / 2 skipped. The semantics image `83d90694…` from `1433891` is deployed; production revision 1113, receipts 1192, reviews 0, staging 0; local agent at 1113 with no active outbox.

Zcode reviews #37/#38 were stale-parent batches (5/36 records), resolved by owner rebase to heads `9baf2337…`/`f6fc3580…` (generations `d27a2374…`/`a6b50d08…`) at revisions 1169–1172. Local heads were reconciled, the outbox is empty, and server reviews/staging are 0. The dashboard read path was fixed in `e4875db`: `devices/status` now uses `SyncExecutor.readDeviceSummary()` on a short-lived read-only SQLite connection instead of the single upload worker; dashboard suite 301 passed / 2 skipped. Production image `7a993a58…` from release `e4875db` is deployed (revision 1176, reviews 0, staging 0).

## Remaining work

1. **True delta for very large sessions**: Merkle-verified full snapshots support up to 100k records; a segment/delta protocol remains future work if a session exceeds that or bandwidth becomes material.
2. **Source matrix**: `docs/research/sync-source-semantics-matrix.md` was approved by the Owner on 2026-10-28; opencode/zcode/aiusage remain on the existing review path until their mutation rules are exercised.
