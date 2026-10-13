# Next Stage

This is the short entry point for active product work. Detailed source-code acceptance criteria live in [BACKLOG.md](./BACKLOG.md).

## Active

- **Collection navigation (B-06):** Run real-content acceptance for directory batch replace, rollback, and cross-locale folder labels on top of the implemented folder/article tree. **Recommended as the next round** — it is the only item where the runbook already states the expected behaviour, the source carries two explicit TODO markers, and no real content has exercised it. See `docs/current-task/2026-09-23-docs-maintenance-and-next-round-handoff.md`.
- **Home content (B-01):** Replace the mock landing page with real published content or a deliberately minimal landing page.
- **Checklist grammar (B-04):** Define multiline and nested Markdown-like checklist behavior.
- **Structured content (B-05):** Design the authoring and rendering contract for tables before adding the block.

## Boundaries

- `docs/BACKLOG.md` is the only source-code TODO inventory.
- Deferred work and completed milestones do not belong in this file.
- Historical implementation records are in `docs/finish-task/`; old plans, schema snapshots and superseded decisions are in `docs/history/`.

## 2026-10-13 Production readiness

Local security, persistence and Linux validation are recorded in [the remediation log](./current-task/2026-10-13-production-readiness-remediation.md). The remaining release work requires a real host/domain, certificate renewal, alerts, off-host backup and external-network acceptance; use [the operating procedure](./runbooks/en/production-deployment.md) before declaring GO.

2026-10-13 continuation: all 18 code/isolated acceptance items are complete, including local ACME renewal, real systemd synthetic HTTPS alerts and encrypted SFTP restore/retention. Actual host/domain, off-host failure isolation and external mobile acceptance remain the release work; no public deployment occurred.
