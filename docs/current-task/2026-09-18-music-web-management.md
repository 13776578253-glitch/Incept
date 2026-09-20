# Music Authoring In The Web

## Status

Implemented and verified on 2026-09-18. Not committed at the time of writing; the proposed commit is `feat(web): author tracks and libraries from the settings page`. It replaces the manifest-editor round recorded in `docs/finish-task/2026-09-18-music-library-management.md`.

## Scope

Settings → Plugin → **Tracks and libraries** (owner only) became a content manager instead of a manifest editor:

- **Upload**: drag-and-drop or pick files (`multiple`), or pick a folder (`webkitdirectory`) whose first directory name becomes the library name; per-file progress and per-file errors; uploads run one after another;
- **Tracks**: inline title/artist editing, membership chips, up/down ordering, deactivate and restore, search and a library filter;
- **Libraries**: create by name, rename, reorder, deactivate (choosing where the members move) and restore;
- every edit is its own request with optimistic UI, a rollback and a `role="alert"` message on failure — there is no global save and no manifest hash any more.

Deliberately out of scope: hard-deleting media, resumable/chunked uploads, per-library ordering, drag-and-drop, concurrent-edit protection (registered as B-21).

## Design decisions

- **The web is the only write path.** `POST /api/internal/music/tracks` (one file per request, the raw body as the stream), `PATCH /api/internal/music/tracks/[trackKey]`, `POST /api/internal/music/libraries` and `PATCH /api/internal/music/libraries/[key]`, all owner + same-origin and answering 404 otherwise. The manifest, the generator and the importer stay as a bulk migration tool, and `pnpm music:import` now lists the rows it would deactivate first.
- **Streaming, not buffering.** `storeMusicUpload` hashes and counts while piping the request stream into a temp file in the mirror directory, aborts past 128 MB, then reuses an equal-size `<sha256>.<ext>` or renames the temp file into place (atomic, same volume). Metadata (title/artist/duration) is read afterwards with the same `music-metadata` entry point the importer uses; a missing tag falls back to the file name.
- **Pure decisions, thin writers.** `packages/db/src/music/manage.ts` holds `planMusicTrackCreate` / `planMusicTrackUpdate` / `planMusicLibraryCreate` / `planMusicLibraryUpdate` plus four transactional executors, so the invariants are unit-tested without a database.
- **Deletion is deactivation, and the invariant is enforced on both sides.** A library with members can only be deactivated together with a destination library (moved in the same transaction, already-present memberships deduplicated against `@@unique([libraryId, trackId])`); the last active library cannot be deactivated; reactivating a track requires its memberships. The client mirrors the visible parts (last chip cannot be cleared, last library's deactivate is disabled) — the server is the authority.
- **Shared naming rules.** `music-key.ts` holds the slug, the uniqueness suffix and the title fallback that the generator and the upload path both use, so the same content entering by either road gets the same identity.
- **Removed with the manifest editor**: `library-edits.ts` (+ its 8-test suite), `saveMusicLibraryEdit`, the manifest hash in the admin data and the manager component; `manifest-file.ts` and `source-scan.ts` remain for the CLI.

## Verification

| Check | Evidence |
| --- | --- |
| Unit suites | `pnpm test` — core 73, web 118 across 14 files; `pnpm typecheck` and `tsc -p packages/db/tsconfig.json` clean; `git diff --check` clean |
| Management rules | `music-manage.test.ts` (6 cases): key/position derivation and duplicate keys, empty/duplicate/unknown/deactivated assignments, empty title, bad position, reactivation requiring memberships, duplicate library key, last-active-library refusal, destination required for a library with members, unknown or deactivated destination, `moveMembersTo` only while deactivating |
| Upload storage | `media-store-upload.test.ts` (5 cases): `<sha256>.<ext>` naming with no temp file left, reuse for identical bytes, rewrite when the existing file's size differs, unsupported extension rejected without writing, past-limit abort with the temp file removed |
| UI | `music-admin-panel.test.tsx` (7 cases): render, rename → PATCH body, chip toggle, deactivate and restore, create a library, the destination dropdown before deactivating a library with members, an error surfaced as `role="alert"`, and an upload adding the returned track |
| Round trip (copy database + temp mirror) | Library create → upload twice (second is `reuse`, one file on disk) → create tracks → rename → reassign memberships → deactivate/restore a track → deactivate a library with members refused without a destination → destination accepted and members moved → inactive destination refused → reactivation → `listActiveMusicCatalog()` still reads cleanly with the moved track in its new library |
| Browser (agent-browser, real CDP input) | Guest on `/zh/settings?section=plugin` → no management block; owner → block renders 7 tracks and 3 libraries from the real database; uploading `mock-track-01.wav` through the file input produced a new row titled from the file name and reused the existing mirror file (its mtime was from 2026-09-16 and two rows shared it); creating the library 上传验证 and toggling it onto that track; deactivating the library required the destination dropdown, moved the member to `default` and left the chips correct; `GET /api/music/tracks` returned 200 with the uploaded track in `default` |
| Cleanup | The track row, its memberships and the 上传验证 library were deleted from the real database afterwards (8→7 tracks, 3→2 libraries) and the four real tracks with their memberships are untouched; `pnpm music:import --validate` is clean; no mirror file needed deleting because the upload reused an existing one |

## Known limits

- Deactivating never frees disk; unreferenced mirror files are still found by `pnpm music:import --validate` and deleted by hand (B-21).
- Uploads are serial with no resume; a 128 MB flac that fails starts over.
- The panel is rendered twice on the settings page (desktop and mobile branches are separate component instances with separate state), so a slow upload started on one branch is not reflected in the other.
- Concurrent edits by two tabs are last-write-wins; nothing detects the collision.
- The throwaway database `incept_b19_verify` used for the round trip still exists; it is not part of the repository.
