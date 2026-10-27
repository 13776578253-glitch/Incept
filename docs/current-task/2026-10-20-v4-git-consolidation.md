# v4 Git integration — 2026-10-20

The integration branch is `codex/consolidate-v4-20261020`, created directly from
reviewed `feature/trusted-sync` HEAD `a53cd79`. The dedicated worktree is
`.worktrees/consolidate-v4`. No historical Phase branch was merged.

## Backups and review

Before any commit, both dirty worktrees were independently preserved under
`D:\Incept-recovery\2026-10-20\git-consolidation\backup-before-commits`.
The backups contain 125 trusted-sync files and 66 tray files, binary patches,
indexes, all Git refs and independent bundles. Every file hash was verified;
both bundles passed verification and were restored to mirror repositories
whose refs exactly matched their originals. Ignored dependency/build caches
are excluded. Source files and untracked artwork are included.

All 125 trusted-sync items were reviewed. Private host/device/session literals
were removed from new operational material; scripts now require explicit
parameters where appropriate. No database, key, credential or real session log
was added. Historical tools are documented in `scripts/archive/README-v4-history.md`.

## Commit chain

| Commit | Purpose |
| --- | --- |
| `3bebaa1` | Session isolation, trusted uploads, queue/receipt correctness |
| `62bde3e` | HTTP/executor error semantics |
| `74e3680` | Revision-driven Dashboard snapshots and browser refresh |
| `815f4d1` | WorkBuddy and DeepSeek Harness |
| `a47edc3` | Operational tools and image/lineage verification |
| `a53cd79` | Reviewed historical recovery/release documentation |
| `6ad1355` | Selective backport of the two-file receipt-clock fix |
| `8a357e0` | Tray source, necessary artwork, build tools and tests |
| `78c670c` | Additive tray interfaces on the current Agent |
| `579a26b` | Ignore local build scratch |

The tray worktree was independently finalized as `d17bae4`. Its runtime files
were copied selectively; the old sync implementation was not merged. The four
Agent interface files use the current trusted core, with only status publication,
pause/resume and packaged-path support added. Status publication selects display
fields explicitly and coalesces heartbeat-only writes.

Old hotfix commit `b732076` still fixes a real legacy shadow-comparison clock
difference. Only its implementation and regression test were backported.
The other unique hotfix/release commits are historical evidence and were not
reintroduced. Operations-console remains a separate mock prototype.

## Validation and build identities

- Dashboard: 352 existing targeted regressions passed.
- HTTP/executor error semantics: 7 passed.
- Native tray: 44 reflection regressions passed; no executable entry point run.
- Agent: 98 passed, zero failed after the ACL closure. The original failure was
  unnecessary owner reassignment on an already-owned Windows directory. The fix
  verifies current ownership, writes only the private DACL, and verifies its
  effective owner/rules afterward. DPAPI encryption and the self-only FullControl
  assertion both pass; no test was disabled or loosened.
- Ten TypeScript configurations passed; the final Agent typecheck also passed.
- Web ESLint: zero errors and nine existing warnings in unchanged files.
- Dashboard workers, Agent/ZIP, native tray and Next production App built.

The native Windows App build uses a disposable D-drive `USERPROFILE` and temp
folder, a 3 GiB Node heap limit and the existing two-worker configuration.
This avoids Next tracing the developer's real home, including protected Intel
logs. No application tracing configuration change was retained. Prisma Client
and Next route types were generated locally, without database migrations.

App BUILD_ID: `Uk5AMaUlbTuKEOLx6ouup`.
Full hashes, file inventory and build logs are outside Git under
`D:\Incept-recovery\2026-10-20\git-consolidation\integration-artifacts`.
`BUILD-MANIFEST.json` identifies the Agent ZIP, executable, workers and App files.
These are local build artifacts; no Docker image or production deployment was
created by this integration.

## Preserved references and remaining work

All four current origin heads were checked live. Every referenced remote commit
is already reachable from the trusted core, including remote production-readiness
`aef64f4`; its local counterpart remains `1a44da2`. Main remains `b623e13`.
Original release/snapshot/backup/operations-console refs remain unchanged.

Twenty-six untracked tray screenshot/research evidence files were archived on D
with verified hashes. Required source artwork remains tracked; generated icons
are ignored. Older tracked tray evidence remains on its original branch.
The main checkout's original `.gitignore` modification remains untouched; an
equivalent scratch ignore is included in this integration.

The accepted baseline reset policy is still a separate data/state task. Runtime
Codex malformed-session isolation and explicit recovery anchors retain their
current behavior; the statistics window waiver is not a general new-ledger
slicing implementation. No baseline rebuild, pending replay or state transition
was performed here.

The ACL test is closed. The complete recorded regression result is 501 passed, zero failed.
Push, main advancement, branch/worktree cleanup, deployment and Agent startup
remain separate actions requiring Owner authorization.

## Authorized publication follow-up

Owner authorized ACL closure, integration branch push and main fast-forward,
followed by local baseline preparation. Production/data/Agent startup remain
separate from this Git publication. All commands and remote results are recorded
in the private publication evidence directory.
