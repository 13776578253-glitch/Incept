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

## 2026-10-14 Post-launch follow-up

The public service is now deployed with real content, trusted HTTPS, boot recovery and a tested real local backup restore; see [the rollout record](./current-task/2026-10-14-public-production-deployment.md). The next user-requested work is [Owner login, public About/activity, backup/monitoring/alerts/reporting and admin surfaces](./current-task/2026-10-14-post-launch-operations-and-admin-todo.md). The user chose one Owner account/password and public About plus redacted activity summaries. Start with AUTH-01/02 and ACL-01; independent off-host backup and delivered external alerts remain incomplete. This appended status supersedes the deployment-state statements above, preserving their historical context.


2026-10-14 current increment: AUTH-01/02/03 and ACL-01/02/03 are scoped in [Owner login, MFA and both Pro grant modes](./plans/2026-10-14-owner-auth-mfa-pro-incremental-plan.md). Local settings baseline is running for discussion; UI and functional policy are not frozen. Complete the entire increment's acceptance before one production update; email delivery remains a required integration decision.

2026-10-14 v0.2: the user replaced risk email verification with one-time Owner approval codes; email is deferred and no longer a current release dependency. A development-only account/login/Pro style preview is available locally; see [the preview record](./current-task/2026-10-14-owner-account-ui-preview.md) and the appended v0.2 proposal. Real authentication/authorization remains pending and requires complete acceptance before production update.

2026-10-14 implementation: real Owner password/TOTP/one-time approval, sessions, recovery, bounded Pro grants and ACL/audit logic are implemented and locally/isolated tested; see [implementation evidence](./current-task/2026-10-14-owner-auth-implementation.md). Preview logic is retired. The user's latest boundary is to stop after logic, without a server release package; front-end revisions/approval remain next. Keep port3000 available, wait for UI instructions, and do not deploy this increment.
