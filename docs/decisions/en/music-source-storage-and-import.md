# Music Source, Storage And Import

## Status

Accepted on 2026-09-17. The pipeline it describes is implemented and committed: the table in `0df59c1`, the media store in `75f1ec4`, the source and import pipeline in `1d77175`, and catalogue hardening with import-time duration extraction in `1c09f27`. The boundaries below still hold — the local mirror is a staging shape, and object storage plus a CDN remains a release requirement.

> **Since 2026-09-18:** daily authoring moved to the web (see [music-authoring-in-the-web.md](./music-authoring-in-the-web.md)): uploads and edits write the database and the mirror directly, and the manifest and CLI are used only to migrate or rebuild. What this document keeps — the data shape, the content-addressed mirror, `trackKey` as identity and the import pipeline rules — is unchanged.

## Context

The floating music player needed real audio instead of a module of mock tracks. The repository already had exactly one media precedent: the docs image pipeline. That pipeline keeps originals outside the repository, publishes content-addressed copies into `apps/web/public/_docs-media/`, and stores only the resulting site URL in the database. Anything the player needed had to either follow that shape or justify diverging from it.

Three constraints shaped the outcome.

1. **The player runtime mounts above the locale segment**, so it must not read the database directly. Its data has to arrive as an explicit input.
2. **`@incept/music-player-core` is DOM-free and host-free.** It cannot know about files, URLs or storage.
3. **Deployment is undecided.** Nothing about the hosting platform could be assumed, including HTTP Range support.

## Decision

Adopt the docs pattern, with the player's own storage root and pipeline.

- **Originals live outside the repository**, under `MUSIC_CONTENT_ROOT`.
- **A manifest describes the library.** `music.json` lists each track with an explicit `trackKey`, the `file` path relative to the root, a title, an optional artist and date, and an explicit integer `position`.
- **Publication is content-addressed.** `scripts/music:import` copies each file to `apps/web/public/_music-media/<sha256>.<lowercased extension>`. Identical bytes are one object; the same bytes under a different extension are two. The mirror is never committed.
- **The database stores site URLs only.** `MusicTrack.audioUrl` holds `/_music-media/<hash>.<ext>`. No local absolute path is ever written to the database, so the storage backend can be replaced without touching a row.
- **The manifest contract treats content changes as new identities.** If a file's content changes, it gets a new `trackKey`. The importer will still update a row whose content changed under an unchanged key, but it records a warning, because silently serving new bytes under an old identity is worse than a noisy import.
- **Core receives the catalogue as a runtime event.** `tracksLoaded` carries the track list; core decides what a reload means for the current track, and it never sees a URL, a file or an error string from the storage layer.
- **Catalogue failure is not an audio failure.** Storage and network problems surface as a catalogue status in the adapter. Core's `errored` state is reachable only from `audioErrored` and `playRejected`.

## Rejected alternatives

| Option | Why not |
| --- | --- |
| Commit audio files to the repository | The library would be re-shipped on every clone and deploy, and a single lossless track can exceed 100 MB. |
| Store blobs in the database | Backups and queries degrade badly, and it does not solve delivery. |
| Git LFS | Removes the main-repo bloat but a clone still fetches everything, and it provides no access control. |
| Third-party hosting or podcast platforms | Acceptable as a source, but it hands delivery, availability and cross-origin behaviour to a third party. |
| A single `packages/music-player` package | The React, Tailwind and i18n cost of a UI package was not justified for one consumer. |

## Boundaries

- **Music is public content by decision.** Files under `public/` cannot be gated, so per-track access levels are not available while the local mirror is in use.
- **The local mirror is a staging shape, not the delivery design.** With the deployment platform undecided, HTTP Range support is unverified. Object storage plus a CDN is a release requirement; the authoring syntax, the database columns and the player contract are all designed to survive that swap unchanged.

## Consequences

- Replacing the backend means changing the publishing implementation and the URL prefix. The manifest, the CLI surface and every database column stay as they are.
- `--validate` compares the manifest, the database and the mirror, so drift is detectable rather than silent.
- Import is idempotent: content addressing prevents duplicate copies and `trackKey` prevents duplicate rows.
- The importer verifies a mirror file's size and hash on reuse, so a corrupted mirror is repaired instead of silently served. The cost is reading the mirror on every import.
- Entries whose file disappeared from disk are kept in the manifest rather than pruned, because pruning would silently deactivate them on the next import.
