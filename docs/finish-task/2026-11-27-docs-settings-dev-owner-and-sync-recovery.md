# 2026-11-27 Settings Docs UX Polish, Local Dev Auto-Owner Session, and Sync Recovery

## Summary

Completed local acceptance and production rollout for three connected tracks:

1. **Settings → Docs Management UX Polish**
   - Replaced inline table-row editing with a native modal `<dialog closedby="any">` (`apps/web/src/features/settings/docs/components/docs-metadata-edit-dialog.tsx`) featuring 1-click segmented `访客 / 临时准许 / 私人` radio selection, preventing row-height jumping and table reflow during edits.
   - Guarded React 19 `<StrictMode>` unmount/remount async `close` event (`if (dialog.open) return;`) and verified with a dedicated `<StrictMode>` Vitest regression test (`apps/web/src/features/settings/docs/__tests__/docs-library-table.test.tsx`).
   - Fixed curation filter tab alignment (`全部 / 已加入 / 未加入`), shortened `类型` labels to two characters (`单篇` / `合集`), rebalanced table columns so `打开路由 ↗` no longer overflows the card edge.
   - Eliminated pagination scroll-to-top jump and flicker on both `首页精选白名单` and `已发布 docs 条目` via `[overflow-anchor:none]`, stable minimum body height when `totalPages > 1`, and `scrollY` preservation (`docs-pagination-footer.tsx`).

2. **Local Dev Auto-Owner Session Injection (Option A)**
   - Added `scripts/dev-owner-session.mts` (`pnpm auth:dev-owner`, supporting `--status`, `--revoke`, `--ttl-days`) to mint/reuse a real local PostgreSQL `OwnerSession` row and persist `INCEPT_DEV_AUTO_OWNER=1` + `INCEPT_DEV_OWNER_SESSION_TOKEN` into gitignored `apps/web/.env.local`.
   - Added `apps/web/src/server/auth/dev-owner.ts` wired into `apps/web/src/server/auth/viewer.ts`, enforced by 4 hard guards: `NODE_ENV === 'development'`, `INCEPT_DEV_AUTO_OWNER === '1'`, loopback `DATABASE_URL`, and `>= 32`-char valid DB session token.
   - Added logout bypass cookie (`incept_dev_skip_auto_owner=1`) in `apps/web/src/app/api/auth/logout/route.ts` and 1-click re-enable endpoint `apps/web/src/app/api/dev/owner-login/route.ts` (404 outside dev auto-owner mode).
   - Documented usage and security boundaries in `docs/runbooks/zh/owner-account-aegis.md` (Section I).

3. **Local Sync Agent Incident Recovery (Operational)**
   - Resolved recurring `CYCLE_FAILED` caused by 9 aligned `codex` rows in local `state.db` missing the `proofs` array (`proof` instead of `proofs: [{ range }]`), plus 9 `antigravity` rows with stale `proofs[].range`.
   - Reconciled active `antigravity` scope `25d321ed-78e5-40cc-9202-dcd8f657bd57` against live server `/api/dashboard/sync/scopes/resolve` (`rev 4572`), superseding 9 stale batches built on rewound `rev 4571`.
   - Verified live recovery: `dataRevision` advanced cleanly to `4573`, `lastErrorCode: null`, `remoteError: null`, `outbox` `0` pending/lineage/review, and `agent.log` reporting `CYCLE_FINISHED`.

## Validation

- `pnpm lint`
- `pnpm typecheck`
- `pnpm typecheck:scripts`
- Targeted Vitest suites (`docs-library-table`, `docs-home-curation-panel`, `metadata/route`, `curation/route`, `dev-owner`, `owner-security`, `sensitive-imports`)
- Local acceptance on `http://127.0.0.1:3000/zh/settings?section=docs` with zero-login Owner session
- Production Linux/amd64 image built from clean `git archive`, loaded and deployed on `43.155.136.83`, live HTTPS health and containers verified.
