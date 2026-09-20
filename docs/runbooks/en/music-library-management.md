# Music Track And Library Management

For whoever maintains the content. **Daily authoring happens in the web**: upload audio, edit tracks, manage libraries. The command line is only for bulk migration and rebuilding.

The rules and the reasoning live in [Tracks and libraries are authored in the web](../decisions/en/music-authoring-in-the-web.md); the migration tool (content root, manifest, importer) is described in [music-content-import.md](./music-content-import.md).

## Three things to understand first

| Thing | Where | Who may change it |
| --- | --- | --- |
| The database | `music_tracks` / `music_libraries` / `music_library_items` | **The web** (uploads and edits) or a bulk import |
| Published audio | `apps/web/public/_music-media/<sha256>.<ext>` (gitignored) | Web uploads or a bulk import; both are content-addressed |
| The migration manifest and originals | audio plus `music.json` under `MUSIC_CONTENT_ROOT` | Only during a bulk migration — ignore it day to day |

In one sentence: **the database is the source of truth, the mirror is content-addressed, and the manifest is just a migration tool.**

## First run

```bash
pnpm db:deploy    # make sure migrations are applied
pnpm dev          # start the site (track and library management lives under Settings → Plugin, owner only)
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

Open **Settings → Plugin → Tracks and libraries** and use the upload zone:

| What you want | How |
| --- | --- |
| Add a few loose files | "Choose files" (multi-select) or drop them on the dashed area; the "Library" dropdown decides where they go |
| Import an album or an episode set in one go | "Choose folder" and pick the directory: **the first directory name is the library name** (`01-podcast` → "podcast"), and a missing library is created for you |
| Watch progress and results | One row per file: queued → uploading x% → done / failed (with the server's reason); uploads run one after another |

- Title, artist and length come from the audio tags; a missing tag falls back to the file name, and you can edit all three in the table afterwards.
- `.mp3` / `.wav` / `.flac` only, 128 MB per file, no transcoding and no chunking.
- Uploading the same bytes again costs no extra disk (the mirror is named by sha256 and hit files are reused), but it does add a row; the same file name gets a `-2` suffix on its key.

## Everyday: tracks and libraries

Every edit **applies immediately** (there is no global save button): each action sends one request, and a failure reports and rolls the screen back.

| What you want | How |
| --- | --- |
| Change a title or artist | Edit it in the table, then press Save on that row |
| Put a track in several libraries, or take it out of one | Light or clear the chips under "Libraries". The last one cannot be cleared — every track belongs to at least one library |
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

## Backup and recovery

- **Metadata**: the database is it. Take a `pg_dump`; after restoring, a stale `music.json` in the content root does not matter.
- **Audio**: copy the whole `apps/web/public/_music-media/` directory (named by sha256, deduplicated, verifiable). If the originals are still in the content root, that works too.
- **Migrating**: move the database and the mirror directory, run `pnpm db:deploy`, start the site. If the migration tool needs a manifest, point it at a content root and run `pnpm music:manifest`.
- **No "export a manifest from the database" command**: the manifest is not an artefact; regenerate it when you need the bulk tool.
- **Orphan files in the mirror**: deactivating a track keeps its media. `pnpm music:import --validate` reports "mirror files nothing references"; delete them by hand after checking — that is the only cleanup path today.

## When something looks wrong

| Symptom | Cause and what to do |
| --- | --- |
| No management block in settings | You are not the owner: run the console step above and reopen the page |
| Upload says "Unsupported music file extension" | The extension is not `.mp3` / `.wav` / `.flac` |
| Upload says the file is too large | Over 128 MB per file; transcode or trim it — chunked upload is not implemented |
| Upload says "does not exist or is deactivated" | The target library was deactivated: restore it, or pick another |
| An uploaded file is missing from the player | It went into a deactivated library, or the browser cached the catalogue: reload the page |
| The library's "Deactivate" button will not press | It is the last active library — at least one must remain |
| The track's "Restore" button will not press | The track has no memberships: give it an active library first |
| "The database is unavailable" | Check that the database runs and `DATABASE_URL` is right; the screen stays read-only until then |
| The import is slow | Reusing a mirror file re-hashes the whole file, so time scales with the library size — not the database |

## Boundaries

- Deleting deactivates: no rows and no media are removed, and no disk is freed; clearing unreferenced mirror files stays a manual step.
- Uploads have no resume, no chunking and no transcoding; one file at a time, and a failure does not affect the rest.
- Order is the track's own `position`, shared across the libraries it belongs to; there is no drag-and-drop and no bulk editing.
- Concurrent editing is unprotected: one owner, and if two edits touch the same row the later write wins.
- Access control and the CDN belong to the deployment stage; see the boundaries section of the import runbook.
