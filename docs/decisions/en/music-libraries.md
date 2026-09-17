# Music Libraries

## Status

Accepted on 2026-09-17. Not implemented yet: the schema, the manifest contract, the import semantics and the player wiring below are the agreed shape for B-19.

## Context

The player holds one flat list of tracks. The catalogue arrives from `GET /api/music/tracks`, the queue is that list, and nothing in the schema groups tracks. The request is to separate the library into named groups — a podcast set, a music set, a curated selection — and to let the listener switch between them inside the player.

Four constraints shaped the outcome.

1. **`trackKey` is content identity.** A library is a label, not an identity: renaming or regrouping must never change a track's key or its media.
2. **The manifest is the desired state.** Import is idempotent because the manifest describes what should exist, so grouping has to join that model rather than live beside it.
3. **Core owns what a queue change means.** `tracksLoaded` → `setQueue` already defines it, and the list the player shows is the queue.
4. **The catalogue is small.** A few dozen tracks, one fetch, no server-side filtering needed.

## Decision

- **A library is a row and membership is a row.** `music_libraries` (key, title, position, isActive) plus `music_library_items` (libraryId, trackId) with `@@unique([libraryId, trackId])`.
- **A track may belong to several libraries.** This is why membership is a join table rather than a column: curated and cross-listed groupings are a real requirement.
- **Order inside a library comes from the track's own `position`.** After filtering, the relative order is already correct, so the manifest gains no ordering field and the join row needs no position column. Per-library ordering can be added later as one nullable column.
- **The manifest gains two optional fields, and the generator writes them.** A top-level `libraries: [{ key, title, position }]`, and per track `libraries: ["key", ...]`. Neither is meant to be authored by hand; see "Authoring" below.
- **Referencing a library that was not declared is an error.** A misspelled key must be loud rather than silently creating a library.
- **An empty `libraries` array on a track is an error.** "Belongs nowhere" is almost always a mistake; omitting the field and passing an empty array do not mean the same thing.
- **A manifest with no `libraries` at all uses the implicit default library.** Tracks without the field land in a library whose key is `default`; other libraries and their memberships are left untouched. An existing manifest therefore imports without errors and without moving any row.
- **Once `libraries` is present, the import is authoritative for it.** A library that is missing from the manifest is deactivated rather than deleted, matching how tracks behave, and memberships are rewritten wholesale from the manifest.
- **The API returns libraries and membership in one response.** `GET /api/music/tracks` returns `libraries` alongside each track's `libraries` key array. The adapter keeps its field-level validation and also rejects a track that references an unknown library.
- **Switching libraries is a `tracksLoaded`.** The adapter filters the list and dispatches it; core does not change. If the current track is in the new list it keeps playing; otherwise the cursor moves to the new head and playback continues.
- **The selected library is a preference.** It is stored through the preference channel, and "all" is a view rather than a library.
- **The switcher lives in the expanded panel header**, and it includes the "all" view.
- **Every track belongs to at least one library**, so both "all" and each library view are well defined.

## Authoring: folders are libraries

The manifest is generated, not hand-written. `pnpm music:manifest` scans `MUSIC_CONTENT_ROOT` and derives membership from the directory layout, so creating a library means creating a folder.

- **The first path segment under the content root is the library.** `podcast/episode-01.mp3` belongs to `podcast`, and `music/album/track.flac` also belongs to `music`; deeper folders are free organisation inside one library.
- **Files directly under the content root belong to the default library**, which is why a manifest carrying no library information at all is still valid.
- **The key comes from the folder name**, slugified the same way a `trackKey` is; the title is the folder name as written.
- **A numeric prefix orders the libraries.** `01-podcast/` sorts before `02-music/`, and the prefix is stripped from both the key and the title, matching how the docs importer reads numeric prefixes.
- **Hand-written values still win.** A `libraries` array or a library title written by hand survives a re-run the same way a hand-edited track title does, and a library that only a hand-written array references is still emitted — with its key as the title — so the manifest stays importable. Hand-writing is the only way to express multi-membership, which folders cannot.
- **`scripts/music-manifest.mjs` therefore changes as part of this work.** It writes `{ tracks }` today and rebuilds every entry field by field, so any library information put there by hand is dropped on the next run: the field has to be produced by the generator rather than written.

## Rejected alternatives

| Option | Why not |
| --- | --- |
| A `library` string column on `music_tracks` | Renaming rewrites every row, libraries cannot be ordered or left empty, and a typo silently creates one. It also cannot express multi-membership, which was the deciding requirement. |
| A per-library `position` on the join row | Not needed while membership is a label; adding a nullable column later is a light migration. |
| A per-track object array carrying positions | The same reason, plus it multiplies authoring and validation cost. |
| Server-side filtering with `?library=` | The catalogue is a few dozen rows. One response keeps validation in one place and avoids a second round trip on every switch. |
| A localized library entity, with a title per locale | Track titles are not localized either; libraries follow the same shape. |
| Decoupling the visible list from the queue | It would change the player's core model. Swapping the list and letting core decide is the behaviour that was chosen. |

## Consequences

- Switching libraries keeps playing when the current track is in the selected library; otherwise core's existing rule applies and the cursor moves to the new head, still playing. The listener hears a different track. If that turns out to be wrong in use, pausing on a switch needs a new core input, because core cannot currently replace a queue and stay paused.
- Deactivating a library deletes neither tracks nor media; memberships are rewritten from the manifest on every import.
- `--validate` reports a library that would be deactivated and a manifest that references an unknown library.
- The list heading counts the visible view, so `列表（27）` becomes the selected library's count once one is selected.
- **Renaming a library folder is not a rename.** The folder name is part of every `file` path inside it, so the generator sees new files: new `trackKey` values, while the previous entries stay in the manifest as missing-on-disk and are deactivated on the next import. Rename the `title` instead when only the display name should change.
- The generator, the import CLI, the API, the adapter and the player all move together in B-19; the runbook's directory layout section changes with them.
