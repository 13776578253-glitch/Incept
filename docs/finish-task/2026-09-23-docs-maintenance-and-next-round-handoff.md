# Docs Maintenance Round And Next-Development Handoff

## Status

Implemented in the current working tree, **uncommitted**. This record covers the
2026-09-23 maintenance round and the handoff it prepares. Nothing here has been committed
or pushed yet; the owner reviews it before that happens.

## Delivered In This Round

### 1. A current, verified database schema view

`docs/history/dbml/2026-09-23-current-database-schema.dbml` is the first complete ER view
since `2026-09-04-current-database-schema.dbml`, which predated the entire music product
line. It carries 14 tables, 14 foreign keys and all 9 enums.

It was not written from memory. The live `public` schema was read through the repo's own
Prisma client, and the result was compared mechanically against both
`packages/db/prisma/schema.prisma` and the DBML itself: table set, column set, nullability,
single-column and composite unique indexes, plain indexes, and every foreign key with its
referential action. The snapshot reports **zero** discrepancies. As a control, the same
check run against the 2026-09-04 snapshot correctly reports the three missing `music_*`
tables, so the check is known to be able to fail.

Alongside it, the stranded early draft `docs/decisions/docs-database-draft.dbml` moved to
`docs/history/dbml/2026-05-06-docs-database-draft.dbml` with a header marking it
superseded, and the three later dated snapshots stay where they are.

### 2. Documentation archive pass

Four superseded decision documents were archived to `docs/history/decisions/{en,zh}/`, each
with an archival header naming what replaced it and which of its statements are now known
to be stale. Each original location keeps a one-line pointer. **Archived bodies were copied
byte-for-byte and verified by hash before a header was prepended; no historical text was
rewritten.**

| Archived | Why |
| --- | --- |
| `docs-database-draft.md` (en + zh) + its DBML | Earliest v1 schema draft; `access_role` still `guest/member/pro`, no collections, no access tables, no music |
| `docs-prisma-postgres-workflow.md` (en + zh) | Onboarding draft written before `packages/db` existed; its repo shape, next steps and seed strategy are all superseded |
| `docs-authoring-markdown-like-rules.md` (zh) | Planning draft; uses `description`/`visibility`, and defers `documentKey` that has long since shipped |
| `docs-import-flow-rules.md` (zh) | Describes the original TypeScript import path; its risk table still claims the confirm route has no authorization |

Also: `docs/decisions/local-postgres-docker-setup.md` was removed because it was
**byte-identical** (sha256 `7A604C…63B5`) to `docs/runbooks/en/local-postgres-docker-setup.md`
and `runbooks/` is the designated home for operational manuals. The flat `docs/decisions/`
level now contains only `.gitkeep`, so the INDEX rule "new stable docs should not be written
flat at the root of `decisions/`" is finally true.

### 3. Bilingual gaps closed

Four documents existed only in Chinese although `docs/INDEX.md` requires `decisions/` and
`runbooks/` to keep `en`/`zh` twins. All four now have English versions:

- `docs/runbooks/en/docs-content-import.md` — the operator manual, translated in full
- `docs/decisions/en/internal-surfaces-not-in-public-nav.md`
- `docs/history/decisions/en/docs-authoring-markdown-like-rules.md`
- `docs/history/decisions/en/docs-import-flow-rules.md`

### 4. Broken links repaired

All relative markdown links under `docs/` were checked mechanically. Twelve real breaks were
found and fixed; the only remaining unresolved targets are image paths that appear inside
fenced code examples, which are illustrative content rather than links.

| File | Was | Now |
| --- | --- | --- |
| `docs/decisions/{en,zh}/music-authoring-in-the-web.md` | `../runbooks/...` (one level short) | `../../runbooks/...` |
| `docs/runbooks/{en,zh}/music-library-management.md` | `../decisions/...` (one level short) | `../../decisions/...` |
| the four new archived twins | `../dbml/`, `../../decisions/`, `../../runbooks/` | corrected one level deeper for their new home |

**A claim that did not survive checking:** `docs/NEXT.md` and `docs/BACKLOG.md` were reported
during exploration as having broken `./BACKLOG.md` links. They are correct — all four flat
files live in `docs/`, so the link resolves. No change was made.

### 5. Stale statements corrected

- `apps/web/src/features/docs/importer/docs-push/README.md` claimed a directory import was
  not a publication command and that batch draft plus Owner confirmation were "the next part
  of B-06". Both shipped; the paragraph now describes what the CLI actually does. Verified
  against `scripts/docs-import.mjs`, which creates a batch draft and prints a Preview URL for
  `--dir` without `--dry-run`.
- `docs/BACKLOG.md` listed six source paths that do not exist in the project root. All six
  were repointed at their real locations under `apps/web/src/features/docs/...` and verified
  to exist. The two `settings/plugin/*` references were left alone: that section is
  deliberately recorded as removed.
- `docs/BACKLOG.md`'s "Remaining" history-conversion table asserted that a duplicate
  multi-article-source TODO was still live. It is not a pending conversion; it is B-06's live
  source marker, and B-06 is tracked in the Active section. The table now says there are no
  pending conversions, and records the `prismaSchemaRevision` correction.
- `docs/INDEX.md` now documents `history/decisions/` and `history/dbml/` as first-class
  archive areas with their naming and pointer rules.
- The closed worktree record moved from `docs/current-task/` to `docs/finish-task/` with an
  archival note correcting its two dated claims (it is committed, and `main` has moved).

### 6. Doc-set structure corrections

Four structural decisions were taken after the archive pass, because the archive made them
visible:

**The `docs/modules/` layer was removed.** It held a single document
(`modules/docs/{en,zh}/docs-architecture.md`) out of eight candidate modules, with no stated
inclusion rule. It also restated content owned elsewhere: its "Runtime Boundaries" section
duplicated the six-layer split in `decisions/*/db-layer-architecture-rules.md`, and its
"Current Deferred Boundaries" list was a third parallel copy of what `NEXT.md` and
`BACKLOG.md` track. The two documents moved to
`docs/history/decisions/{en,zh}/modules-docs-architecture.md`, bodies preserved verbatim, with
headers stating that **no decision replaced them** — none was invented to fill the slot.
`docs/INDEX.md`, `README.md` and the directory skeleton no longer reference the layer.

Note that some of the retired document is *not* duplicated anywhere: its routes table, data
model summary, body contract and import flow. Those now point at
`runbooks/*/docs-content-import.md`, the Markdown-like decision documents and
`schema.prisma` respectively. If a single "how Docs fits together" narrative is wanted later,
that is the content to rebuild — deliberately, in `decisions/`.

**`plans/` was promoted to a top-level directory beside `current-task/`.** It is the buffer
for large plans: a plan lands there once it is written up and reviewed, before it is broken
into an active task. `history/plans/` no longer exists as a category, because a superseded
plan is deleted rather than archived.

The two `2026-05-10` five-step plan files were **deleted**. They were the only occupants of
the old directory, they were severely out of date, and their executed outcome is already
recorded — Steps 1–2 landed as the block v1 baseline records, and the file + CLI +
preview/confirm path replaced Steps 3–5. Their deletion is the answer, so no decision was
written to replace them; `INDEX.md` records the rule that a superseded plan is removed once
its outcome is documented.

The practical consequence is worth stating plainly: the repo says *that* there is no browser
Docs editor and no body-version snapshot/rollback, and neither `NEXT.md` nor `BACKLOG.md`
lists them as pending work — but nothing records whether that is a settled decision or merely
unreached. If a future round revisits a browser editor, close that gap first.

**`INDEX.md` now carries a known-bilingual-gaps table.** One gap remains:
`docs/decisions/zh/docs-markdown-like-authoring-syntax.md` has no English version. It is the
authoring syntax reference, so it is the one worth translating next.

All relative markdown links under `docs/` were re-checked after these changes: 65 links, 0
broken. The only unresolved targets in the tree are image paths that appear inside fenced code
examples, which are illustrative rather than links.

## Verified

- The live database was reachable on `localhost:5432` and the schema comparison ran against
  it, not against a file.
- The DBML check was control-tested: it passes the new snapshot and fails the 2026-09-04 one
  on exactly the three expected `music_*` tables.
- Every archived body was hash-verified identical to its original before the header was added.
- Every repaired link was re-checked after the edit; no non-image link under `docs/` is broken.
- `git status` shows only intended changes; no source file under `apps/` or `packages/` was
  modified except the one README paragraph noted above.
- **`pnpm docs:check-import-cli` passes.** It prints `Docs import CLI checks passed` and exits
  zero, which confirms the corrected statement in the docs-push README: the directory command
  does produce a batch draft and a preview URL rather than only printing a tree. The check
  could not be run from the agent session — it spawns `pnpm.cmd` with captured stdio, which the
  sandbox denies with `EPERM` — so it was run manually by the owner instead.
- It emits one `DEP0190` deprecation warning: the check passes arguments to a child process
  with `shell: true`, which concatenates rather than escapes them. It does not affect the
  result, because the arguments are the repo's own generated temporary paths. Worth cleaning up
  if that script is touched again.

## Not Verified

- Docker was not reachable from this shell, so the database was reached directly on 5432
  rather than through `docker compose ps`.
- No document was previewed through `dbdiagram.io`; the DBML was validated structurally
  against the database instead.
- The translations were not read by a second reviewer.

## Conflicts And Decisions Taken

Two findings were escalated to the owner rather than decided unilaterally, and both were
resolved in favour of the fuller option: archive the superseded decision documents with
pointers left behind, and add the missing English twins in this round rather than recording
them as debt.

One judgement call was made without asking, and is flagged here for reversal if unwanted:
`docs/decisions/local-postgres-docker-setup.md` was deleted as an exact duplicate of the
runbook copy. If a `decisions/` entry point for that manual is wanted, restore it as a
pointer rather than a copy — a second full copy is what created the drift risk.

## Next Development Round

The recommended next objective is **B-06 real-content acceptance for collection article
replacement.** It is the only place where the runbook already states the expected behaviour,
the source carries two explicit TODO markers, and no real content has ever exercised it.

The two markers sit in the same replace transaction:

- `packages/db/src/docs/import.ts:1089-1090` (B-13) — both branches of the replace check
  resolve to `updated`, so `renamed` and `removed` never surface from this path.
- `packages/db/src/docs/import.ts:1224-1226` (B-14) — `nodeKey` is shared across locales, so a
  single-locale `--replace` that shrinks the tree also deactivates nodes the other locale
  still needs.

Acceptance should follow the six items already listed in
`docs/finish-task/2026-09-01-docs-collection-navigation-milestone.md`, using
`docs/runbooks/en/docs-content-import.md` §5 as the statement of expected behaviour. Note the
question that runbook leaves open: a node whose parent **and** position both change may be
read as a move or as a new node replacing an old one, and that has never been pinned down.

Two low-cost items are worth doing alongside it, because both are silent failure modes:

- `packages/db/src/client.ts:10` `prismaSchemaRevision` is a hand-maintained sentinel that
  every migration must update and nothing enforces. It is currently correct; consider adding
  a check rather than relying on memory.
- `pnpm --filter web lint` cannot run: ESLint 9 is installed with no `eslint.config.*`. The
  worktree runbook's acceptance checklist requires `pnpm lint`, so that step is currently
  impossible to satisfy. Either add the config or remove the step from the checklist.

## Working Notes For The Next Round

- Environment facts that repeatedly bite: `next build` fails in the TypeScript phase on
  Windows with `spawn EPERM`, and this machine exports `NODE_ENV=production`, which makes
  React resolve its production build and breaks Testing Library at import time. The Vitest
  config pins `NODE_ENV=test` for the test run.
- The shared `public` schema allows only one worktree to run `pnpm db:deploy` / `db:migrate`
  at a time. `DOCS_CONTENT_ROOT` and `MUSIC_CONTENT_ROOT` are shared by every worktree, so two
  agents running `docs:import` / `music:import` / `music:manifest` concurrently overwrite each
  other.
- `apps/web/public/_music-media/` has no second copy, is gitignored, and sits inside the
  working tree. Copy it before any cleanup of the working tree.
