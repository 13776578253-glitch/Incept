# Dashboard LCP: Snapshot Stale-While-Revalidate And Mount Request Deduplication

## Status

Implemented in the `fix/sync-safety` worktree. Dashboard and web tests, typechecks, lint (warnings only) and the production web build pass. **Not deployed and no post-change browser/Lighthouse measurement has been run.** The pre-change Chrome numbers in this note are the measurements supplied with the task, not results of this change.

## Confirmed Root Cause

The reported 7.26s LCP was not client CPU work: INP was 2ms, the main thread had about 16ms of script and 18ms of render, while the document TTFB was 3,506ms and the LCP element render delay was 3,754ms.

The blocking chain was:

1. `packages/dashboard/src/next/dashboard-page.tsx` calls `readDashboardSnapshot('30d')` during dashboard SSR.
2. `packages/dashboard/src/adapters/runtime/snapshot-store.ts` called `refreshTrustedDashboardSnapshots()` before every read.
3. When the stored snapshot revision or Singapore day was stale, `refreshTrustedDashboardSnapshots()` queued `op: 'projection-snapshots'` on the shared `SyncExecutor` worker and awaited it.
4. The same worker accepts device commits. Under sync load or continuous revision changes, the page waited several seconds for publication even though a complete previous generation was already on disk.
5. `apps/web/src/server/sync/usage.ts` used the same read path for trusted v2 usage, so `/api/dashboard/usage` could block again.
6. `TokenDashboardFeature` received `initialStatus='history'` whenever a server snapshot existed, which set `refreshOnMount` and immediately requested usage after hydration. That duplicated the server read and could trigger the same worker path.

This is a display read-path problem, not a sync correctness or data-loss problem. Publication remains atomic and revision-checked.

## Changes

### P0: Read the published snapshot, refresh in the background

- `readDashboardSnapshot(range, {waitForFresh:false})` now returns the last complete published generation immediately when it exists.
- A stale generation schedules the existing debounced, single-flight snapshot refresh; the request does not await it.
- The existing persisted snapshot is the fallback if the background refresh fails; the next read/revision notification schedules another attempt. No in-memory `void Promise` is the source of truth.
- When no snapshot exists at all, the read still waits for the first generation rather than returning an empty page.
- `waitForFresh:true` remains the path for explicit reads that require a current revision.
- `scheduleTrustedDashboardRefresh()` does not stack a timer while a refresh job is already active.
- Atomic `publish()` checks, revision/day validation, revision-change retries and the single-flight map are unchanged.

Callers now opt into the fast path explicitly:

- SSR dashboard: `waitForFresh:false`.
- Public usage read: `waitForFresh:false`.
- Trusted v2 owner usage: `waitForFresh = minimumRevision > 0`, so a client that just completed a remote refresh still waits for the required revision.
- Manual/forced refresh: `waitForFresh = force`.

### P1: Remove the duplicate mount usage request, keep device status

- A server-rendered snapshot is passed to `TokenDashboardFeature` as `initialStatus='live'`, so hydration no longer performs an unconditional `/api/dashboard/usage` request.
- The normal five-minute poll, visibility revalidation, manual refresh and revision checks remain.
- A live mount still performs one lightweight `/api/dashboard/sync/devices/status` request through the new `loadRemoteOnMount` option. This keeps the device pill and sync timeline visible without requesting usage or starting a projection.
- The empty-first-load path still uses `initialStatus='empty'` and waits for the first snapshot.

## Verification

- `pnpm --filter @incept/dashboard test` -> 49 files passed / 1 skipped; 308 tests passed / 2 skipped.
- `pnpm --filter web test` -> 31 files passed / 5 skipped; 137 tests passed / 55 skipped. The skipped suites are the existing database/remote integration suites that require their environment variables.
- `pnpm --filter @incept/dashboard typecheck` -> passed.
- `pnpm --filter web typecheck` -> passed.
- `pnpm lint` -> 0 errors; 8 existing warnings unrelated to this change.
- `pnpm --filter web build` -> passed.
- Added focused coverage:
  - stale published generation returns without waiting for a slow projection, then refreshes in the background;
  - no snapshot still waits for the first generation;
  - `waitForFresh` reads the current generation;
  - SSR page passes `initialStatus='live'` and does not request usage on mount;
  - live mount loads device status only;
  - trusted v2 usage passes the correct wait flag for normal and `minRevision` reads.

## Performance Expectations And Measurement Status

The change removes the two blocking waits that appeared in the Chrome trace:

- dashboard SSR no longer waits for `projection-snapshots` when a previous generation exists;
- hydration no longer requests `/api/dashboard/usage` immediately after SSR.

Expected direction: TTFB should become the cost of reading the published snapshot plus normal request/auth work, not a worker projection. This is an expectation, not a measured result. The 2.5s LCP / 800ms TTFB targets are **not verified** until the branch is deployed and measured with the same browser profile and network.

Reproduction for the post-deploy measurement:

1. Deploy this branch to the target environment; keep the existing sync worker and snapshot file in place.
2. Open Chrome DevTools Performance with cache disabled and the same network profile used for the 7.26s trace.
3. Load `/en/dashboard`, then navigate to `/en/roadmap` and back.
4. Record LCP, TTFB, INP and the document/usage/devices requests.
5. Confirm the initial dashboard request has no unconditional `/api/dashboard/usage` call; a `/devices/status` call is expected.
6. Confirm `Refresh now` still reaches a revision that satisfies `minRevision` and that the device status remains visible.

## Risks And Compatibility

- A stale snapshot can be displayed for the background-refresh interval. The `Data updated` timestamp remains the source of truth; the server retries on a later read if the background refresh fails.
- Background refresh is process-local scheduling over a persisted snapshot. If the process exits before the timer starts, the next request re-schedules it; no data is lost.
- Manual refresh and `minRevision` reads still wait, so revision visibility and review/lineage guarantees are not bypassed.
- Sync upload, commit receipts, review decisions, lineage and snapshot atomic publication are unchanged.
- The sync worker is still shared with snapshot projection. This change removes request blocking; it does not give projection a separate worker/priority.

## Remaining Work

- Measure the actual post-deploy TTFB/LCP and the LCP element identification; do not treat the expected reduction as measured.
- If navigation remains slow, evaluate route prefetch/Suspense/loading (P2) and a separate projection worker/priority. Those are not implemented because the current evidence points to the read/refresh coupling first.
