# Music Library Management

> **Archived and superseded on 2026-09-18.** The screen described here edited `music.json` and imported afterwards; the next round replaced it with direct database writes (upload, track and library CRUD) — see `docs/finish-task/2026-09-18-music-web-management.md` and `docs/decisions/en/music-authoring-in-the-web.md`. Kept as history: it records what the manifest-editor round did and how it was verified, including the browser pass that could not exercise membership editing.

## Status

Implemented and verified on 2026-09-18. Not committed at the time of writing; the proposed commit is `feat(web): manage music libraries from the settings page`.

## Scope

Settings → Plugin gained an owner-only **Library management** block:

- rename a library, reorder the libraries, and assign or unassign tracks (including multi-membership);
- **Save and import** (write `music.json`, then run the import and report the summary) or **Save manifest only**;
- the manifest path and the pending manifest-versus-database difference count are shown above the editor.

Deliberately out of scope: creating a library from the UI (a new library is still a numbered folder) and removing a folder-backed library (deleting the folder is what removes it). Drag-and-drop reordering was left out as well.

## Design decisions

- **The screen edits the manifest; the manifest stays the source of truth.** Saving runs the same path as the CLI: read `music.json` → apply the edit to the parsed document → `buildMusicManifest` (numbered-folder validation, key derivation, hand-written preservation, dropping libraries with no folder and no reference) → write it back → optionally `planMusicImport` / `publishMusicImportMedia` / `commitMusicImport`.
- **Validation lives on the server**, mirroring the generator: a key must come from a numbered folder or a previous declaration, every track keeps at least one library, no repeats, unknown tracks rejected.
- **Folder-backed libraries are not removable here** because the next generator run would bring them back; the button is disabled with that explanation.
- **A conflict is refused, not merged.** The save carries the manifest hash the page loaded with; a mismatched hash returns 409 and asks for a reload.
- **Owner-only on both sides.** The block renders only for `viewer.role === 'owner'` (the settings page is public), and the write route re-checks the owner session plus same-origin, answering 404 to everyone else like the docs import confirmation does.
- **Shared code moved out of the CLI**: `source-scan.ts` (the audio scan), `manifest-file.ts` (read/write plus hashing) and the pure `library-edits.ts`, so the script and the route cannot drift.

## Verification

| Check | Evidence |
| --- | --- |
| Unit suites | `pnpm test` — core 73 + web 114 across 13 files; `pnpm typecheck` and `tsc -p packages/db/tsconfig.json` clean |
| Edit semantics | `library-edits.test.ts` (8 cases): rename keeps everything else, the array order becomes positions, membership add/remove including multi-membership, folder-backed removal refused, empty membership refused, unknown/repeated/undeclared keys and unknown tracks refused |
| UI | `music-library-manager.test.tsx` (7 cases): rendering, rename → save body carries the hash and `apply: true`, arrow reordering, membership toggle with the last membership kept, removal disabled per rule, 409 conflict message, missing-manifest state |
| Round trip (temp content root + copy database) | Rename + reorder + membership with `apply: true` → `libraries 2 created / 1 updated / 2 deactivated`, `memberships 4 added / 5 removed`; the reloaded view shows the new order and titles with 0 pending; a second save reports everything unchanged and 0 membership changes; a stale hash is rejected with `MusicLibraryEditError` status 409 |
| Browser (agent-browser, real CDP input) | Guest on `/zh/settings?section=plugin` → no management block; owner session (cookie injected from a file so the secret never reaches the command line) → block renders with the `default` library, four tracks, the single-membership chips and the folder-backed remove button all disabled; renaming to 收藏 and pressing Save and import reported success, `GET /api/music/tracks` returned `title: 收藏`, and the manifest carried the new title while the track titles were untouched; renaming back restored everything and `pnpm music:import --validate` is clean |
| Cleanup | The browser pass renamed the real library back to `default`; the two empty-file mirror entries created by the copy-database round trip were deleted after `--validate` confirmed nothing referenced them; the browser session was closed |

## Known limits

- The two-arrow reorder is the only ordering affordance; drag-and-drop is not implemented.
- Saving with import is one synchronous request: on a large library the mirror-reuse pass re-reads every file (B-18), and the block only shows a working state, not progress.
- When the import fails the manifest is already written; the block reports that plainly and points at `pnpm music:import`, and does not roll the manifest back.
- Membership editing in the browser was only exercised at the unit and round-trip level: the real content root holds one library, so the browser pass could not move a track between two libraries.
- The throwaway database `incept_b19_verify` used for the round trip still exists; it is not part of the repository.
