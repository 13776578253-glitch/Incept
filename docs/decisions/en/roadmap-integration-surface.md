# The Roadmap Is A Human-Curated Integration Surface

## Status

Accepted on 2026-09-23. The migration phases are specified in `docs/plans/roadmap-modularization.md`.

## Context

`/atlas/roadmap` is a declared placeholder: its page is an explicit "not implemented yet" screen, and its atlas card carried the note "Planned: milestones and open work read from the task records rather than retyped."
That promise was reviewed before any implementation and rejected. The roadmap stores human-written content: highly abstract, never auto-derived from `docs/NEXT.md`, `docs/BACKLOG.md` or `docs/finish-task/`.
It does not track this repository's progress alone. It is an integration surface across projects.

The module template is the music package migration in flight on the music worktree branch (`feat/music-Plugin`): the `@incept/music` feature package and its `music-package-boundaries` decision. That branch is merged by the main controller, and every rule this decision relies on is restated below, so nothing here dangles.
Two statements in `docs/decisions/internal-surfaces-not-in-public-nav.md` constrain this surface: the atlas section "adds no data access", and an entry must be "a view derived from existing content".
Both are amended in that document's update of today's date, together with the mounting-honesty rule that governs the placeholder.
The storage and authoring mechanism is deliberately left open and needs a second discussion; its agenda is the Open questions section below.

## Decision

1. **The roadmap stores human-written content.** It is highly abstract, it spans projects as an integration surface, and it never auto-derives entries from task records.
2. **Full bilingual parity — a new, stricter constraint introduced by this decision, not a continuation of repository convention.** Decision documents themselves are not at parity today (see the "Known bilingual gaps" table in `docs/INDEX.md`), so this must not be described as existing practice. Every content entry is stored and served as an `{ en, zh }` pair; validation rejects an entry with a missing half. UI chrome copy stays bilingual in `messages` as before.
3. **Content and authoring belong to their own storage channel behind a port; content is never hand-written into `messages` JSON or code constants.** Fixture exception and honesty rule, worded identically to the Phase 4 grep rule of the plan: fixtures may exist only in `packages/roadmap/src/testing/`; while fixtures are the data source, both the atlas card and the roadmap page must state "Sample data — not yet connected to storage"; nothing may claim a real connection before storage is wired.
4. **Storage and authoring are deferred to the second discussion.** The deferral is deliberate; see Open questions.
5. **The roadmap ships as the in-process feature package `packages/roadmap` (`@incept/roadmap`)**, following the music package template: layer gradient (domain and ports stay free of React, Next and Node; application is the node-capable orchestration layer; react knows React; next knows Next; cli and adapters may use Node), boundary enforcement (package `exports`, layered tsconfigs, pnpm isolation, per-package typecheck), injected paths and configuration, and a minimal host surface. This document records only the roadmap-specific increments.
6. **Layer outline:** domain (pure types and validation, including the LocalizedText pair), ports (RoadmapRepository read port first; the write port lands with the authoring decision), adapters (storage adapters — fixture/in-memory only until then), application, react, next, cli (after authoring is decided), testing.
7. **Host touchpoints are the `/atlas/roadmap` page stub and assembly only.** The navigation entry already exists; no new mount contribution kind is introduced before a verified touchpoint demands one. The authoring surface is an internal capability: it stays on a studio/internal path, never inside the atlas subtree and never linked from an atlas card — bound to "it lists `/atlas/architecture`, `/atlas/roadmap` and `/atlas/keywords`, and nothing outside its own subtree" and "the docs back-office stays in studio and must not be pulled back into the atlas section".

## Rejected alternatives

| Option | Why not |
| --- | --- |
| Auto-deriving entries from the task records (the original card note) | Rejected at the product level: the roadmap stores human-written content. |
| Storing content in `messages` JSON or code constants | Messages hold UI chrome only; content belongs to the storage channel, and hand-copied milestones rot. |
| Describing bilingual parity as existing convention | It is not: the decision pairs are not at parity today; this decision tightens the rule for roadmap content. |

## Consequences

- The atlas card note promising entries "read from the task records rather than retyped" is corrected in the same round this decision lands.
- Until storage is decided, implementation uses fixtures only, confined to `packages/roadmap/src/testing/`, with the sample-data notice of decision 3 on the card and the page.
- Whatever form authoring takes, it never mounts under `/atlas/roadmap` and never appears in public navigation.
- The cross-project stretch triggers the section-coherence reconsideration named in `docs/decisions/internal-surfaces-not-in-public-nav.md`; it is registered in today's update there and settled under Open question 4.
- Full parity raises authoring cost (every entry written twice). This is a knowing choice made in this decision.

## Open questions

This section is a deliberate genre increment: existing decision documents carry Status / Context / Decision / Rejected alternatives / Consequences (and sometimes Boundaries) only. These four questions are the agenda of the second discussion.

1. **Storage:** Prisma (the docs/notes pattern sharing `@incept/db`), in-repo markdown/JSON, or an out-of-repo content root (the `DOCS_CONTENT_ROOT` convention).
2. **Authoring:** an owner-gated studio UI, a CLI, or hand-edited files. Whatever it is, decision 7 keeps it out of the atlas subtree.
3. **Content model fields:** entry granularity, timeline abstraction, status vocabulary, cross-project registration (a project registry?).
4. **`/atlas/roadmap` placement:** keep it in atlas or promote it to a top-level surface. Framed by "If a second non-map entry is ever wanted here, that is the point to reconsider whether the section is still coherent" — a cross-project integration surface is exactly that moment; settle it at the storage gate.
