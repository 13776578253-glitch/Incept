# Music Libraries

## Status

Accepted and implemented on 2026-09-17 (B-19). The schema, the manifest contract, the import semantics and the player wiring below all describe shipped behaviour.

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
- **The switcher lives in the expanded panel header**, and it includes the "all" view. It is a row of segmented chips with "all" first, scrolling sideways rather than wrapping, and it is hidden while only one library exists, because "all" and that library would then be the same view.
- **The default library is mechanical in the manifest and localized in the player.** The generator writes `default` as both key and title; the switcher renders localized copy for that key (默认 / Default).
- **A library with no folder left and no entry referencing it is removed** from the manifest by the generator, which reports it, so the next import deactivates the library instead of deleting it. Entries whose files are missing on disk are kept, so deleting a folder alone does not remove a library while stale entries still name it.
- **Every track belongs to at least one library**, so both "all" and each library view are well defined.
- **Two import modes are distinguished by the top-level field alone.** A manifest without `libraries` is legacy: only the `default` library is created or reactivated, memberships are added for this manifest's tracks, and nothing is removed or deactivated. A manifest with `libraries` is authoritative: a track that omits the per-track field means `['default']` and the manifest must declare `default`, undeclared libraries are deactivated, and memberships are rewritten wholesale.

## Authoring: folders are libraries (CLI bulk migration only)

> **Since 2026-09-18 daily authoring happens in the web** (see [music-authoring-in-the-web.md](./music-authoring-in-the-web.md)): uploads and edits write the database and the mirror directly, and libraries are created, renamed, deactivated and restored from the UI. The rules below describe the `pnpm music:manifest` bulk path — moving to another machine, rebuilding, or importing a set of existing folders in one go.

The manifest is generated, not hand-written. `pnpm music:manifest` scans `MUSIC_CONTENT_ROOT` and derives membership from the directory layout, so creating a library means creating a folder.

- **The first path segment under the content root is the library.** `01-podcast/episode-01.mp3` belongs to `podcast`, and `02-music/album/track.flac` also belongs to `music`; deeper folders are free organisation inside one library.
- **A first-level folder that contains audio must carry a numeric prefix.** `01-podcast`, not `podcast`: the prefix keeps the order explicit and matches how the docs importer numbers its collections. An unnumbered folder, a repeated number, or two folders that derive the same key all fail the generator instead of being resolved silently.
- **Files directly under the content root belong to the default library**, which is why a manifest carrying no library information at all is still valid.
- **The key comes from the folder name**, slugified the same way a `trackKey` is; the title is the folder name as written.
- **The numeric prefix is stripped from key and title, and only orders new libraries.** `01-podcast/` sorts before `02-music/`; the prefix never enters the key. It decides the *initial* position only: an existing library keeps its `position` after a folder is renumbered, so renumbering is not how an existing library is reordered.
- **Hand-written values still win, but a hand-written key has to exist.** A `libraries` array or a library title written by hand survives a re-run the same way a hand-edited track title does. A key that no numbered folder derives and that the previous manifest does not declare is an error: silently emitting it would turn a typo into a library and the importer's "undeclared library" check would never fire. A library without a folder is added by declaring it in the manifest's `libraries` array first — from the next run on it counts as declared. Hand-writing is the only way to express multi-membership, which folders cannot.
- **The generator owns the field.** `scripts/music-manifest.mjs` writes `{ libraries, tracks }`, and `apps/web/src/server/music/manifest-builder.ts` holds the derivation plus the merge with the previous manifest, which is what makes hand-written titles, positions and memberships survive a re-run. The generator's `--root <dir>` flag scans a directory other than `MUSIC_CONTENT_ROOT`, which is how the derivation is exercised without touching real content.

## Management surface

> **Superseded on 2026-09-18.** The screen is no longer a manifest editor: it writes the database directly and covers uploads, track editing, and creating / renaming / deactivating libraries. The manifest hash and its conflict handling retired with the manifest. The full rules are in [music-authoring-in-the-web.md](./music-authoring-in-the-web.md).

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
- `--validate` reports eight problem kinds in total: the original five plus `libraryNotImported`, `membershipMismatch` and `willDeactivateLibrary`. A manifest that references an unknown library is still a hard parse error rather than a reported issue.
- **Deleting a folder does not by itself remove its library.** Missing-on-disk entries are kept, so as long as one of them still names the library the library stays; those entries have to leave the manifest as well before the library is dropped and deactivated.
- The list heading counts the visible view, so `列表（27）` becomes the selected library's count once one is selected.
- **Renaming a library folder is not a rename.** The folder name is part of every `file` path inside it, so the generator sees new files: new `trackKey` values, while the previous entries stay in the manifest as missing-on-disk and are deactivated on the next import. Rename the `title` instead when only the display name should change.
- The generator, the import CLI, the API, the adapter and the player shipped together in B-19; the runbook's directory layout, validation list and boundaries sections were updated with them.
