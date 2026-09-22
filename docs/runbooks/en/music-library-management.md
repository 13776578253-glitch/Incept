# Music Track And Library Management

For whoever maintains the content. **Daily authoring happens in the web**: upload audio, edit tracks, manage libraries. The command line is only for bulk migration and rebuilding.

The rules and the reasoning live in [Tracks and libraries are authored in the web](../decisions/en/music-authoring-in-the-web.md); the migration tool (content root, manifest, importer) is described in [music-content-import.md](./music-content-import.md).

## Three things to understand first

| Thing | Where | Who may change it |
| --- | --- | --- |
| The database | `music_tracks` / `music_libraries` / `music_library_items` | **The web** (uploads and edits) or a bulk import |
| Published audio | `apps/web/public/_music-media/<sha256>.<ext>` (gitignored, no second copy) | Web uploads or a bulk import; both are content-addressed |
| The migration manifest and originals | audio plus `music.json` under `MUSIC_CONTENT_ROOT` | Only during a bulk migration — ignore it day to day |

In one sentence: **the database is the source of truth, the mirror is content-addressed, and the manifest is just a migration tool.**

## First run

```bash
pnpm db:deploy    # make sure migrations are applied
pnpm dev          # start the site (track and library management lives under Settings → Music, owner only)
```

To add content you need **neither a content root nor a manifest**: open the settings page and upload. A content root is only needed to import a batch of existing folders in one go — see [music-content-import.md](./music-content-import.md).

## Become the owner

There is no owner login form on the site. Open any page and run this once in the browser console (F12):

```js
await fetch('/api/auth/owner/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    secret: 'paste OWNER_ACCESS_SECRET from apps/web/.env.local here',
  }),
});
```

A `204` sets the session cookie (30 days, httpOnly); reload the page and you are the owner. The block renders for the owner only, and the write routes re-check the owner session plus same-origin.

## Everyday: uploading

Open **Settings → Music → Tracks and libraries** and use the upload zone:

| What you want | How |
| --- | --- |
| Add a few loose files | "Choose files" (multi-select) or drop them on the dashed area; the "Library" dropdown decides where they go |
| Upload a NetEase download | Drop the `.ncm` as-is: the server decrypts it to its original mp3/flac, keeps the embedded title and artists, and stores only the plain audio |
| Import an album or an episode set in one go | "Choose folder" and pick the directory: **the first directory name is the library name** (`01-podcast` → "podcast"), and a missing library is created for you |
| Watch progress and results | One row per file: queued → uploading x% → done / failed (with the server's reason); a "done" row says which kind of success it was (uploaded, reused the existing file, already in the library, added to this library, or exists-but-deactivated), and uploads run one after another |

- Title, artist and length come from the audio tags; a missing tag falls back to the file name. The panel shows what the tags gave it (hand editing titles is not offered — see B-22).
- `.mp3` / `.wav` / `.flac` only, 128 MB per file, no transcoding and no chunking. Anything else is summarised in one line (`<first file> and N more are not supported audio`, click to expand the full list) instead of being sent — and a folder that carries no audio creates no library.
- **The bytes must really be audio.** The name's extension is only the first gate: the server sniffs the header, parses the file and requires an audio stream, so a text file or an image with an audio name is refused with a reason (nothing reaches the mirror), and a wav named `.mp3` is stored — and served — as a wav.
- **Uploading the same bytes again adds nothing.** The row is reused: the same library answers "Already in the library", another library gets only a membership ("Added to this library") — that is the normal way to put an existing song into a second library. `.ncm` and `.mp3` of the same song count as the same bytes.
- A song that is *similar* but not byte-identical (another encoding, another bitrate) is uploaded as its own row, and the file's row adds "Possible duplicate of …". Nothing is merged automatically.
- A track that already exists but is deactivated answers "Exists but is deactivated; restore it first" and is left alone — restore it in the table, then upload again if you want the membership.

## Everyday: tracks and libraries

Every edit **applies immediately** (there is no global save button): each action sends one request, and a failure reports and rolls the screen back.

| What you want | How |
| --- | --- |
| Change a title or artist | Not offered. The panel shows what the tags gave it and falls back to `-`; recognition is improved on the import side (B-22), not by hand |
| Erase a track, or an empty library, for good | Right-click the row → "Delete permanently" → confirm. The track and its memberships go; its media file stays until the cleanup command below runs; there is no undo |
| Put a track in several libraries, or take it out of one | Open the **Libraries** dropdown in the track's row and tick or untick an entry; the menu stays open while you tick several. The last one cannot be unticked — every track belongs to at least one library |
| Reorder tracks | That row's ↑ / ↓ (swaps the two `position` values; a track in several libraries shares one order) |
| Take a track down | "Deactivate": the row stays, its media file is kept, and "Restore" brings it back |
| Add a library | Type a name under "Libraries" → "Create" (the server derives the key from the name and reuses an existing library with the same name) |
| Rename a library | Edit that row's input, then Save |
| Reorder libraries | That row's ↑ / ↓ |
| Deactivate a library | "Deactivate" → if it still has tracks, pick **where its members move** first, then confirm. The last active library cannot be deactivated |
| Restore a library | "Restore" |

The search box filters by title / artist / key, the dropdown next to it filters by library, and the table scrolls horizontally.

## Bulk migration and rebuild (command line)

Only for two situations: moving to another machine or rebuilding, or importing a whole content root at once. Do not use this path for daily edits.

```bash
pnpm music:manifest             # scan the content root, create or update <root>/music.json
pnpm music:import --dry-run     # report what would happen, writing nothing
pnpm music:import               # copy into the mirror by content address, then write the database in one transaction
pnpm music:import --validate    # consistency check across manifest / database / mirror; exits 1 when something is off
```

**Important: a manifest import is authoritative.** Tracks added in the web are not in the manifest, so an import **deactivates** them and any library it does not describe. The command lists those rows before it writes anything; if you see that warning, make sure this import really should override the web's content — otherwise keep maintaining it in the web.

## Media cleanup (command line)

Nothing in the web deletes media: a failed upload, a deactivated track and a deleted track all leave their file in the mirror. Reclaim the files no row references with:

```bash
pnpm music:cleanup           # list them (writes nothing)
pnpm music:cleanup --apply   # delete them
```

- **Run it while nothing is uploading** — close the settings page and make sure no import is running. The command cannot tell whether a writer is active, and a file an in-flight upload just published but has not committed yet would look unreferenced.
- It only considers content-addressed names (`<64 hex>.<mp3|wav|flac>`), so `.upload.tmp` files and anything else in the directory are left alone.
- `pnpm music:import --validate` reports the same orphans as part of its manifest comparison; the cleanup command is the one that removes them.

## Backup and recovery

> **The mirror has no second copy, and it sits inside the repository workspace.** `apps/web/public/_music-media/` is gitignored: git does not track it and nothing backs it up. A "clean the workspace" pass, a delete made while switching branches, or emptying the directory all leave the database rows pointing at files that no longer exist — the player then has nothing to load (every `/_music-media/*` request is a 404), and **a deleted file exists nowhere else**, so only the originals can bring it back. Copy the directory away (second bullet below) before anything touches it.

- **Metadata**: the database is it. Take a `pg_dump`; after restoring, a stale `music.json` in the content root does not matter.
- **Audio**: copy the whole `apps/web/public/_music-media/` directory (named by sha256, deduplicated, verifiable). If the originals are still in the content root, that works too.
- **Migrating**: move the database and the mirror directory, run `pnpm db:deploy`, start the site. If the migration tool needs a manifest, point it at a content root and run `pnpm music:manifest`.
- **No "export a manifest from the database" command**: the manifest is not an artefact; regenerate it when you need the bulk tool.
- **Orphan files in the mirror**: deactivating a track keeps its media, deleting one keeps it too, and an upload that fails after publishing leaves its file behind. `pnpm music:cleanup --apply` is what reclaims them (run it while nothing is uploading); `pnpm music:import --validate` lists the same files inside its report.

## When something looks wrong

| Symptom | Cause and what to do |
| --- | --- |
| No management block in settings | You are not the owner: run the console step above and reopen the page |
| The upload list says "… and N more are not supported audio" | Those files were filtered by extension and never sent; click the line to see the full list. No library was created for them |
| Upload says "The file is not MP3, WAV or FLAC audio" or "no readable audio stream" | The bytes are not audio, or only a container shell: the file was refused and never reached the mirror |
| Upload says "Unsupported music file extension" | The extension is not `.mp3` / `.wav` / `.flac` (the picker normally filters this out; a `.ncm` is the fourth accepted extension) |
| Upload says "Already in the library" / "Added to this library" / "reused the existing file" | Not an error: the content already existed, so the row (or the mirror file) was reused — see the dedup bullets above |
| Upload says "Exists but is deactivated" | The content is already a row that is deactivated: restore it in the table, then upload again if you want it in this library too |
| Upload says "The file exceeds the 128 MB limit." | Over 128 MB per file; transcode or trim it — chunked upload is not implemented |
| Upload says "does not exist or is deactivated" | The target library was deactivated: restore it, or pick another |
| An uploaded file is missing from the player | It went into a deactivated library, or the browser cached the catalogue: reload the page |
| The player loads nothing, reports "Audio failed to load", and the server log shows `/_music-media/*` 404s | The mirror files are gone (a workspace cleanup, a delete made while switching branches, the directory emptied) while the rows remain. Upload the originals again — content addressing hits the same row and only republishes the file; with a backup, copy it straight back into `apps/web/public/_music-media/` |
| The library's "Deactivate" button will not press | It is the last active library — at least one must remain |
| The track's "Restore" button will not press | The track has no memberships: give it an active library first |
| "The database is unavailable" | Check that the database runs and `DATABASE_URL` is right; the screen stays read-only until then |
| The import is slow | Reusing a mirror file re-hashes the whole file, so time scales with the library size — not the database |

## Boundaries

- Deactivating removes nothing; the permanent delete removes the row and its memberships but keeps the media. Disk is freed only by `pnpm music:cleanup`, and that command trusts you to run it while nothing is uploading.
- Uploads have no resume, no chunking and no transcoding; one file at a time, and a failure does not affect the rest.
- Duplicate hints compare normalized strings and duration only: there is no audio fingerprint, no list-level duplicate scan, and nothing merges automatically (B-23).
- One piece of content is one row by database rule; re-uploading the same bytes cannot create a second row, whatever it is named. Rows without a `contentHash` (imported before the column existed) are never matched.
- When the database write fails, the upload leaves the file it just published as an orphan (the API never deletes content-addressed media, because a concurrent upload may already be reusing that file): `pnpm music:cleanup` reclaims it while nothing is uploading. An interrupted process can also leave a `.upload.tmp` behind, which the cleanup command does not touch.
- Order is the track's own `position`, shared across the libraries it belongs to; there is no drag-and-drop and no bulk editing.
- Concurrent editing is unprotected: one owner, and if two edits touch the same row the later write wins.
- Access control and the CDN belong to the deployment stage; see the boundaries section of the import runbook.
