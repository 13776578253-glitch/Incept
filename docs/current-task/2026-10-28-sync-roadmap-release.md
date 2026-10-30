# Sync + Roadmap Release — 2026-10-28

## Scope

Integrated the roadmap surface fix from `main` into the sync release line so production no longer has to choose between the roadmap change and the sync remediation.

- `main` roadmap commit: `8e5e084` (surface navigation tooltip/lock styling, Chinese copy punctuation, toolbar hover states, roadmap tests, Phase 0B audit record)
- Sync branch before merge: `6022c3a`
- Merge commit on `fix/sync-safety`: `fb75fa8`
- Merge was clean; no conflicts.

## Verification

| Check | Result |
|---|---|
| `pnpm --filter @incept/roadmap test` | 76 passed |
| `pnpm --filter web exec vitest run src/features/roadmap/__tests__/roadmap-page.test.tsx` | 8 passed |
| `pnpm --filter @incept/dashboard test` | 299 passed / 2 skipped |
| `pnpm --filter @incept/sync-agent test` | 103 passed |
| sync phase 2 integration | 15 passed |
| sync phase 3 integration | 3 passed / 1 five-minute test skipped |
| `pnpm typecheck` | passed |
| `pnpm lint` | 0 errors / 8 pre-existing warnings |

The phase-3 Windows CLI test needed `PSExecutionPolicyPreference=Bypass` for the test harness; the full suite then passed, including supervisor restart and graceful stop.

## Deployment

- Image tag: `incept-v4-release:20261029-sync8`
- Image digest: `sha256:7a993a587b61cfcbc1f32ee931a857d502354b89aac65adb5ac842b76270bb7a`
- Release directory: `/srv/incept/releases/e4875db`
- Production image: `sha256:7a993a58…`; `current -> /srv/incept/releases/e4875db`
- Production status: `/api/health/ready` 200; revision 1176, receipts 1257, reviews 0, incomplete staging 0
- Sync config verified: `INCEPT_SYNC_TIMEOUT_MS=120000`, `INCEPT_SYNC_MAX_QUEUE=16`, `INCEPT_SYNC_MAX_BATCH_RECORDS=100000`
- Local agent: no active outbox, `lastErrorCode=null`

## Review #36 — CommandCode sessionTitle

Review #36 was a metadata-only change, not a model or usage change:

- Source/session: `commandcode` / `cc-f79e387c-d286-46d2-ad3a-dcf582af0283`
- Candidate: 58 records; 14 existing records changed only by the newly materialized `sessionTitle: "Visualization Optimization"`; all IDs, timestamps, model, project, and token counters were unchanged.
- Owner-approved rebase: old head `1825a4f2…` → new head `4b920397…`, generation `ad8ae3ab…`, 58 records, revision 1109.
- Review #36 was resolved as `accepted-successor` at revision 1110; local lineage was reconciled to the new head and the stale local batch was superseded.
- Server after resolution: reviews 0, staging 0; the local outbox had no active batch.

### Envelope semantics

`sessionTitle` is now excluded from `syncEnvelope` because it is display-only metadata. `qualifyRecords` also accepts canonical envelope equality for a parent record whose stored `envelopeHash` predates this exclusion, so historical title-bearing records do not create another review wave. A regression test covers a commandcode record whose only change is `sessionTitle`; the full dashboard suite is 300 passed / 2 skipped.

## Review #37/#38 — zcode parent mismatch

Two stale-parent zcode batches (5 and 36 records) produced reviews #37/#38. Both were resolved by owner-approved rebase:

- #37: session `sess_d001dd59…`, long head `f54e5f9a…` → `9baf2337…`, generation `d27a2374…`; review resolution revision 1170.
- #38: session `session_a89c4eb3…`, long head `a1c05e67…` → `f6fc3580…`, generation `a6b50d08…`; review resolution revision 1172.
- Local `reconcile-heads` adopted both heads and superseded the stale lineage batches. The local outbox is empty; zcode outcome is `complete_success`; server reviews 0 and staging 0.

## Dashboard refresh diagnosis

The reported `Refresh failed` was not a sync disconnect. During the upload backlog, Caddy recorded `/api/dashboard/sync/devices/status` as **499 after 3.58s** followed by **429s**, while `/api/dashboard/usage` returned 200 and the agent uploads continued to complete. `devices/status` called `executor.execute({op:'device-summary'})`, which shares the single sync worker/queue with uploads; the dashboard read then aborted or got a queue-full response. Fixed in `e4875db`: `SyncExecutor.readDeviceSummary()` now reads `sync_receipt_clock` through a short-lived read-only SQLite connection, and `remote.ts` uses it directly. The regression test is in `sync-executor.test.ts`; dashboard suite 301 passed / 2 skipped. This is separate from the sync data path and did not lose records.

## Network error diagnosis — 2026-10-30

The tray's `NETWORK_UNAVAILABLE` was a transport-path issue, not a server outage. The public health URL returned 200 through the external fetch path, while this machine measured 27 successes and 3 TLS `ECONNRESET` failures across 30 direct HTTPS checks; SSH to the same host was also intermittently closed. Agent outbox batches were preserved. The agent now retries transient TLS/socket resets up to five attempts with backoff; the regression test uses a server that resets the first two connections. This is a client-network/TUN resilience fix; the server image was not rebuilt for it.

## Remaining

- True delta/segment protocol for sessions above the 100k Merkle-batch ceiling.
- Source-matrix rollout for opencode/zcode/aiusage remains governed by the approved review path.
