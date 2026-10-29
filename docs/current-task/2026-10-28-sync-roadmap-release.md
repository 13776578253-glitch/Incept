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

- Image tag: `incept-v4-release:20261028-sync6`
- Image digest: `sha256:a5003d4f55d7ff754afe4b6122cea228f8a6de256b9b545a10109cf2e221821d`
- Release directory: `/srv/incept/releases/043bc5f`
- Production image: `sha256:a5003d4f…`; `current -> /srv/incept/releases/043bc5f`
- Production status: `/api/health/ready` 200; revision 1096, receipts 1174, reviews 0, incomplete staging 0
- Sync config verified: `INCEPT_SYNC_TIMEOUT_MS=120000`, `INCEPT_SYNC_MAX_QUEUE=16`, `INCEPT_SYNC_MAX_BATCH_RECORDS=100000`
- Local agent: dataRevision 1096, no active outbox, `lastErrorCode=null`

## Remaining

- True delta/segment protocol for sessions above the 100k Merkle-batch ceiling.
- Source-matrix rollout for opencode/zcode/aiusage remains governed by the approved review path.
