# Music Content Import

For whoever runs the import. Covers turning audio files into tracks the player can read, and what to do when it fails.

## Prerequisites

- PostgreSQL is running (`docker compose --env-file .env.docker up -d`)
- Migrations are applied (`pnpm db:deploy`)
- `apps/web/.env.local` sets `MUSIC_CONTENT_ROOT` to an absolute path outside the repository

The content root stays outside the repository. Only the published mirror (`apps/web/public/_music-media/`) lives inside it, and that directory is gitignored.

## Directory layout

**Folders are libraries.** `pnpm music:manifest` derives membership from the path, so adding a library means adding a folder — no hand-written JSON.

```
<MUSIC_CONTENT_ROOT>/
  music.json            ← the manifest, the import's only input; written by the generator
  podcast/
    episode-01.flac
    episode-02.mp3
  music/
    album/
      track-01.mp3      ← deeper folders are organisation only; this still belongs to "music"
  intro.mp3             ← directly under the root: the default library
```

Manifest format (the shape the generator writes):

```json
{
  "libraries": [
    { "key": "podcast", "title": "podcast", "position": 1 },
    { "key": "music", "title": "music", "position": 2 }
  ],
  "tracks": [
    {
      "trackKey": "podcast-episode-01",
      "file": "podcast/episode-01.flac",
      "title": "Episode One",
      "artist": "Optional",
      "publishedAt": "2026-09-15",
      "position": 1,
      "libraries": ["podcast"]
    }
  ]
}
```

Field rules:

- `trackKey` is required and must be unique within the manifest. It is the **content identity** — when a file's content changes, issue a new key rather than changing what an existing key points at
- `file` is required and relative to the content root. After `realpath` it must still resolve inside the root, so symlinks and directory junctions pointing outside are rejected
- `title` is required; `position` is a required integer and decides list order — and, inside a library, the order of that library's tracks
- `artist` and `publishedAt` are optional. `publishedAt` renders on the right of the list row; when it is absent the row shows the duration instead
- `libraries` on a track is written by the generator from the folder the file sits in. A value written by hand is preserved, and it is the only way to put one track in several libraries
- Referencing a library that was not declared, or passing an empty array, makes the import fail: a misspelled key has to be loud rather than silently creating a library

Allowed extensions: `.mp3`, `.wav`, `.flac`. Single file limit: 128 MB.

**Do not point `file` at something inside the repository.** Content addressing copies the bytes into the mirror, and pointing at the repository defeats the point of keeping the content root outside it.

## Adding and adjusting libraries

| What you want | How |
| --- | --- |
| Add a library | Create a folder under the content root, put audio in it, run `pnpm music:manifest` and `pnpm music:import` again |
| Change the display name | Edit `libraries[].title` in the manifest; a re-run does not overwrite it |
| Change the order | Prefix the folder with a number (`01-podcast`), or edit `libraries[].position`, which is also preserved |
| Put one track in several libraries | Add `libraries: ["a", "b"]` to that track by hand; a re-run keeps it |

**Do not rename a folder to change a display name.** The folder name is part of every `file` path inside it: renaming makes the generator treat those files as new (new `trackKey` values), while the previous entries stay in the manifest as missing-on-disk and are deactivated on the next import.

## Daily flow

```bash
pnpm db:deploy              # make sure migrations are applied
pnpm music:manifest         # scan the content root, create or update music.json
# edit titles, dates and order as needed — the generator preserves your edits
pnpm music:import --dry-run # validate everything and report the plan, writing nothing
pnpm music:import           # the real run
pnpm music:import --validate
```

`--validate` reports five kinds of inconsistency and exits with status 1, so it works in scripts:

- `orphanMirror` — a file in the mirror that no database row references
- `missingMirror` — a database row whose file is not in the mirror
- `notImported` — present in the manifest, absent from the database
- `willDeactivate` — an active database row no longer in the manifest; the next import will deactivate it
- `staleAudioUrl` — the file name the manifest implies does not match the URL recorded in the database, which means **the content changed without rotating the `trackKey`**. That breaks the contract and the server keeps serving the old bytes, so it has to be dealt with

## Flags

| Flag | Effect |
| --- | --- |
| `--manifest <path>` | Use a specific manifest. Defaults to `<MUSIC_CONTENT_ROOT>/music.json` |
| `--dry-run` | Validate and report the plan without writing media or database rows |
| `--validate` | Consistency check only; writes nothing |
| `--allow-empty` | Accept an empty manifest. **Dangerous**: an empty manifest deactivates every existing track, which is why it is rejected by default |

## Failure and recovery

**The database write fails after the media was copied.** The import splits the two: media lands first, the database write happens in a single transaction. On failure the command exits non-zero and prints **which files it actually copied**. No partial rows survive the rollback, and the copied media **is reusable as-is** — running the import again reuses it instead of copying twice, and does not insert duplicate rows.

**Orphan mirrors.** Changing a `trackKey`, or changing a `file`, leaves the previous mirror file on disk with nothing referencing it. `pnpm music:import --validate` finds them. **Do not delete them blindly** — a deactivated row may still reference the file, and removing it would leave that record pointing at nothing.

**A manifest file has disappeared.** The manifest generator **deliberately keeps** such entries and reports them. Removing the entry would make the next import silently deactivate that track, and a missing file usually just means it moved. Edit `music.json` by hand once you are sure.

**The duration cannot be read.** `durationSeconds` stays empty and the import continues. The track still plays; only that one list column is blank.

## Known costs

**Mirror reuse reads the whole file.** Every time the import validates a reused file it recomputes the byte length and SHA-256 instead of just checking that the file exists — an existence check would let a corrupted or truncated file be reused silently and then served. The cost is that import time scales with the size of the library. When imports get slow, this is why, not the database.

## Boundaries

This is a **local and internal** solution. The database stores only the site URL (`/_music-media/<sha256>.<ext>`) and never a machine path, so moving to object storage and a CDN means replacing the publishing implementation and the URL prefix while the manifest contract, the database columns and the player stay unchanged.

Replacing it before release is not optional: files under `public/` **cannot be access-controlled**, and audio is far larger than images, so range requests and CDN caching have to be verified on the real deployment platform rather than assumed from a development environment.
