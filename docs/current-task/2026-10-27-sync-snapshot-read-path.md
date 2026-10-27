# Sync Projection Read Path: Snapshot-First Owner Reads And Debounced Publication

## Status

Committed in `786ef96`. Targeted suites, full workspace typecheck, lint and `git diff --check` pass. **Not deployed**; production still runs `20261027` (`973e714`). Remaining verification is a real deployment plus a load check with the Windows agent.

## Problem

- Production runs `INCEPT_SYNC_ENABLED=1`, `INCEPT_SYNC_REMOTE_ENABLED=1`, `INCEPT_SYNC_READ_MODE=v2`, `INCEPT_SYNC_TRUSTED_MODE=1`.
- Owner `/api/dashboard/usage` was routed through `syncUsageGet`, which executed `op: 'projection'` on every request. That full projection shares the single `SyncExecutor` worker with device commits.
- Every commit also called `refreshTrustedDashboardSnapshots()` immediately, so a backfill of N batches queued N four-range projections behind the commit stream.
- Public and Pro reads already used the published snapshot generation. The Owner path was the remaining bypass.

## Changes

1. `apps/web/src/server/sync/usage.ts`
   - Trusted `v2` Owner reads now come from `readDashboardSnapshot(range)`.
   - A missing snapshot, or a snapshot whose `sync.dataRevision` is below `minRevision`, returns the existing `503 SYNC_PROJECTION_UNAVAILABLE` failure instead of silently falling back to a live projection.
   - `shadow` and untrusted `v2` keep the live projection path; `shadow` still compares the legacy response with v2.
2. `packages/dashboard/src/adapters/runtime/snapshot-store.ts`
   - Commit notifications now schedule a trailing snapshot refresh with a 1.5s quiet window and a 10s maximum wait.
   - A manual or read-triggered `refreshTrustedDashboardSnapshots()` cancels the pending timer and reuses the existing single-flight refresh promise.
   - Publication remains atomic and revision-checked; the receipt ACK path is unchanged.
3. Tests
   - `apps/web/src/server/sync/__tests__/usage.test.ts` (new): trusted v2 snapshot read, missing snapshot, stale `minRevision`, shadow live projection, untrusted v2 fallback.
   - `packages/dashboard/src/__tests__/trusted-snapshots.test.ts`: three rapid receipts produce one `projection-snapshots` job at the latest revision.

## Verification

- `pnpm --filter web test` → 30 files passed / 5 skipped; 135 tests passed / 55 skipped. The new usage test file is included.
- `pnpm --filter @incept/dashboard test` → 44 files passed / 1 skipped; 283 tests passed / 2 skipped. The new coalescing test is included.
- `pnpm typecheck` (full workspace chain) → passed.
- `pnpm --filter web exec eslint "src/server/sync/usage.ts" "src/server/sync/__tests__/usage.test.ts"` → no findings.
- `git diff --check` → clean.
- Read-only production self-check before the change: `/api/health/ready` 200, `/api/dashboard/usage` 200 with a fresh `updatedAt`, and the app env flags confirmed as `1/1/v2/1`.

## Remaining Verification

- Build the `linux/amd64` image, deploy, and confirm the Owner dashboard still returns data without `SYNC_PROJECTION_UNAVAILABLE`.
- Run a real backfill or burst of commits with the dashboard open; confirm receipt ACKs are not delayed and that publication coalesces.
- Confirm the expected display lag: about 1.5s after a quiet period, bounded by the 10s maximum wait under continuous commits. The max-wait branch is implemented but not separately timed in the test suite; the burst-coalescing branch is tested.
- No schema or migration change. Rollback is the previous image and release directory.

## Notes

- The single-writer SQLite model is unchanged. This round removes per-request projection and the per-commit projection burst; it does not isolate a single heavy projection from the commit worker.
- If a future backfill still shows commit starvation from one large projection, the next step is the separate projection worker option (P1-B), not another read-path patch.
