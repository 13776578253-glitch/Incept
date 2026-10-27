# Next Stage

This is the short entry point for active product work. Detailed source-code acceptance criteria live in [BACKLOG.md](./BACKLOG.md).

## Active

- **Collection navigation (B-06):** Run real-content acceptance for directory batch replace, rollback, and cross-locale folder labels on top of the implemented folder/article tree. **Recommended as the next round** — it is the only item where the runbook already states the expected behaviour, the source carries two explicit TODO markers, and no real content has exercised it. See `docs/finish-task/2026-09-23-docs-maintenance-and-next-round-handoff.md`.
- **Home content (B-01):** Replace the mock landing page with real published content or a deliberately minimal landing page.
- **Checklist grammar (B-04):** Define multiline and nested Markdown-like checklist behavior.
- **Structured content (B-05):** Design the authoring and rendering contract for tables before adding the block.

## Boundaries

- `docs/BACKLOG.md` is the only source-code TODO inventory.
- Deferred work and completed milestones do not belong in this file.
- Historical implementation records are in `docs/finish-task/`; old plans, schema snapshots and superseded decisions are in `docs/history/`.

## 2026-10-16 Current next steps

The user requested carrying the remaining [post-launch tasks](./finish-task/2026-10-14-post-launch-operations-and-admin-todo.md) into the next plan. Production `7bee9ad`, 21 migrations, Owner/TOTP and public About/activity are now verified in [the production acceptance](./finish-task/2026-10-16-release-2-production-acceptance.md). This section sets the current priority over the historical ordering above; existing content/parser tasks stay queued.

1. **Verify the recovery point:** check whether the latest successful backup includes the current TOTP binding and recovery codes; arrange a consistent backup if needed.
2. **Prepare the next fix release:** resolve recorded-cost loss and indexed/native duplicate imports; deliver the seven-source exporter and receiver together; complete the 428 reauthentication dialog, validate Gemini's Edge/Docs/matrix fixes, and repair the reference redirect.
3. **Connect real off-host recovery:** BAK-01–04, independent key custody, retention/receipts and a real empty-target restore with measured RPO/RTO.
4. **Connect monitoring and delivered alerts:** MON-01/02 and ALT-01–03, an external probe, real receiver, deduplication/retries and failure/recovery exercises.
5. **Add device reporting:** REP-01–04 with explicit fields, scoped device credentials, idempotent receipt/retry and source status, after the import correctness fixes.
6. **Finish operational surfaces and maintenance:** MON-03, remaining UI-01/03, PUB-04 and OPS-02; keep OPS-01/03 as release constraints.

Detailed tasks, dependencies, acceptance and the full 31-ID mapping are in [the next-steps plan](./plans/2026-10-16-post-launch-next-steps-plan.md). This is a planning update; execution begins with the selected slice and its current-task record.

2026-10-16 autonomous continuation: current baseline committed as `48a679a`. Recorded fees, indexed/native transfer matching, seven-source protocol/CLI, per-batch pricing, bounded history storage, and reference/integration-checker fixes are implemented and entering the complete release gate. The 03:04 production backup now covers the TOTP/recovery setup and all four archive hashes passed. Follow [the active fix-release record](./finish-task/2026-10-16-autonomous-fix-release.md); actual data upload/local data refresh is the requested final handoff.

2026-10-16 fix-release gates complete: `48a679a` / `b0132d9` / `1a29a92` are committed. The exact `1a29a92` Linux/amd64 image passed 655 automated tests, real PostgreSQL and three-role HTTP checks, seven-source import/reauthentication/replay/rollback, trusted TLS, runtime audit (0 vulnerabilities) and empty-target restore. No migrations changed. A paired server/tool release is prepared; production remains `7bee9ad` pending the runbook's human release review. After cutover and smoke checks, hand off data export/upload and local refresh. REC-01 is complete based on the 03:04 backup. Detailed evidence is appended to the active fix-release record.

## 2026-10-17 Docs Redesign & Branch Split Handoff

Agent A completed the DeepWiki-aligned redesign of Docs Home (`DocsHomeAddCard` steel-slate palette, bare `+` icon, uniform card dimensions, clean hover state, and centered search) and successfully merged `feature/docs-redesign` into `codex/production-readiness` at commit `d9ab52a`.

- **Current Progress & Handoff Record:** See [2026-10-17 Docs Redesign and Agent Handoff](./finish-task/2026-10-17-docs-redesign-and-agent-handoff.md) and [.scratch/handoff-2026-10-17-branch-split.md](../.scratch/handoff-2026-10-17-branch-split.md).
- **Next Stage Plan (Agent B):** Merge `feature/sync-agent-v2` resolving the 3 expected conflicts in `messages` and `dashboard-toolbar.tsx`, followed by `pnpm install` and full verification gates.
- **Subsequent Waves:** Agent C (disk and artifact cleanup), Agent D (`feature/sync-agent-phase5` implementation), and Agent E (`feature/operations-console` integration).

## 2026-10-17 Phase 5 Release

Owner approved the single-device gray rollout and selected **Plan A**: migrate v1 to v2, run the 7d/30d/all shadow comparison to zero, switch v2 reads, then start the one Windows Agent. The first Agent upload must be treated as new data when it is truly new; an overlap with unclaimed v1 history must enter `review_required` and keep the old statistics. Historical adoption stays explicit (Owner-given device UUID/source/manifest/legacy batches); no automatic bulk claim.

The release is rebuilt from `codex/production-readiness` `1a44da2` rather than copied partially from the development worktree. Operations routes and mock data are **excluded** from this release; no Operations authentication work is included. See [the rollout runbook](./runbooks/sync-agent-production-rollout.md), [the authorization](./runbooks/sync-agent-phase5-owner-authorization.md), and [the Phase 5 proof](./research/sync-agent-phase5-rollout-proof.md).

## 2026-10-24 Technical Debt: Pricing Adapters & Policy Consolidation

Recorded debt from `packages/dashboard/src/adapters/local/` pricing modules. Currently operational with passing tests (`commandcode-peak.test.ts`, `integration.test.ts`), but accumulated ad-hoc patches require structural cleanup:

1. **`pricing-temporary.ts` (Static fallback patch):**
   - 10-line hardcoded rates for `gpt-5.3-codex` and `gpt-5.2-codex` added when `~/.aiusage/cache.db` had not yet indexed them.
   - *Target:* Merge directly into `pricing.ts` as default fallback constant; delete standalone file.
2. **`pricing-commandcode.ts` (CLI regex scrape patch):**
   - Scrapes `node_modules/command-code/dist/cli.mjs` via regex to extract literal pricing tables without triggering CommandCode CLI telemetry or auth.
   - *Target:* Encapsulate into a dedicated `pricing/providers/commandcode-catalog.ts` or unify catalog discovery.
3. **`pricing-schedule.ts` (Peak/off-peak billing mutation rule):**
   - Implements China State Council 2026 statutory holiday calendar (`HOLIDAYS_2026`) and UTC/Beijing off-peak multipliers (2x peak during working hours) for DeepSeek / Command Code models.
   - *Misplacement:* This is a **domain billing policy / event mutator** (`applyCommandCodeQuota`), not a static price-fetching adapter, yet it sits flat in `adapters/local/` and is referenced across collectors, projection, loader, and sync readers.
   - *Target:* Move to `packages/dashboard/src/domain/policies/peak-schedule.ts` (or `sync/policies/`) to separate data retrieval from business calculation rules.
