# Uploads Are Validated, Deduped By Content And Cleaned Up

## Status

Implemented and verified on 2026-09-21. Not committed at the time of writing; the proposed commit is `feat(web): validate, dedupe and clean up music uploads`.

## Scope

The upload path accepted anything whose name ended in `.mp3` / `.wav` / `.flac` (a text file with an audio name landed in the mirror and stayed), created a row per upload (`trackKeyForUpload` answered a `-2` suffix for content that already existed), and left a published mirror file behind when the database write failed. This round closes the five points the owner listed:

- **Filtering and parsing.** The file picker filters by extension and lists what it skips instead of dropping it silently; the server keeps the extension whitelist and now verifies the real bytes: a header sniff picks the parser, `music-metadata` must read an audio stream, and a masked file (text, image, container shell) is refused with `400` before anything is published. A wav named `.mp3` is stored as `<hash>.wav` with `audio/wav` — the real format wins, exactly like the `.ncm` path. A folder with no audio creates no library.
- **Exact content dedup.** `contentHash` carries a unique index and the upload transaction looks the hash up first: same library → `existing`, another library → `membership-added` (one row, two memberships), deactivated row → `deactivated` and untouched. `trackKey`'s `-2` suffix now only applies to genuinely new content under a taken name.
- **Typed responses.** The API answers `mediaStatus: published | reused` and `trackStatus: created | existing | membership-added | deactivated`, and the upload list renders each case, so "the file was already there" and "the track already existed" are two visible facts.
- **Existing library files.** Re-uploading a song already in the library adds nothing: the row is reused and the target library is added to its memberships through `music_library_items`.
- **Failure cleanup is deliberately not immediate.** An upload that fails after publishing keeps its mirror file: a concurrent upload of the same content may already have reused that file and not yet committed its row, so a reference check taken at failure time can read "no rows" and delete a file another request is about to point at (`database has a track, the mirror has no file`). The orphan is left for `pnpm music:import --validate`, which reports it, and for `pnpm music:cleanup`, which reclaims it when nothing is writing. The temp-file path is unaffected: a rejected validation deletes the temp file before anything is published.
- **Duplicate hints.** Similar rows (normalized title, compatible artist, duration within `max(3 s, 5 %)`, different hash) come back as `duplicates` on a created track and the upload list shows them. A hint only — nothing merges; different encodings stay separate rows.

Also: the import planner refuses a manifest that assigns one piece of content to two `trackKey`s, or reuses the content of a row that stays in the database, naming both keys instead of failing on the unique index halfway through the transaction.

## Follow-up (2026-09-21, review)

The owner's review accepted the pipeline and refused two edges; both are closed here:

- **The `.ncm` path published before it validated.** `storeMusicAudioBytes` had no validation hook, so a container that decrypts to a magic-only shell was written to the mirror and the parse failure came afterwards, leaving an orphan — against this round's "unparseable files never enter the mirror" target. It now takes the same staged `validate` callback as the streaming path: the temp file is parsed first and the file is published only after that succeeds. `apps/web/src/test/ncm-fixture.ts` holds the shared in-process container builder so the route suite can drive the real flow.
- **The per-row permanent delete still removed media in the request path.** `deleteMusicTrack` decided inside its own transaction that nothing referenced the file and the route removed it, which has the same interleaving as the failure path: an upload that reused that file and commits afterwards points at a deleted file. The owner chose the architecture-closing option: **the API never deletes content-addressed media** — the row and its memberships go, the file stays. Reclamation is a single entry point, `pnpm music:cleanup` (report by default, `--apply` to delete), meant to run while nothing is uploading; it also became the only safe way to reclaim failed-upload orphans, and `removeMusicMediaByUrl` — the one deletion primitive, with its path guard — is now used only there.

## Follow-up (2026-09-21, after the commit): skipped files become one line

The commit landed as `e48ab21`. Two things came out of the owner's review of it:

- **A folder with hundreds of unrelated files turned the panel into a log.** One row per skipped file was exact but unreadable at that scale. The skip list is now a single collapsed `<details>` line — `<first name> 等 N 个文件不符合格式要求` / `<first name> and N-1 more are not supported audio` — with the full names inside (scroll-capped when opened) and the per-file upload rows unchanged. The files are still never sent, and a folder without candidates still creates no library.
- **Merging two rows that a human has confirmed to be one song stays a manual step for now.** The hint is informational by design, and resolving one means deleting the extra row and re-adding its memberships by hand; the action that would do it properly is registered as **B-24** (keeper choice, membership union, active-if-either, source file left for the cleanup entry).

| Check | Evidence |
| --- | --- |
| Unit suites | `pnpm test` — core 73, web **183** across 21 files; the upload-zone suite asserts the summary line, the details being closed by default, and that all 30 skipped names remain in the DOM; `pnpm typecheck` (web + core + db) and `git diff --check` clean |
| Browser | Selecting 49 unrelated files (17 jpg + 16 lrc + 16 txt) plus one wav through the real file input produced exactly one summary line, `cover-01.jpg 等 49 个文件不符合格式要求`, collapsed by default, next to one normal `完成` row for `track.wav`; clicking the line expanded the full list |
| Repo state | The verification row and its file were removed again (`DELETE` + `pnpm music:cleanup --apply`), which also reclaimed one earlier orphan; the mirror and the database are back in step (12 files / 12 rows, `--validate` reporting no `orphanMirror` or `missingMirror`) |

## Decisions

- **The real format wins, and it is decided by bytes.** The extension is the first gate only. The sniff (`fLaC` / `RIFF....WAVE` / `ID3` or bare frame sync) picks the `music-metadata` parser (via `parseStream` with that format's MIME type — `parseFile` trusts the file extension, which misreads a wav named `.mp3`), the parse must succeed and report a sample rate, and the sniffed format names the mirror file and the MIME. Tag-less files are accepted and fall back to the file name.
- **One row per piece of content, enforced by the database.** `contentHash` is `String? @unique`; `NULL` stays legal so legacy rows are exempt and never matched. The transaction reads and writes through `planMusicUploadDecision` (`packages/db/src/music/upload.ts`), and a `P2002` from two concurrent uploads retries once, where the hash is found and the row reused.
- **Media reuse and row reuse are separate axes.** `mediaStatus` maps the store's file-level outcome, `trackStatus` the row-level one; the store's internal vocabulary (`publish` / `reuse`) and the import path are unchanged.
- **A deactivated hit is reported, never auto-restored.** Restoring is the user's click in the table; the upload leaves the row and its memberships alone.
- **The mirror's reuse check re-hashes the target.** Size equality alone let a same-size replacement be served forever. The publish path also re-hashes after a rename clash instead of failing: on Windows `rename` over an existing file is `EPERM`, which the concurrency acceptance run hit for real.
- **No request path deletes content-addressed media.** "Nothing references this file right now" is not the same as "no request is about to reference it", so neither a failed write nor the per-row permanent delete removes a mirror file; the row (and its memberships) go, the file stays. Reclamation is one entry point, `pnpm music:cleanup` (lists unreferenced content-addressed files, `--apply` deletes), run while nothing is uploading; `pnpm music:import --validate` still reports the same orphans in its manifest comparison. Validation itself stays staged: both stores parse the temp file **before** publishing, so a rejected upload never enters the mirror.
- **The client skips, it does not hide.** Unsupported files are listed under "Skipped" with a reason, and `ensureLibrary` runs only for folders that carry at least one candidate.
- **Duplicate hints never merge.** Normalized title (equal or one a token subsequence of the other), compatible artist, duration tolerance; the fingerprint answer stays a follow-up (B-23).
- **Migration.** Pre-checked for duplicate hashes (`0 rows`), rehearsed on a copy database with real data (`pg_dump` of `music_tracks`), then `prisma migrate deploy`; `prismaSchemaRevision` bumped to `2026-09-21-add-music-content-hash-key`.

## Verification

| Check | Evidence |
| --- | --- |
| Unit suites | `pnpm test` — core 73, web **182** across 21 files (6 new files: `audio-inspection`, `music-upload-plan`, both upload/delete route handlers, upload zone, upload filter; plus the shared `src/test/ncm-fixture.ts`; media-store, import-runner and panel cases extended); `pnpm typecheck` clean; `tsc -p packages/db/tsconfig.json` clean |
| Real format, unit level | `audio-inspection.test.ts` builds synthetic wav/flac/mp3 fixtures: masks (text, png), a container shell with no audio stream and a mislabeled wav are all classified correctly; `media-store-upload.test.ts` proves a same-size replacement is re-hashed and rewritten, a rejected validator publishes nothing **on either store**, the validator's extension names the file, and the removal primitive refuses any name with a path component |
| Route behaviour | Both handlers run with real fs in a temp mirror (only the directory and the DB module are mocked). Upload: extension and library gates, masked audio, broken `.ncm` with its `code`, created/existing/membership-added/deactivated shapes, `mediaStatus` mapping, a failed write **keeping** its file, a shell-`.ncm` publishing nothing, and a working `.ncm` stored under its decoded format with the container's title and artist. Delete: row-only response `{ trackKey }`, owner gate, failure message |
| Failure path, live | A real post-publish failure was reproduced against the running server and database: a 10-second slow request body with the target library deactivated mid-upload. The request answered `400 The library "验收-orphan" does not exist or is deactivated.`, the mirror gained exactly one new file, and that file was still present afterwards — the same interleaving that used to end in a deleted file. `pnpm music:import --validate` listed it as `orphanMirror`; the file and the test library were removed by hand |
| NCM staged validation, live | A `.ncm` built to decrypt into an ID3-only shell was POSTed to the running server: `400 The file has no readable audio stream.` and the mirror directory went from 7 files to 7 — nothing published, matching the "unparseable files never enter the mirror" target |
| Delete → cleanup loop, live | Three test tracks were deleted through `DELETE` (each answering `{"trackKey":"…"}` only); the mirror kept their three files (7 → 10) and the database returned to its baseline. `pnpm music:cleanup` then reported `10` files, `7` kept by a row, `3` unreferenced and listed exactly those three; `pnpm music:cleanup --apply` removed them and the mirror was back to 7 |
| Acceptance matrix, real server + database | Nine cases through the running dev server with the owner cookie (synthetic fixtures, one of them a real NCM container built by the fixture script): new content → `201 created / published`; same library → `200 existing / reused`; another library → `200 membership-added / reused` (one row, two memberships in psql); different encoding of the same title → `201 created` with `duplicates: ["验收曲目 Alpha"]`; `.ncm` wrapping the same mp3 bytes → `200 existing / reused`; text-as-`.mp3` → `400 not MP3, WAV or FLAC`; `.jpg` → `400 Unsupported extension`; deactivated row → `200 deactivated`, restored from the table's "Restore" button afterwards; two parallel uploads of new content → `201 created` + `200 existing`, one row |
| Concurrency bug found and fixed | The first parallel run returned `EPERM ... rename ...upload.tmp -> <hash>.wav` for one request: the publish path was `rm` + `rename` with no race handling. Fixed by re-hashing the target after a clash (treat as reuse) and retrying; the rerun passed, and a 5-round race test locks the shape |
| Browser | Settings → Music renders under the owner cookie; the mixed selection (jpg + lrc + wav) produced "已跳过 (2)" with both files listed and `alpha.wav` uploaded to the selected library, labelled "已加入该曲库" |
| Cleanup | Test tracks and libraries deleted through the API; mirror directory back to its 7 files, database back to 7 tracks / 3 libraries / 7 memberships; `pnpm music:import --validate` reports **no `orphanMirror`** (the remaining 10 issues are the pre-existing manifest drift: web-authored rows, library title drift, membership mismatches) |

## Known limits

- Orphans (a failed write, a deactivation, a per-row delete) are reclaimed only through `pnpm music:cleanup`; it cannot detect a running writer, so the "run it while nothing is uploading" rule is an operator promise, not a check. `.upload.tmp` files left by an interrupted process are outside its scope (a temp file may belong to a live upload).
- Duplicate hints are heuristics on normalized strings and duration; there is no audio fingerprint, no list-level scan and no merge (B-23).
- Rows without a `contentHash` (legacy) are never dedup targets and are never matched.
- The manifest builder can still emit two entries with identical content; the import now refuses the manifest with both keys named instead of creating a second row (B-23).
- The 128 MB cap, one-file-per-request and no-transcoding boundaries are unchanged; a rejected upload removes its temp file, but an interrupted process can still leave a `.upload.tmp` behind (reported by nothing — `--validate` only looks at published names).
- `PATCH` still accepts `title` / `artist` with no UI caller, and the upload list's duplicate hints are display-only.
