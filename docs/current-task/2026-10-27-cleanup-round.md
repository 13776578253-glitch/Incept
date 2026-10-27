# Cleanup Round: Docker Images, Worktrees and Unused Code

## Status

The P2–P6 fixes and the cleanup commits are committed on `main`; `origin/main` has not been updated. Docker and worktrees are cleaned, and the safe code residue is removed. Unmerged branches, the v4/R5 script archive and the docs archival still need an owner decision. Production remains on `20261027` (`88aeaa4c`) and all four containers are healthy.

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

P5’s Owner visual acceptance was confirmed before this round.

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
- The other worktree branches were deliberately kept; see “Remaining Decisions”.

## Code Residue Removed

- 13 unused mock files under `apps/web/src/lib/mock/`; `mock-types.ts` was kept because the Home feature imports it.
- `scripts/audit-commandcode-peak-reconciliation.mjs` and `scripts/parse-recent-usage.mjs`, both with zero callers.
- Empty retired route directories: `create`, `resources`, `studio`, `docs/style-lab`, `workspace/docs/library`.
- Stale local artifacts: `packages/dashboard/dist/phase2-fixtures.mjs`, `token-transfer.zip`, `.scratch/incept-20261023.tar`, the empty root `scratch/` directory, and stale Prisma engine `.tmp` files.

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
| `git status` after cleanup commits | clean before this record |

## Remaining Decisions

1. **Unmerged local branches** (12): `backup/phase5-sync-hotfix-20261019`, `hotfix/phase5-sync-20261018`, `release/phase5-20261017`, `release/phase5-caddy-20261018`, `wip/phase5-snapshot-20261017`, `snapshot/2026-10-17-phase4-operations`, `feature/sync-agent-phase5`, `feature/sync-agent-v2` are historical phase5/snapshot branches; `codex/consolidate-v4-20261020`, `codex/production-readiness`, `feature/operations-console`, `feature/sync-tray` need a keep/delete ruling.
2. **v4/R5 script suite**: 20 historical tools plus `scripts/README-v4-history.md` have no live callers. Decide whether to delete the closed subset or move the whole family to `scripts/archive/`.
3. **Docs cleanup**: `docs/current-task/` is now above the 20-record threshold; the earlier audit identified 23 completed records for `finish-task/`, plus finished plans, `docs/research/` placement, `docs/audit_15_issues_report.md`, and stale B-09 / `OWNER_ACCESS_SECRET` / INDEX / NEXT references.
4. **Remaining code-review items**: orphan tests (`owner-local.test.mjs`, `prepare-auto-sync-candidate.test.mjs`), the broken sync-gateway phase-4 harness, and the `pricing-temporary.ts` refactor.
5. **Docker volumes**: three volumes remain (167.9 MB, 99.8 MB reclaimable). They were not deleted because they may contain content/recovery data.
6. **Remote branches**: `origin/codex/consolidate-v4-20261020` and `origin/codex/production-readiness` were kept; deleting them is a shared-state action.
