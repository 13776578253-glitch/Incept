# Tracks and libraries are authored in the web

## Status

Accepted and implemented on 2026-09-18. **This supersedes** the "the manifest is the desired state" and "a folder is a library" parts of [music-source-storage-and-import.md](./music-source-storage-and-import.md) and [music-libraries.md](./music-libraries.md) as the **daily authoring path**. What those documents still describe holds: the data shape, the content-addressed mirror, `trackKey` as identity, the API contract and the player. The CLI pipeline stays as a bulk migration and rebuild tool.

## Background

B-19 made tracks and libraries usable, but authoring still went through the manifest: drop a file into the content root → `pnpm music:manifest` → `pnpm music:import`. The settings page was only a manifest editor, "create a library" meant "create a numbered folder", and removing one meant deleting a folder. In practice that is too much ceremony for adding a song, and the editor had to defend itself against external edits (the manifest hash loaded with the page, a 409 on conflict).

The requirement is the opposite: **pick files or a folder in the browser and get full create/read/update/delete over tracks and libraries.**

## Decision

- **The web is the only write path.** Uploads and edits write the database and the mirror directly; `music.json` is out of the loop. The manifest and the CLI drop to a one-off bulk tool: use them to migrate or rebuild, not day to day.
- **One edit is one request; there is no global save.** Rename, membership, order and activation each send their own request, the UI updates optimistically, and a failure reports and rolls back. The manifest hash and its conflict handling retired together with the manifest.
- **Uploads are one file per request, streamed to disk.** The body is the raw bytes (not multipart, which buffers the whole file). The server writes a temp file while hashing and counting, aborts and deletes the temp file past the limit, then reuses or atomically renames into the mirror by content address. Still `.mp3` / `.wav` / `.flac` only, 128 MB per file.
- **Metadata comes from the audio tags.** After the bytes land, `music-metadata` reads title / artist / duration (the same entry point the importer uses for duration); a missing tag falls back to the file name, and all three fields are editable in the table. Uploads never fail because tags are missing.
- **A folder upload keeps the "first directory is the library" habit.** The browser gives relative paths, the first segment (numeric prefix stripped) becomes the library name, and a missing library is created; uploading loose files asks for the library instead. This is continuity of habit, not a rule of the system.
- **`trackKey` is derived from the file name and is still identity.** The transliteration rules are shared with the generator (`music-key.ts`); re-uploading the same name gets a `-2` / `-3` suffix. Renaming a title or moving memberships does not change identity; renaming the file does.
- **Deleting deactivates rather than erases.** A track goes `isActive=false`, its media file stays, and the UI offers a restore. **Deactivating a library requires choosing where its members go** (moved in the same request), and the last active library cannot be deactivated — so "every active track belongs to at least one active library" always holds and the player's read never fails because of a UI action.
- **There is one read path for playback.** The admin screen uses `listAll*` (deactivated rows included); the player keeps using `listActiveMusicCatalog()` (single-transaction snapshot, active rows only). Routes only serialize, and the adapter and player are untouched.
- **Owner isolation is unchanged.** The block renders only for `viewer.role === 'owner'`, and the write routes re-check the owner session plus same-origin, answering 404 to everyone else.

## Rejected alternatives

| Alternative | Why not |
| --- | --- |
| Keep editing the manifest from the web, just smoother | Two authorities (manifest and database) force conflict handling; the ask was "upload it and it is in the library", not "upload it and then import". |
| Keep the manifest authoritative but let the web trigger the import | A wider conflict surface: external manifest edits, failed imports and partial imports all desynchronise the UI from the database, and the user never sees the manifest. |
| Multipart upload | A 128 MB file lands in memory in one piece; one raw-byte stream per file both streams to disk and hashes on the way. |
| Write the uploaded file into the content root | The content root serves the migration tool; once the web authors content it is not needed, and writing there creates a second truth. |
| Deleting rows and media for real | A mis-click in the UI would be unrecoverable, and a content-addressed mirror entry cannot be rebuilt without the original file. |
| Auto-merging members into the first library on deactivation | Membership is a content decision, not an ordering detail; asking costs one dropdown. |
| Per-library ordering | `position` belongs to the track today, so a track in two libraries shares one order; doing it per library needs a column on the join row and is a separate ask. |

## Consequences

- **The content root is no longer a dependency of web authoring**: the admin block does not read `MUSIC_CONTENT_ROOT` and does not need `music.json`. Only the CLI does.
- **The database is the source of truth and the manifest is a migration artefact.** There is no "export the manifest from the database" command: to migrate, regenerate the manifest with the CLI or copy the mirror directory as described in the [library management runbook](../runbooks/en/music-library-management.md).
- **Mirror cleanup stays manual**: deactivation keeps media, `pnpm music:import --validate` reports files nothing references, and deleting them is a human step. Removing a track does not free disk space.
- **The CLI warns.** Rows the manifest does not describe (added in the web) are deactivated by an import, so `pnpm music:import` lists them before it writes anything. Read that output before using the migration tool.
- **The limits stay hard**: 128 MB, `.mp3` / `.wav` / `.flac`, an error past that; no chunking and no transcoding.
- **Concurrent editing is unprotected**: one owner, one transaction per request; if two edits touch the same row, the later write wins.

## Boundaries

- No resumable or chunked uploads, no transcoding; 128 MB per file.
- No hard delete or cleanup entry point for media, and no trash.
- No per-library ordering, no bulk editing, no drag-and-drop (order is the track's `position`, moved with up/down buttons).
- No batch status beyond upload progress: uploads run one after another, and a failure does not stop the rest.
