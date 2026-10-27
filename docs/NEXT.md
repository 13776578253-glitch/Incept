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

## 2026-10-27 Current State

The 2026-10-16 post-launch plan was executed through the 2026-10-27 releases. The P1 snapshot
read-path and P2–P6 follow-ups are implemented and committed; P5 is accepted. Remaining
verification is the P1 deployment/load check and the P3 reboot check; production Docker
volumes remain an optional owner decision.

- [P1 read path](./current-task/2026-10-27-sync-snapshot-read-path.md)
- [P2–P6 follow-ups](./current-task/2026-10-27-p2-p6-followups.md)
- [Cleanup round](./current-task/2026-10-27-cleanup-round.md)
- [Agent handover](./current-task/2026-10-27-agent-handover.md)

Historical 2026-10-16/17/20 execution logs are archived in `docs/finish-task/`. The
pricing-adapter debt is tracked as B-31 in [BACKLOG.md](./BACKLOG.md).