# Code Backlog

This is the reviewable backlog for explicit source-code TODOs. It intentionally does not duplicate historical task documents or broad product ideas that have no current code marker.

## Working Rules

- Do not delete a TODO merely because it is old.
- A completed or superseded TODO is rewritten in place as `history: <what replaced it>` when its source file is cleaned.
- Multiple TODOs describing one capability are consolidated into one canonical backlog item, then the duplicate source comments are converted to history notes.
- `Active` means a concrete next feature. `Deferred` means an intentional future direction. `Review` means the containing surface may be removed or merged before its TODO should be decided.

## Active

### B-01 Home Uses Mock Content

- Source: `apps/web/src/features/home/index.tsx:19`
- Status: Active product work.
- Replace the mock hero, `/test` links, mock cards, and mock image assets with real published content or a deliberately minimal landing page.
- This is a separate Home milestone; do not partially wire one mock card to production data.

### B-03 Markdown-like Heading And Section Model

- Source: `apps/web/src/features/docs/importer/parsers/markdown-like/document/blocks/index.ts`
- Status: Implemented; the line-12 heading note is already `history:`, but `blocks/index.ts:13` still carries a live TODO about mapping heading blocks into the nested `On this page` outline, so it is not a completed-work cleanup candidate.
- `#` starts a section, while `##` through `####` become body heading blocks and nested `On this page` outline items.
- Section IDs, block IDs, article-writing syntax, and the existing section-level outline behavior remain unchanged.

### B-04 Markdown-like Checklist Expansion

- Source: `apps/web/src/features/docs/importer/parsers/markdown-like/document/state.ts:63-64`
- Status: Active parser-design work.
- Decide multiline checklist item syntax and whether nested checklist items are supported. Do not change IDs independently of the parser grammar.

### B-05 Structured Content Extensions

- Source: `apps/web/src/features/docs/block-system/schema/docs-block-types.ts` (`DocsBlockType` union), `apps/web/src/features/docs/block-system/examples/docs-block-style-lab-page.ts:12-13`
- Note: the former `docs-block-types.ts:1` marker is already an in-place `history:` note; `table` remains unimplemented across the block union, the renderers, and the importer.
- Status: Active only after the authoring contract is designed.
- Image support is complete. The remaining concrete candidate is `table`; embeds, video, timeline, and interactive blocks remain separate proposals rather than implicit additions.

### B-06 Multi-Article Markdown-like Source

- Sources: `apps/web/src/features/docs/importer/parsers/markdown-like/document/state.ts:6`, `apps/web/src/features/docs/importer/parsers/markdown-like/document/ids.ts:3`
- Status: Implemented foundation; real-content acceptance and follow-up hardening remain.
- One `.docs.md` file remains one independent article. Directory import maps numbered folders to empty navigation folders and numbered files to article nodes.
- Maximum folder depth is three; numeric prefixes supply sibling order. Batch Preview/Confirm, the `created` / `updated` / `unchanged` diff, inactive-node cleanup, and strict database transaction handling are implemented. The `renamed` / `removed` statuses are not: both branches of the replace check in `packages/db/src/docs/import.ts` resolve to `updated` (B-13).
- Remaining acceptance: run a real `--replace` batch against an existing collection, verify rollback behavior, and finish cross-locale folder label handling.

## Deferred

### B-07 Additional Code Palettes

- Source: `apps/web/src/features/docs/code-highlighting/palette.ts:5`
- Status: Deferred.
- Current `vscode`, `github`, and `vitesse` palettes plus the eye-comfort override are sufficient. Add palettes only with a named UX need and matching light/dark Shiki themes.

### B-17 Unmanaged Collection Item Index

- Source: `packages/db/prisma/schema.prisma` (`DocsCollectionItem`)
- Status: Deferred database cleanup.
- `docs_collection_items_collectionId_idx` currently exists in the database but is not declared in the Prisma schema. `20260916010002_add_music_track` and `20260917133912_add_music_libraries` both generated a `DROP INDEX` for it and both had it removed by hand, so the decision stays open rather than landing inside an unrelated migration.
- Decide separately later: create a standalone migration to drop it if it is not needed, or add it back to the schema if it is.

### B-26 Roadmap Module Implementation

- Source: `docs/decisions/{en,zh}/roadmap-integration-surface.md` (no code marker yet; registered per the worktree blocked/skipped-items working rule).
- Status: Phase 1 (fixture read chain) delivered on 2026-09-23. Phase 2 (storage read chain), Phase 3 (write surface) and Phase 4 (acceptance freeze) are deferred pending the second discussion. T1 (stable status enum + per-roadmap display names) and T2 (multi-roadmap switcher under `/atlas/roadmap`) were settled on 2026-09-23 and are implemented in `@incept/roadmap`; storage and authoring (T3/T4) stay open.
- Phase 1 covers the `@incept/roadmap` package (domain validation, read port, fixture data in `src/testing/`, board UI) wired to `/atlas/roadmap` with `?rd=` switching and the sample-data honesty banner. It follows the boundary rules restated in `docs/decisions/{en,zh}/roadmap-integration-surface.md` standalone, because the music package template is still unmerged upstream.
- Deliberate non-goals of the first surface: drag-reorder, an entry detail route, vote/comment interaction (decided with the authoring mechanism at the gate), and search/sort controls.
- The provenance of `metrics {votes, comments}` is a gate question: hand-entered counts rot (the "read, don't retype" trap in a new form), and an import would be a data channel the gate has to define. Until then counts render as plain text only.

## Code-Level Follow-Ups

Registered while verifying `NEXT.md` against the working tree. These are source TODOs, not product features.

### B-11 Collection Folder Depth Limit Only Warns

- Source: `apps/web/src/features/docs/importer/collection-directory.ts:181-188`
- A folder deeper than three levels reports an issue, but the scan still recurses and builds deeper nodes.

### B-12 Directory Import Requires An Overridden Position

- Source: `apps/web/src/features/docs/importer/validation.ts:273-280`
- Directory sources must provide an integer `meta.position` that the numeric directory prefix then overrides.

### B-13 Redundant Collection Preview Status

- Source: `packages/db/src/docs/import.ts:1089-1090`
- Both branches of the replace check resolve to `updated`.

### B-14 Cross-Locale Collection Replace Shares Node Keys

- Source: `packages/db/src/docs/import.ts:1224-1226`
- `nodeKey` is shared across locales, so a single-locale `--replace` that shrinks the tree also deactivates nodes the other locale still needs. This is unverified against real content.

### B-15 Article Tag Contract Placeholder

- Sources: `apps/web/src/features/docs/shared/types.ts`, `packages/db/src/docs/types.ts`
- An optional `tags?: string[]` contract placeholder exists with no data model, query, or renderer consuming it. The expandable Docs home row still falls back to `eyebrow`.

### B-16 Music Player Controls Not Wired To The UI

- Source: `apps/web/src/features/music-player/components/music-player-floating.tsx`
- `nextRequested`, `previousRequested` and `seekRequested` are implemented and tested in `@incept/music-player-core`, but the player UI intentionally exposes only play, pause, track selection and the speed control.
- `playbackRateRequested` is wired to the speed control, which cycles `PLAYBACK_RATE_OPTIONS` from `adapter/player-copy.ts`. The speed ships locked at 1x by default, so the button is inert until the lock is turned off under Settings → Music.
- `repeatModeRequested` is dispatched from the persisted default-playback-mode preference (`MusicPlayerPreferencesProvider`) and applied in the floating component, so repeat is reachable from Settings → Music and has no player control.
- Wire the remaining three in a later phase. Until then the player must not be described as having previous/next or seek controls, and repeat must be described as a settings preference rather than a player control.
- **Default speed is still not a preference.** What exists is a lock at 1x, not a stored default value, so a listener cannot choose a different starting speed.

### B-18 Music Pipeline Follow-Ups

- Sources: `scripts/music-import.mjs`, `apps/web/src/features/music-player/adapter/music-source.ts`, `apps/web/src/server/music/media-store.ts`
- Status: Open. Registered when the import pipeline was closed as a staged milestone: the chain runs end to end, the player is not feature-complete.
- Mirror reuse reads the whole file to verify SHA-256, so import time scales with the size of the library.
- Duration is read at import time (`music-metadata`) and stored on the row. A track imported before that was added carries a null `durationSeconds` and shows no length in the player until `pnpm music:import` runs again, since the importer now treats a changed duration as a change worth writing.
- `apps/web/public/mock/audio/` and `scripts/music-mock-audio.mjs` are development fixtures only. They are no longer the player's data source; the database is.
- **Automated coverage now reaches the DOM-level paths.** `apps/web` has a React test environment (Vitest 5 + jsdom + Testing Library), and the repository gained one aggregate entry: `pnpm test` runs every workspace that owns a `test` script, `pnpm test:web` / `pnpm test:core` narrow it, `pnpm test:watch:web` watches. `music:check-core` and `music:check-adapter` remain as compatibility aliases, and the adapter test that used to borrow `packages/db`'s `tsx` now runs under Vitest inside `apps/web`.
- Five suites landed: catalogue adapter (payload shape, duplicate identity, URL, dates), catalogue hook (request, retry, failure, stale entries retained, unmount abort), player provider (core↔audio wiring, effect ordering, source swaps, play races), preference channel (storage read, write gate, corrupt values) and the settings renderer (controls, gating, grouping).
- **Still not covered:** the geometry hooks (`use-floating-position`, `use-player-viewport`) and `music-player-floating.tsx` — the only module that needs `next/navigation` + `next-intl` mocks. Real playback, autoplay policy, pointer capture and geometry measurement stay browser-only, so the browser acceptance round still stands; in jsdom a geometry test can only assert which placement was written, because `getBoundingClientRect` is always zero.
- **Two runners are accepted, not unified:** core and db use `node:test`, web uses Vitest. Infrastructure lives in `apps/web/vitest.config.mts` and `apps/web/src/test/` — `setup.ts` for the true global gaps, `media-element.ts` for per-test audio stubs, `music-fixtures.ts` for the catalogue payload shape the libraries work extended.
- Environment note: this machine exports `NODE_ENV=production`, which makes React resolve its production build (it does not export `act`) and breaks Testing Library at import time. The Vitest config pins `NODE_ENV=test` for the test run.
- Closed since registration: the `--allow-empty` escape hatch is wired; `toMusicCatalog` rejects duplicate `trackKey`, non-positive durations, unparsable dates, an `audioUrl` that is neither site-relative nor https, and undeclared or repeated library keys; both P1 fixes passed manual review.

### B-20 Music Library Management Follow-Ups

- Source: `apps/web/src/features/settings/music/` (earlier `settings/plugin/music/music-library-manager.tsx`; `settings/plugin/` no longer exists)
- Status: Closed on 2026-09-18 and superseded further by `ccd0d62` (authoring from the settings page), `0d2f532` (own settings section, row deletion, `.ncm` uploads) and `e48ab21` (validation, content dedup, cleanup). Kept as history, not an open item.
- The settings page now writes the database directly and covers creating, renaming, reordering, deactivating, restoring and deleting libraries, so "creation and folder-backed removal are not offered" no longer holds. See `docs/decisions/en/music-authoring-in-the-web.md`.
- Kept for history: creating a library used to require the generator to own the key, and a folder-backed library could not be removed because the next generator run brought it back.

### B-21 Web Authoring Follow-Ups

- Source: `apps/web/src/server/music/`, `apps/web/src/features/settings/music/`
- Status: Open. Registered when authoring moved to the web; each item is a deliberate boundary, not an oversight.
- **Deactivating keeps every byte; nothing in a request deletes media.** A track's right-click menu removes the row and its memberships (2026-09-21) and keeps the file; a failed upload keeps its published file too. Reclamation is one entry point, `pnpm music:cleanup` (`--apply`), added 2026-09-21 and meant to run while nothing is uploading; `pnpm music:import --validate` still reports the same unreferenced files inside its manifest comparison.
- **What remains of that gap:** the cleanup entry's "no writers running" precondition is an operator promise rather than a check, and `.upload.tmp` files left by an interrupted process are never reclaimed automatically (they are outside the cleanup scope, because a temp file may belong to a live upload).
- **The upload path is validated and deduped by content.** Since 2026-09-21 the bytes decide the format (sniff + parse, stored under the real format), identical bytes reuse one row (`existing` / `membership-added` / `deactivated`), and `contentHash` is unique in the database. Similar-but-different content is hinted at, never merged (B-23). A legacy row with a `NULL` hash is never matched.
- **Uploads have no resume, no chunking and no transcoding**, and the 128 MB cap is hard — a failed large flac/wav upload starts over.
- **Every edit is its own request with no concurrency guard**: owner-only, one transaction per request, later write wins. A second editor or a stale tab can silently overwrite an earlier edit.
- **Order is the track's own `position`**: a track in two libraries shares one order, and the arrow buttons are the only affordance (no drag-and-drop, no bulk edit).
- **The admin read returns every row** (`listAllMusicTracks` plus all memberships) on each settings-page load, and the payload is serialised to the client. Fine for tens of tracks; it needs paging or a server-side filter past a few hundred.

### B-22 Music Metadata Recognition

- Source: `apps/web/src/server/music/audio-inspection.ts` (`inspectUploadedAudio`), `scripts/music-import.mjs`
- Status: Open. Registered on 2026-09-20, when the panel stopped offering hand editing of track titles and artists: a missing value renders as the copy's `unknownValue` (`-`), and the answer to a wrong or missing one is better recognition rather than a text field.
- Today the read is `music-metadata`'s `common.title` / `common.artist`, with the file name as the title fallback. The real files here carry no artist tag and a title that already reads `artist, artist   title` (`GUMI,一之瀬ユウ   心做し`), so the panel shows an artist dash and a title with the performers glued on.
- Candidates: split a title that carries that shape, fall back to `albumartist` and the other tag frames before giving up, and report per-run recognition counts so a batch can be judged. A split rewrites what the player displays, so it must be reviewable and opt-in.
- **New NetEase imports already read correctly.** An `.ncm` upload takes `musicName` and `artist` from the container (see [music-authoring-in-the-web.md](./decisions/en/music-authoring-in-the-web.md)), so the songs imported before that support still carry the glued tag title and a blank artist. Re-uploading the original `.ncm` produces a correct row, and the stale one can be removed with the row's right-click delete — which is the practical fix today; the heuristics above stay the answer for non-NetEase sources.
- The web is no longer the place to fix a wrong value by hand; the API still accepts `title` / `artist` on `PATCH /api/internal/music/tracks/[trackKey]` with no caller — decide whether to trim it when this lands.

### B-23 Same-Song Detection Beyond Exact Bytes

- Source: `packages/db/src/music/upload.ts` (`findMusicDuplicateCandidates`), `apps/web/src/server/music/manifest-builder.ts`, `scripts/music-import.mjs`
- Status: Open. Registered on 2026-09-21, when uploads started deduping by `contentHash`: identical bytes became one row, and everything else is only hinted at.
- **The hint is deliberately shallow.** A created track reports existing rows whose normalized title matches (or is a token subsequence of the other side), whose artist does not conflict, and whose duration is within `max(3 s, 5 %)`. It is display-only: nothing merges, no "same song" relation is stored, and the list is not scanned when it merely renders.
- **An audio fingerprint is the real answer.** A Chromaprint (or similar) value would recognise different encodings of one song without string guessing; it needs a decode step, a stored fingerprint, and a review surface, so it stays a follow-up.
- **The manifest builder can still emit duplicate content.** Two manifest entries pointing at byte-identical files (the same song copied into two library folders, for example) now make `pnpm music:import` refuse the manifest with both `trackKey`s named. Folding them into one key plus memberships in the generator is the other half.
- **Nothing scans the existing library.** The hints run on upload only; a one-off "find near-duplicates in the table" view would need the same rules surfaced in the admin read.

### B-24 Merge Two Rows Confirmed To Be One Song

- Source: `packages/db/src/music/upload.ts` (`findMusicDuplicateCandidates`), `apps/web/src/features/settings/music/music-upload-zone.tsx`
- Status: Open. Registered on 2026-09-21, right after the owner confirmed a hinted duplicate by hand. The hint is informational by design — two encodings are legitimately two rows — but once a human has confirmed "this is the same song", the only way to resolve it today is to delete the extra row and re-add its memberships by hand, which loses the memberships and can as easily delete the better-sounding version. The owner chose to keep that manual path for now.
- **Proposed shape:** a `POST /api/internal/music/tracks/[trackKey]/merge` action taking `{ into }`, guarded by a pure `planMusicTrackMerge`: refusing a row merged into itself, requiring both rows to exist, requiring the membership union to stay non-empty, and requiring the confirmation click. The keeper keeps its own file, title/artist/duration, position and publishedAt; the source's libraries join the keeper's through `music_library_items` (de-duplicated); the merged row stays active when either row was active, which the union guarantees to satisfy; the source row is deleted and its file is left for `pnpm music:cleanup`, like every other deletion.
- **Entry points:** the row's right-click menu grows a "merge into…" step listing the rows that look like the same song (the same normalized title / artist / duration rule, with the full list as a fallback when nothing is flagged), and the upload list's "possible duplicate of …" hint gets a shortcut into the same action.
- **One home for the rule:** the panel would compute that candidate list offline, so `findMusicDuplicateCandidates` has to move into a module with no Prisma import and be exported through its own subpath of the db package (the `./music` barrel pulls in the client, which the browser bundle cannot take).
- B-23 remains the detection half; this item only handles what to do after the human says yes.

## Review Before Any Code Decision

### B-09 Retained Style Lab And Block Catalog

- Sources: `apps/web/src/features/docs/block-system/catalog/`, `apps/web/src/features/docs/block-system/examples/`, `apps/web/src/app/[locale]/docs/style-lab`
- Status: Retained Owner-only test surface.
- Keep the source and route out of public navigation. Do not delete this original test layer during cleanup.
- Only convert its completed real-media and syntax-highlighting TODOs to in-place `history:` notes; any future expansion needs a concrete regression-testing purpose.

## History Candidates

These comments describe work already completed. Do not edit them until the corresponding cleanup task is approved; then replace the original TODO text in place with the stated `history:` note.

### Verified Already Converted

Verified against the working tree: these sources already carry the planned in-place `history:` note, so no further edit is pending.

| Source | In-place note now present |
| --- | --- |
| `apps/web/src/features/docs/block-system/examples/docs-code-example-utils.ts:1-3` | `history:` Shiki highlighting note plus a `Deferred:` builder note. |
| `apps/web/src/features/docs/block-system/schema/docs-block-types.ts:1` | `history: image blocks and local media publishing are implemented; table remains B-05.` |
| `apps/web/src/features/docs/block-system/catalog/docs-block-catalog.ts:36-37` | `history:` real-media pipeline note plus the retained Style Lab fixture note. |
| `apps/web/src/server/docs/mappers.ts:23-24` | `history:` annual-description removal and mapper-consolidation notes. |
| `packages/db/src/docs/types.ts:10-11` | `history:` block-union note. The earlier `:6` reference pointed at an import statement, not a comment. |
| `apps/web/src/features/docs/importer/parsers/markdown-like/document/state.ts:5` | `history: # creates a section and ## through #### already parse as body heading blocks.` |

Verified against the working tree on 2026-09-23: **there are currently no pending history conversions.** Every source listed in the tables above already carries its intended in-place note.

### Remaining

None. The row previously listed here claimed that the duplicate multi-article-source TODO in the markdown-like importer was still live. That is no longer accurate and has been removed from this table:

| Former row | Verified state on 2026-09-23 |
| --- | --- |
| The TODO in the markdown-like parser's section-state and id-generation files was still open | **Superseded.** They are the live source markers of B-06, not pending history conversions, and B-06's real-content acceptance is tracked in the Active section above. They are deliberately left as TODOs until that acceptance closes; they are not a cleanup candidate. |

Two further claims that used to live in this file are also resolved, and are recorded here so the correction is not lost:

- The stale project-root paths `document/blocks/index.ts`, `document/state.ts` and `document/ids.ts` have been repointed at their real locations under `apps/web/src/features/docs/importer/parsers/markdown-like/document/`.
- The note that `prismaSchemaRevision` in `packages/db/src/client.ts` had not been raised for the 2026-09-01 / 2026-09-02 schema changes is no longer true: it currently reads `2026-09-21-add-music-content-hash-key`, matching the latest migration. Be aware that this string is a hand-maintained sentinel — every new migration must update it, and nothing enforces that.

### Cleaned On 2026-09-21 During The Comment Pass

The music comments added by `0d2f532` / `e48ab21` / `8d34309` were reviewed and reduced to one-line flow notes: rationale was moved into `docs/current-task/2026-09-21-music-upload-dedup.md` and `docs/decisions/{en,zh}/music-authoring-in-the-web.md`, and the `history:`-prefixed design notes in that subsystem were removed because they recorded change history rather than replacing a TODO.

| Source | What it carried | Outcome |
| --- | --- | --- |
| `apps/web/src/server/music/{media-store,audio-inspection,ncm-decode,import-runner,manifest-builder,manifest-file,music-admin,source-scan}.ts` | Multi-line "why" prose and `history:` notes | One-line flow notes; rationale now in the task document and the decision record |
| `packages/db/src/music/{keys,upload,plan,manage,import}.ts`, `queries/list.ts`, `types.ts`, `packages/db/src/client.ts` | Same, plus a dangling `BACKLOG B-10` reference | Trimmed; the `prismaSchemaRevision` changelog is gone (the migration directory is the record) |
| `apps/web/src/features/settings/music/*`, `apps/web/src/features/music-player/**`, `packages/music-player-core/src/*` | Same, including two "the earlier decision was reversed" notes | Trimmed; no change-history notes remain |
| `packages/db/prisma/schema.prisma` | Field contract notes | Kept (data contract), one redundant clause removed |
| `apps/web/src/server/docs/access.ts:81`, `apps/web/src/features/docs/importer/parsers/markdown-like/document/inline.ts:82` | `history:` prefix with no TODO behind it | Prefix removed |

Not touched: the `history:` notes the backlog's two tables above declare as intended conversions (block system, `document/state.ts:5`, `packages/db/src/docs/types.ts:10`).

## Execution Order

1. Review this backlog and confirm the proposed classifications.
2. Process one backlog item or one review surface at a time.
3. For approved history candidates, update the TODO at its original source location; do not create a second history list elsewhere.
4. Only after source TODO cleanup is stable, move on to dead-code removal, directory simplification, and current-task archival.
