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
- `docs/modules/`

Purpose:

- preserve readable architecture rules
- preserve operational workflow
- preserve stable module understanding

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
  finish-task/
  history/
    dbml/
    plans/

  runbooks/
    en/
    zh/

  decisions/
    en/
    zh/

  modules/
    docs/
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

### `finish-task/`

Stores archived task records that are no longer part of the active working set.

Examples:

- completed milestone archives
- old AI execution history
- previous task bundles moved out of `current-task/`

### `history/`

Stores preserved reference material that is not a current decision or active task.

Examples:

- old DBML schema snapshots in `history/dbml/`
- superseded plans and investigations in `history/plans/`

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

Current Chinese content import manual:

- `docs/runbooks/zh/docs-content-import.md`

### `decisions/`

Stores architectural and design decisions.

Examples:

- route model decisions
- db layer architecture rules
- data model decisions
- workflow decisions that should remain stable

### `modules/`

Stores module-level architecture and structure documentation.

Examples:

- docs module architecture
- module boundaries
- route contracts
- stable content rules for a specific subsystem

## Bilingual Rules

The directories below are human-facing and should follow bilingual structure:

- `docs/runbooks/en/`
- `docs/runbooks/zh/`
- `docs/decisions/en/`
- `docs/decisions/zh/`
- `docs/modules/docs/en/`
- `docs/modules/docs/zh/`

Rules:

- English and Chinese files should be stored in parallel directories
- matching files should use the same filename whenever possible
- do not mix `en` and `zh` in the same directory level
- when adding a new stable human-facing doc, plan for both language versions

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

### For modules

Focus on:

- how a module is currently structured
- what routes, rules, and data contracts it uses
- how the module should be understood by future developers

## Current Migration Policy

From this point forward:

1. new human-facing stable docs should prefer the bilingual structure
2. active work belongs in `NEXT.md`, with source-code detail in `BACKLOG.md`
3. completed task records move from `current-task/` to `finish-task/`
4. superseded plans and DBML snapshots move to `history/`
5. migration can happen incrementally and does not need to be completed in one pass
