# Docs Index

## Goal

This document defines the stable documentation structure for this project.

The project has moved from prototype stage to connected product stage, so the docs system must now support:

- stable architecture context
- readable human-facing documentation
- AI-readable task history
- bilingual organization for long-term growth

## Two Documentation Categories

### 1. AI-facing task context

Directories:

- `docs/current-task/`
- `docs/finish-task/`

Purpose:

- preserve recent task context
- record completion notes
- retain intermediate implementation history

Rules:

- primarily written for AI and development continuity
- can be log-like and incremental
- strict bilingual parity is not required
- entries may be noisy as long as context is preserved

### 2. Human-facing stable docs

Directories:

- `docs/runbooks/`
- `docs/decisions/`

Purpose:

- preserve readable architecture rules
- preserve operational workflow

Rules:

- these docs are written for humans first
- structure must stay clean and predictable
- these docs must use bilingual directory separation
- new stable docs should not be written flat at the root of `docs/`

## Standard Directory Structure

Current standard structure:

```text
docs/
  INDEX.md
  NEXT.md
  BACKLOG.md
  READAI.md

  current-task/
  plans/
  finish-task/

  history/
    dbml/
    decisions/
      en/
      zh/

  runbooks/
    en/
    zh/

  decisions/
    en/
    zh/
```

## Meaning Of Each Directory

### `current-task/`

Stores only work that is actively being carried across sessions.

Examples:

- current milestone notes
- short-term continuity notes

Completed material should move out promptly.

### `plans/`

The buffer for large plans. A plan lands here once it is written up and reviewed but before
it is broken into an active task, which keeps `current-task/` reserved for work actually in
flight.

- `plans/` holds the plan for a body of work that is too large to start as one task
- when execution begins, the active slice moves to `current-task/`; the plan stays here as
  the reference it is being executed against
- a superseded plan is **removed**, not kept: if something replaced it, that replacement
  belongs in `decisions/`. This is why `history/plans/` no longer exists as a category
- a plan that is finished has no home here; its outcome is recorded as a `finish-task/`
  record and any stable rule it produced moves to `decisions/`

The directory is currently empty, which is a valid state.

### `finish-task/`

Stores archived task records that are no longer part of the active working set.

Examples:

- completed milestone archives
- old AI execution history
- previous task bundles moved out of `current-task/`

### `history/`

Stores preserved reference material that is not a current decision, plan or active task.
It holds two kinds of material, described below.

#### `history/dbml/`

Every snapshot is dated and named `<date>-<subject>.dbml`. The current model snapshot is
`2026-09-23-current-database-schema.dbml`; older ones are kept as history and are not the
current model.

#### `history/decisions/`

Superseded decision documents, moved here when a later decision replaces them. Two rules
apply:

- the archived file keeps its original text unedited, with an archival header prepended
  that states the archival date, what replaced it, and which of its statements are now
  known to be stale
- a one-line pointer remains at the original `decisions/` path, so existing references
  and readers still find their way

Current contents:

| Archived document | Superseded by |
| --- | --- |
| `docs-database-draft.md` (en + zh) and `dbml/2026-05-06-docs-database-draft.dbml` | The shipped schema; see `packages/db/prisma/schema.prisma` and the 2026-09-23 snapshot |
| `docs-prisma-postgres-workflow.md` (en + zh) | `decisions/*/prisma-basics-and-evolution.md` and `decisions/*/db-layer-architecture-rules.md` |
| `docs-authoring-markdown-like-rules.md` (zh) | `decisions/zh/docs-markdown-like-authoring-syntax.md` and the docs-push README |
| `docs-import-flow-rules.md` (zh) | `runbooks/*/docs-content-import.md` |

### `NEXT.md`

Stores the small, human-readable entry point for the next product stage. It lists only active product tasks and links to `BACKLOG.md` for detailed source-code acceptance criteria.

### `BACKLOG.md`

The canonical inventory of source-code TODOs. Completed TODOs become in-place `history:` comments in source code; task records must not duplicate that inventory.

### `runbooks/`

Stores operational manuals.

Examples:

- local development startup
- database workflow
- deployment steps
- debugging and recovery procedures

Current content import manuals:

- `docs/runbooks/zh/docs-content-import.md`
- `docs/runbooks/en/music-content-import.md`
- `docs/runbooks/zh/music-content-import.md`
- `docs/runbooks/en/music-library-management.md`
- `docs/runbooks/zh/music-library-management.md`

Current workflow manuals:

- `docs/runbooks/zh/multi-ai-worktrees.md`
- `docs/runbooks/en/multi-ai-worktrees.md`

### `decisions/`

Stores architectural and design decisions.

Examples:

- route model decisions
- db layer architecture rules
- data model decisions
- workflow decisions that should remain stable

### Why there is no `modules/` layer

A `docs/modules/` layer existed for a while and held a single subsystem document,
`modules/docs/{en,zh}/docs-architecture.md`. It was retired on 2026-09-23 for three reasons:

- it had no defensible inclusion rule, so exactly one of eight candidate modules was
  documented and nothing said why
- it restated content owned elsewhere — its runtime-boundary section duplicated the
  six-layer split in `decisions/*/db-layer-architecture-rules.md`, and its deferred-boundaries
  list was a third parallel copy of what `NEXT.md` and `BACKLOG.md` already track
- three directories existed where two carry the same load

A subsystem's current structure therefore belongs in **`decisions/`** when it is a rule
worth keeping stable, in **`runbooks/`** when it is a procedure, and in **`NEXT.md` /
`BACKLOG.md`** when it is pending work. There is no separate home for "describe a module
as it currently is". The retired document remains in Git history.

## Bilingual Rules

The directories below are human-facing and should follow bilingual structure:

- `docs/runbooks/en/`
- `docs/runbooks/zh/`
- `docs/decisions/en/`
- `docs/decisions/zh/`

Rules:

- English and Chinese files should be stored in parallel directories
- matching files should use the same filename whenever possible
- do not mix `en` and `zh` in the same directory level
- when adding a new stable human-facing doc, plan for both language versions

### Known bilingual gaps

Documents with no counterpart in the other language. They are listed here so the gap is
visible rather than silently tolerated; adding the missing version is the fix.

| Document | Missing version |
| --- | --- |
| `docs/decisions/zh/docs-markdown-like-authoring-syntax.md` | English |

That is the only remaining gap. The other three documents that used to be Chinese-only
(`internal-surfaces-not-in-public-nav.md`, `docs-content-import.md`, and the archived
`docs-import-flow-rules.md` and `docs-authoring-markdown-like-rules.md`) gained English
versions on 2026-09-23.

## Legacy Rules

Older docs may still exist in legacy locations such as:

- flat files in `docs/decisions/`
- older one-language decision drafts

Rules:

- do not delete legacy historical files
- do not overwrite legacy context
- migrate important stable content gradually into the new bilingual structure
- treat old locations as historical reference until migration is complete

## Writing Rules

### For runbooks

Focus on:

- exact steps
- command order
- operational checks
- failure recovery

### For decisions

Focus on:

- why the project chose this approach
- what constraints are now stable
- what should not be casually changed

### For decisions

Focus on:

- why the project chose this approach
- what constraints are now stable
- what should not be casually changed

## Current Migration Policy

From this point forward:

1. new human-facing stable docs should prefer the bilingual structure
2. active work belongs in `NEXT.md`, with source-code detail in `BACKLOG.md`
3. a large body of work is written up in `plans/` first, then executed as tasks in
   `current-task/`
4. completed task records move from `current-task/` to `finish-task/`
5. superseded decisions and old DBML snapshots move to `history/`
6. migration can happen incrementally and does not need to be completed in one pass
7. when a decision is archived, a pointer stays at its original path; if nothing replaced
   it, the archival header says so and no new decision is invented to fill the slot
8. a superseded plan is deleted after its outcome is recorded — the record is the answer,
   not the plan
