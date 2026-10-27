# Historical v4 recovery tools

These files live under `scripts/archive/`; live operations tooling remains directly in
`scripts/`. They are kept for audit and recovery history, not as a runnable workflow.

The dated `local-r5-*`, `prepare-v4-*`, `release-clean-candidate`, and `freeze-*`
utilities preserve the implementation and audit trail of the October 19–20
recovery and release work. Their historical scope counts, image identities and
paths describe those runs. They are not automatic startup or deployment steps.
Do not run them as part of normal development, builds or Git consolidation.

Private databases, credentials, real session logs, operational exports and
full evidence remain outside Git under the owner's recovery directory.
Host and device parameters must be supplied explicitly where needed.

The current baseline policy preserves trusted events before October 15,
recomputes the accepted window through October 20 19:07 Asia/Shanghai, waives
uncovered events until October 21 00:00, and starts a fresh incremental ledger
from that point. Old receipts and pending queues are evidence, not replay input.
The historical tools do not implement that new ledger transition automatically.
