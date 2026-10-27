# Cleanup Round: Docker Images, Worktrees and Unused Code

## Status

The P2–P6 fixes and the full cleanup are committed on `main`; `origin/main` has not been updated. Docker, worktrees, the selected branches, the v4/R5 script archive and the docs cleanup are done. Production remains on `20261027` (`88aeaa4c`) and all four containers are healthy. The remaining items are deployment/reboot verification and a few deferred code-review decisions.

## Commits

| Commit | Subject |
| --- | --- |
| `786ef96` | `fix(web): serve trusted v2 usage from the published snapshot` |
| `2d53aea` | `fix(ops): honor the explicit ledger watermark path` |
| `b16ef0b` | `fix(sync-tray): make login auto-start resilient` |
| `024d13d` | `chore(deps): align eslint-config-next with Next.js 16.4.3` |
| `cf1f9e1` | `docs(current-task): record the P2-P6 follow-ups and P5 acceptance` |
| `75a5d06` | `refactor(web): remove unused mock data` |
| `5a06fde` | `chore(scripts): remove unreferenced usage analysis scripts` |
| `1c4f7fd` | `chore(scripts): archive the historical v4/r5 tooling` |
| `71ac2d2` | `docs(current-task): archive completed task records` |
| `4cef4c6` | `docs: retire stale style lab and owner-secret references` |

The final record update is committed separately; the repository log contains its hash. P5’s Owner visual acceptance was confirmed before this round.

## Docker Cleanup

Removed:

- Stopped containers `incept-staging-app` and `incept-recovery-validation-20261014-postgres-1`.
- Images `incept-sync-trusted:mvp-r3`, `incept-sync-phase5:hotfix-199a58d`, `incept-sync-phase5:caddy-82c613b`, `incept-sync-phase5:caddy-17592df`, `incept:fix-20261016-1a29a92`, `incept:20261015-7bee9ad`, `incept-final:20261014`, `hello-world:latest`.
- Build cache (1.493 GB) and network `incept-recovery-validation-20261014_default`.
- Release directories `v4-20261020-display`, `v4-auto-sync-20261020`, `v4-auto-sync-fix-20261020-r1`, `82c613b`.
- Incoming directories `98b77ff`, `content-20261014`, `release-2-20261015-7bee9ad`, `release-2-fix-20261016-1a29a92`; old tar `incept-20261025.tar`.

Kept:

- `incept-v4-release:20261027` (`88aeaa4c`, running) and `incept-v4-release:20261025` (`55052cb2`, rollback).
- `caddy:2.11.7-alpine`, `postgres:16-alpine`, all three volumes, network `incept_default`.
- Release directories `973e714` and `7622ede`; `incept-20261027.tar`, both `release-*.tar.gz` packages and small ops files.

Result: disk `32G/39G` used (81%, 7.7G free) → `17G/39G` used (43%, 23G free). Four images, four running containers, zero build cache. `/api/health/ready` remains 200.

## Worktree Cleanup

Removed six clean worktrees, about 4.8 GB total: `consolidate-v4`, `phase5-caddy-release`, `phase5-release`, `sync-agent-phase5`, `sync-tray`, `trusted-sync`. `git worktree list` now contains only the main checkout, and `.worktrees/` is gone.

- `feature/trusted-sync` and `backup/trusted-sync-20261019` were fully merged and were deleted with `git branch -d`.
- Per the owner ruling, deleted eight historical branches and kept four candidates:
  - deleted: `backup/phase5-sync-hotfix-20261019` (`b732076`), `hotfix/phase5-sync-20261018` (`b732076`), `release/phase5-20261017` (`4a0ba1a`), `release/phase5-caddy-20261018` (`ecf2421`), `wip/phase5-snapshot-20261017` (`350d878`), `snapshot/2026-10-17-phase4-operations` (`7021583`), `feature/sync-agent-phase5` (`834f8a9`), `feature/sync-agent-v2` (`834f8a9`).
  - kept: `codex/consolidate-v4-20261020`, `codex/production-readiness`, `feature/operations-console`, `feature/sync-tray`.

## Code Residue Removed

- 13 unused mock files under `apps/web/src/lib/mock/`; `mock-types.ts` was kept because the Home feature imports it.
- `scripts/audit-commandcode-peak-reconciliation.mjs` and `scripts/parse-recent-usage.mjs`, both with zero callers.
- Empty retired route directories: `create`, `resources`, `studio`, `docs/style-lab`, `workspace/docs/library`.
- Stale local artifacts: `packages/dashboard/dist/phase2-fixtures.mjs`, `token-transfer.zip`, `.scratch/incept-20261023.tar`, the empty root `scratch/` directory, and stale Prisma engine `.tmp` files.
- Moved 32 historical v4/R5 scripts and their README to `scripts/archive/`; `check-v4-isolation.mjs` and `local-r5-state-migration-rehearsal.mjs` remain live for `test:ops`. Relative imports and docs paths were updated; all archived `.mjs` files pass `node --check`.
- Archived 23 completed `current-task` records to `finish-task` and repaired directory-qualified and handover links; `current-task` now holds four active records.
- Rewrote B-09 as retired and repointed B-05/B-31; replaced stale `OWNER_ACCESS_SECRET` guidance with the account + TOTP flow; registered `research/` and the flat runbooks in `INDEX.md`; trimmed the `NEXT.md` history.

Local-only personal data was left untouched: `token-export-2026-10-21T14-23-48-055Z.json`, `.docs-import-drafts/`, `output/`, and `.scratch/owner-local-private/`.

## Accidental Deletion and Recovery

While removing a worktree, `Remove-Item -Recurse` followed a junction into the main checkout. It emptied `packages/dashboard`, deleted `packages/db/.env.example`, and removed the local ignored `packages/db/.env`.

Recovery:

- `git restore --source=HEAD -- packages/dashboard packages/db/.env.example` restored 198 tracked files.
- 131 files initially appeared as `M`; their worktree and index hashes matched, so the status was a CRLF/stat-cache artifact. `git add -- packages/dashboard packages/db/.env.example` refreshed the index without staging content changes.
- `packages/db/.env` was recreated locally from `apps/web/.env.local` with the local proxy port `15432`; it is ignored and not committed. It contains only `DATABASE_URL`; restore any additional local keys if the original file had them.
- `pnpm install --force --prefer-offline` restored 707 packages; `pnpm --filter @incept/dashboard build:runtime` rebuilt both workers.
- The forced install reported ignored build scripts for `@parcel/watcher`, `@prisma/client`, `@prisma/engines`, `@swc/core`, `esbuild`, `prisma` and `unrs-resolver`. Typecheck, dashboard tests and `build:runtime` pass; run `pnpm approve-builds` if a native/Web build later fails.
- `pnpm db:generate` failed with `EPERM` because the running `next dev` process holds `query_engine-windows.dll.node`. The existing generated client works and typecheck/tests pass. Rerun generation after stopping the dev server; seven stale `.tmp` engine files were removed.
- The running `next dev` process was not stopped.

## Verification

| Check | Result |
| --- | --- |
| `pnpm --filter web test` | 135 passed / 55 skipped |
| `pnpm --filter @incept/dashboard test` | 283 passed / 2 skipped |
| `pnpm typecheck` | full workspace passed |
| `pnpm lint` | 0 errors / 9 pre-existing warnings |
| `pnpm test:ops` | 157 passed / 1 skipped |
| Tray `tools/test.ps1` | 51 passed / 0 failed |
| Production `/api/health/ready` | 200; app, gateway, proxy and postgres healthy |
| `docs/current-task` | 4 active records (P1, P2–P6, handover, cleanup) |
| `git worktree list` | only the main checkout |
| `git branch` | `main` + 4 kept candidates |
| Archived script syntax | all `scripts/archive/*.mjs` pass `node --check` |
| Docs link check | moved-record links repaired; 16 pre-existing broken links remain (missing assets / HTML false positives) |
| `git status` after cleanup commits | clean before this record |

## Remaining Follow-Ups

1. **Deployment/reboot:** P1’s real deployment/load check, P2/P6’s next image, and the P3 Windows reboot check remain.
2. **Docker volumes:** three volumes remain (167.9 MB, 99.8 MB reclaimable); they were not deleted because they may contain content/recovery data.
3. **Remote branches:** `origin/codex/consolidate-v4-20261020` and `origin/codex/production-readiness` were kept; deleting them is a shared-state action.
4. **Code-review items:** the orphan `scripts/owner-local.test.mjs`, the broken sync-gateway phase-4 harness, and B-31’s pricing adapter consolidation.
5. **Docs residue:** 16 pre-existing broken links remain (missing assets / HTML false positives); finished plans and the flat audit report were left in place.
