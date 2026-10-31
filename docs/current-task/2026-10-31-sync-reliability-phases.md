# Sync Reliability And Performance: Baseline, Correctness, Metrics

Date: 2026-10-31 (Asia/Singapore)

## Scope

This record captures the execution of the first four phases requested from the sync architecture investigation:

1. unify the trusted code baseline;
2. verify automatic synchronization correctness and safe head-lag recovery;
3. accept the direct-read/SWR changes and add executor telemetry before considering a second worker;
4. defer true delta synchronization until real workload proves full snapshots are the primary bottleneck.

## Phase 1: Trusted Baseline

### Commits

- `main` before this work: `5e881e3` (documentation-only commits after `8e5e084`).
- `fix/sync-safety`: `355987a` (code fixes plus the earlier dashboard SWR/performance commit).
- `main` after merging the safety branch: `2d220df` (`merge(sync): unify main with sync safety fixes`).
- New worktree: `.worktrees/sync-reliability-perf`.
- New branch: `fix/sync-reliability-perf`.
- Final validated phase head: `4ef3784`; `main` was fast-forwarded to this commit after the final test run.

The merge included the 18 code commits described in the investigation report and the two documentation/test commits made on `main` (`2934f1e`, `f34470b`). The only merge conflict was the handover document; both notes were retained.

### Production evidence and limitation

- Public `/api/health/ready`: HTTP 200 `{"status":"ready"}` on 2026-10-31.
- Public `/api/dashboard/usage?range=30d`: HTTP 200, `updatedAt=2026-10-31T08:20:57Z`, `checkedAt=2026-10-31T08:20:59Z`, 441 sessions.
- SSH to `root@43.155.136.83:22` was repeatedly closed by the local network path (the same Mihomo/TUN issue recorded earlier). Therefore the live Docker image digest/release symlink could not be independently inspected in this run.
- Recorded production release evidence in the deployment notes remains: image `sha256:7a993a58...`, release `e4875db`, schema 3, revision 1176 at the time of that deployment. This is **recorded evidence**, not a new live inspection.
- No production deployment was performed in this phase.

### Verification

| Check | Result |
|---|---|
| `pnpm --filter @incept/dashboard test` | 51 files passed / 1 skipped; 324 tests passed / 2 skipped |
| `pnpm --filter @incept/sync-agent test` | 106 passed |
| `pnpm --filter web test` | 31 files passed / 5 skipped; 137 passed / 55 skipped |
| `pnpm test:ops` | 157 passed / 1 skipped |
| `pnpm typecheck` | passed |
| `pnpm lint` | 0 errors; 8 existing warnings |
| `pnpm --filter web build` | passed |

The skipped web suites are the existing PostgreSQL/remote integration suites gated by test database environment variables. They were not run against a local PostgreSQL instance.

The two empirical tests brought in from `main` originally asserted the old broken behavior. They were updated on the new branch to assert the remediated behavior: `sessionTitle` no longer changes the envelope, a permanent failure no longer cascades `review` to later batches, and the store parent checks are validated structurally instead of by brittle line numbers.

## Phase 2: Automatic Synchronization Correctness

### Review #36

- `syncEnvelope` excludes display-only `sessionTitle`.
- Historical title-bearing records are accepted through canonical envelope equality.
- Regression coverage: `sync-source-semantics.test.ts` and `empirical-challenger-m2.test.ts`.
- Result: title-only updates do not produce `REVISION_ENVELOPE_CHANGED`.

### Historical integrity, cross-device ownership, lineage and outbox

- `sync-projection.test.ts` verifies zero complete DTO differences in 7d/30d/all, stale v1 fail-closed behavior and native collector priority.
- `sync-review-audit.test.ts` replays accepted reviews against historical parents and preserves missing/ambiguous evidence as findings.
- `verify-lineage.test.mjs` verifies 359 scopes/receipts and fails closed on empty, duplicate, corrupt or mismatched evidence.
- `sync-trusted.test.ts` verifies that a second device cannot claim the same origin without an explicit Owner binding (`ORIGIN_OWNERSHIP_CONFLICT`).
- `agent.test.mjs` covers durable outbox replay, review resolution, exact receipt acknowledgement and offline planned parents.
- `harness-capture.test.ts` and `imports.test.ts` cover idempotent replay and cross-device import identity behavior.

### Automatic head-lag recovery

Added `reconcileHeadLag()` in `apps/sync-agent/src/review.ts` and wired it before capture/upload in `SyncEngine`.

It is deliberately conservative:

1. it only runs for scopes that currently have a `lineage` batch;
2. it refuses scopes with review, held or quarantined work;
3. it requires a newer `pending` candidate whose parent is exactly the server's current head;
4. it requires the candidate to be an `observe` manifest with at least as many records as the server head;
5. it supersedes only older pending/lineage rows, keeps the newest candidate, clears stale lineage/token state and records the current head;
6. the retained candidate still goes through normal server parent/proof/evidence validation;
7. a network or head lookup failure leaves lineage untouched for the next cycle.

If any condition is not provable, the function returns a skip reason and leaves the existing manual `reconcile-heads --confirm-reviewed` path in place. The recovery is recorded in `lastHeadLagRecovery` in agent status.

Tests:

- latest pending parented to the server head: older lineage is superseded, the newest candidate remains pending, head is adopted;
- no newer candidate: lineage remains and the result is `NO_NEWER_CANDIDATE`;
- an unresolved review/held/quarantined scope is skipped.

## Phase 3: Read Path And Performance Metrics

### Accepted read behavior

- `readDeviceSummary()` bypasses the upload queue; `sync-executor.test.ts` verifies it.
- SWR tests verify a stale complete snapshot returns immediately while projection is pending, and only explicit/`minRevision` reads wait.
- Dashboard SSR no longer awaits projection when a prior snapshot exists, and hydration does not issue a duplicate usage request.
- The metadata has `executor` telemetry on the owner `/devices/status` response and the maintenance status already exposes DB/WAL/SHM and memory capacity.

### Executor metrics added

`SyncExecutor.state()` now includes:

- `queueLength`, `running`;
- `lastQueueWaitMs`, `peakQueueWaitMs`, `queueWaitTotalMs`, `queueWaitSamples`;
- `lastExecutionWallMs`, `lastWallMs`, `lastWriteWallMs`, `lastCommitWallMs`, `lastProjectionWallMs`;
- `processRssBytes`, `mainRssBytes`, `workerHeapBytes`;
- `dbBytes`, `walBytes`, `shmBytes`;
- `busyRetries`, completed/failed/lastFailure.

### Local probe (not production)

A temporary 5,000-record trusted executor probe, since removed, produced:

- 12 staged pages; no queue wait observed in the sequential phase;
- commit: worker wall 254ms; execution wall 254ms; DB 12.2MB; WAL 0 after the probe checkpoint;
- projection-snapshots: worker wall 810ms; execution wall 811ms;
- RSS: 142MB before commit, 168MB after commit, 208MB after projection;
- worker heap: 25MB → 31MB → 35MB;
- queue wait metric test uses a deliberately delayed first job and observes a non-zero peak queue wait.

These are local measurements, not production capacity evidence. Production RSS/WAL/queue values still need to be collected from the deployed build.

### Dual-worker decision

Not implemented in this phase.

Current evidence:

- direct read removes the dashboard from the upload queue;
- SWR removes the normal page read from the projection wait;
- the local 5k projection is 810ms and commit 254ms;
- a second worker adds concurrent SQLite/WAL behavior and memory pressure to a 768MB app container and 2GB host. The investigation's own proposal is 128MB writer + 128MB reader + 256MB web, with only ~256MB headroom, before native/runtime overhead.

Decision gate before implementing a separate reader worker:

- production `peakQueueWaitMs` consistently above 2 seconds, or
- `lastProjectionWallMs` consistently above 10 seconds, or
- commit/push latency causing client timeouts after SWR/direct-read, or
- WAL growth or RSS approaching the container limit.

Until those measurements exist, do not add a second writer/reader. First deploy the metrics and observe the 768MB container under real sync + dashboard load.

## Phase 4: Incremental Protocol Decision

Not implemented. The existing 100k Merkle-verified full-snapshot path has no measured production evidence that it is the primary bottleneck. A true delta/segment protocol would change manifest validation, sequence/segment proofs, staging and database reuse semantics; it should not be introduced speculatively.

Evaluation gate:

- a session exceeds 100k records, or
- upload bytes/time for unchanged historical prefix dominate a sync cycle, or
- the production projection/commit metrics show full-snapshot work is the limiting factor after the read/write fixes.

If the gate is met, the design should follow the investigation document's segmented Merkle approach and the mathematical position-slicing path; it should not be bolted onto the current manifest without a schema and evidence migration plan.

## Remaining Risks

- SSH from this machine is still interrupted; live image/release verification and production metric collection remain pending.
- Production PostgreSQL integration suites are skipped locally and need an isolated database.
- Automatic head-lag recovery handles only the case where a newer full candidate already names the current head. Other ancestry changes still require manual Owner reconcile.
- The sync worker remains shared for writes and projection; SWR avoids request blocking but does not isolate CPU-heavy projection from upload latency.
- Review #36 and other semantic fixes are deployed in the prior production release, but this branch has not been deployed after the new auto-recovery and metrics changes.
