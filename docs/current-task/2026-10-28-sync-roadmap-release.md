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

- Image tag: `incept-v4-release:20261029-sync7`
- Image digest: `sha256:83d906947ebff0161bc00a5739087f241554d8220dfb62c57eff382a32f82d7c`
- Release directory: `/srv/incept/releases/1433891`
- Production image: `sha256:83d90694…`; `current -> /srv/incept/releases/1433891`
- Production status: `/api/health/ready` 200; revision 1113, receipts 1192, reviews 0, incomplete staging 0
- Sync config verified: `INCEPT_SYNC_TIMEOUT_MS=120000`, `INCEPT_SYNC_MAX_QUEUE=16`, `INCEPT_SYNC_MAX_BATCH_RECORDS=100000`
- Local agent: dataRevision 1113, no active outbox, `lastErrorCode=null`

## Review #36 — CommandCode sessionTitle

Review #36 was a metadata-only change, not a model or usage change:

- Source/session: `commandcode` / `cc-f79e387c-d286-46d2-ad3a-dcf582af0283`
- Candidate: 58 records; 14 existing records changed only by the newly materialized `sessionTitle: "Visualization Optimization"`; all IDs, timestamps, model, project, and token counters were unchanged.
- Owner-approved rebase: old head `1825a4f2…` → new head `4b920397…`, generation `ad8ae3ab…`, 58 records, revision 1109.
- Review #36 was resolved as `accepted-successor` at revision 1110; local lineage was reconciled to the new head and the stale local batch was superseded.
- Server after resolution: reviews 0, staging 0; the local outbox had no active batch.

### Envelope semantics

`sessionTitle` is now excluded from `syncEnvelope` because it is display-only metadata. `qualifyRecords` also accepts canonical envelope equality for a parent record whose stored `envelopeHash` predates this exclusion, so historical title-bearing records do not create another review wave. A regression test covers a commandcode record whose only change is `sessionTitle`; the full dashboard suite is 300 passed / 2 skipped.

## Remaining

- True delta/segment protocol for sessions above the 100k Merkle-batch ceiling.
- Source-matrix rollout for opencode/zcode/aiusage remains governed by the approved review path.
