# Internal Surfaces Stay Out Of Public Navigation

## Goal

The current stage concentrates entirely on tightening the `docs` public reading interface.

The first stage keeps only two entries in public navigation:

- `Docs`
- `About`

Every other page still under development, validation or administration is treated as an internal capability and does not appear in public navigation.

These pages are not deleted. They keep their direct links for development, validation, import, administration and the later create/admin workflows.

## Update 2026-09-23: An `atlas` Section Enters Public Navigation

This decision has an explicit exit path, and the surface that took it is now called **`atlas`**. The naming took three attempts in one round, all before any commit, and the sequence is worth recording because the first two were wrong for instructive reasons:

1. `workspace` — mounted, then rejected. "Workspace" promises a place to work; the section holds small viewing surfaces. The word was also already taken: `WorkspaceShell` and `page-shell-workspace` are the shared utility shell that `/studio/docs/library` uses.
2. `tools` — mounted, then rejected. "Tools" names a container by the *kind of thing inside it*, which is why it fit nothing: playback and an architecture diagram are not implements you pick up to do work, they are ways of looking at content. The section's contents do not share a container type, they share a relationship to what is already there.
3. `atlas` — kept. The section holds maps of the project: structure, time, subject. Each entry derives a view from material that already exists rather than producing new material.

Renaming left two redirects rather than broken links, because both earlier paths were genuinely reachable: `/workspace → /atlas` and `/tools → /atlas`, with `/tools/<moved>` → `/atlas/<moved>` for the three surviving routes.

During the rename **`playback` was moved out of the section entirely.** It was the one entry that did not fit: listening to content is not a way of reading the project. Its navigation entry now points at `/settings`, where playback preferences and the music library already live, and `/tools/playback` redirects there.

The revision keeps the original boundary rather than relaxing it:

### Update 2026-09-27: Roadmap and Atlas are separate surfaces

Roadmap is the project's work-tracking surface; Atlas is the project's derived reading surface. They are sibling entries in project navigation, and Roadmap is no longer an Atlas catalog card. The Atlas catalog currently lists project maps such as Architecture and Keywords, while the Roadmap entry goes directly to `/atlas/roadmap?project=<key>`. The earlier wording about three Atlas pages and listing `/atlas/roadmap` in the Atlas catalog is superseded by this ruling.

- The section does **not** carry docs back-office data. `/studio/docs/library` stays hidden, and no card links to it.
- The section is a navigation surface, not a second content library. It lists `/atlas/architecture`, `/atlas/roadmap` and `/atlas/keywords`, and nothing outside its own subtree.
- It adds no data access. The hub is a static entry list, reads no database, and needs no viewer.
- **All three atlas pages are not implemented.** Each is an explicit "not implemented yet" placeholder, and each card carries a line describing what that map is planned to show. The routes and navigation entries exist so the structure is settled; no placeholder claims to work.
- The player is still hidden on `/atlas` (`features/music-player/adapter/player-route-policy.ts`). Only this route's public status changed, not the player policy.

Everything below about the remaining hidden surfaces still applies unchanged.

## Update 2026-09-23: The `roadmap` Map Is Repositioned as a Human-Curated Integration Surface

The `roadmap` entry is repositioned before any of its data work began. The roadmap is a store of human-written content — highly abstract, spanning projects as an integration surface — and is not derived from the task records. Its full definition is `docs/decisions/roadmap-integration-surface.md`. This update disposes of the earlier statements it touches, one by one:

- **Superseded: the sentence "Any entry that cannot be described as a view derived from existing content does not belong here."** Replaced by: an entry qualifies when it is a view over material that exists independently of the map itself, including human-curated roadmap entries kept in a storage channel outside this section. The map still produces no material of its own; authoring happens elsewhere.
- The 2026-09-23 bullet "It adds no data access. The hub is a static entry list, reads no database, and needs no viewer." keeps its force for the hub only. `/atlas/roadmap` will read the curated content storage through its package port; viewer and visibility policy are settled together with storage.
- **Extended, not relaxed: the mounting-honesty rule "an entry may be mounted ahead of its map only if both its card and its page state plainly that the map is not implemented."** While fixtures are the data source and storage is not yet wired, both the card and the page must state "Sample data — not yet connected to storage". Nothing may claim a real connection before storage lands.
- **Kept and bound: "the docs back-office stays in studio and must not be pulled back into the atlas section" and "It lists `/atlas/architecture`, `/atlas/roadmap` and `/atlas/keywords`, and nothing outside its own subtree."** Whatever form the owner-gated authoring surface takes, it stays on a studio/internal path: never inside the atlas subtree, never linked from an atlas card.
- **Registered: the reconsideration named in "If a second non-map entry is ever wanted here, that is the point to reconsider whether the section is still coherent."** A cross-project integration surface stretches "maps of the project", which is exactly the moment that sentence anticipates. The reconsideration is hereby raised; whether the roadmap stays under `/atlas/roadmap` or becomes a top-level surface is settled at the module's storage gate. Until then the route and navigation stay as they are.
- The atlas card note that promised milestones "read from the task records rather than retyped" is corrected in the same round this update lands; no window is left where the card advertises an abandoned approach.
- The player remains hidden on `/atlas` (`features/music-player/adapter/player-route-policy.ts`). This update does not change the player policy.

## Public Navigation Rules

Public navigation does not show:

- `Resources`
- `Docs archive`
- `Docs style lab`
- `Import preview`
- `Docs library`
- `Docs admin`

`Workspace` was on this list; it is now a public `Atlas` section instead. See the update above.

The related copy may stay in `messages`, so that context is not lost when an entry is restored or reorganised later.

Navigation code may keep the original entry behind a `// disabled` comment or a `TODO`, making it explicit that these capabilities are "not currently mounted in the public site" rather than abandoned.

## Current Internal Surfaces

### Docs Style Lab (Retired)

Retired on 2026-10-15. The former local address was
`http://localhost:3000/en/docs/style-lab`; the route no longer exists and must not be restored
as an internal surface. The old validation responsibilities are historical.

### Docs Import Preview

Local address format:

```text
http://localhost:3000/en/docs/import-preview/{draftId}
```

Responsibilities:

- preview an import draft generated by the importer
- show the source file path, target route, import mode, validation result and final reading result
- support the human review that precedes confirming an import

Public status:

- not in public navigation
- reachable only through the draft link the import flow generates

### Docs Import Confirm

Local address format:

```text
http://localhost:3000/en/docs/import-preview/{draftId}/confirm
```

Responsibilities:

- confirm an import draft
- it is the follow-up action entry point for import preview

Public status:

- not in public navigation
- not exposed as an ordinary page entry

### Docs Library

Local address:

```text
http://localhost:3000/en/studio/docs/library
```

Responsibilities:

- view the current docs content library overview
- show the management view of docs articles and collections
- be the precursor management surface for the later create/edit/publish/admin workflow
- it has been moved out of `workspace` and into the hidden `studio` management surface

Public status:

- not in public navigation
- reachable only by direct link

## Current Policy

All of these pages are currently treated as internal capabilities:

- their routes may stay
- their copy may stay
- their development entry points may stay
- they are not mounted into public site navigation
- they are not part of the first-stage public product experience

The first-stage public experience advances around the docs reading interface only.

## Follow-Up TODOs

- `workspace` and `tools` no longer exist as pages: both redirect, to `/atlas`. The docs back-office stays in `studio` and must not be pulled back into the atlas section.
- **Do not rename this section again without a reason of the same kind.** Two names were rejected already, both times because the name described the container rather than the relationship between the entries. Any entry that cannot be described as a view derived from existing content does not belong here.
- **This revision relaxes one earlier rule deliberately.** The first update said every listed entry must already work before it is listed. The atlas routes are mounted before implementation, so that rule now reads: an entry may be mounted ahead of its map **only if** both its card and its page state plainly that the map is not implemented. If a future entry cannot say that honestly, it should stay unlisted until it works.
- Playback now lives with the music settings, reachable from the atlas dropdown but not part of the atlas. If a second non-map entry is ever wanted here, that is the point to reconsider whether the section is still coherent.
- If an administrator entry point is needed later, decide then whether to expose `/studio` in a controlled position.
- Decide when `Docs archive` re-enters public navigation.
- Style Lab was retired on 2026-10-15; no placement decision remains.
- Define a separate internal information architecture for the create/edit/publish workflow.
