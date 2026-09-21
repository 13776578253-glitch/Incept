# Music Libraries

## Status

Implemented and verified on 2026-09-17. Not committed at the time of writing; the plan splits it into `feat(db): add music libraries to the schema, import and manifest` (gates 1–2) and `feat(web): add the music library switcher` (gates 3–4).

## Scope

`docs/decisions/en|zh/music-libraries.md` was the accepted design. This round delivered it across every layer, in four gates:

1. **Schema and import.** `music_libraries` + `music_library_items`, the migration, `prismaSchemaRevision`, a pure `planMusicImport`, `importMusicCatalog`, `listActiveMusicCatalog`, and the manifest parser's two modes plus the eight-kind `--validate`.
2. **Generator.** `apps/web/src/server/music/manifest-builder.ts` (pure), a thin `scripts/music-manifest.mjs` with `--root <dir>`, and folder-derived membership.
3. **API and client data flow.** The route serializes `listActiveMusicCatalog()`; the adapter gained `toMusicCatalog`, `filterCatalogByLibrary` and `resolveLibrarySelection`; the hook returns libraries; the runtime mount filters and self-heals.
4. **Preference, switcher and docs.** `selectedLibrary` in the preference channel, the segmented chip switcher, player copy, and the decision/runbook updates.

## Decisions taken during implementation

- **Numbered folders are required.** A first-level folder that contains audio must match `^(\d+)-(.+)$`; an unnumbered folder, a repeated number or two folders deriving the same library key are hard errors. This tightened the accepted design, so both decision docs and both runbooks were updated.
- **The prefix only sets a new library's initial position.** An existing library keeps its `position`, which is also what the runbook now tells operators to edit when reordering.
- **The switcher is a chip row** under the expanded panel header, hidden while only one library exists, with localized copy for the `default` key (默认 / Default).
- **A library with no folder and no referencing entry is removed** from the manifest and reported; the next import deactivates it.
- **Legacy and authoritative manifests are distinguished by the top-level field alone**, and the parser keeps `null` for both missing fields so the mode is decided in one place (`resolveMusicManifest`).

## Verification

| Check | Evidence |
| --- | --- |
| Unit and component suites | `pnpm test` — core 73 (node:test) + web 99 across 11 files (vitest); `pnpm typecheck` and `tsc -p packages/db/tsconfig.json` clean |
| Server-side semantics | `import-runner.test.ts` (9 cases: modes, undeclared references, repeats, empty array, missing `default`, no early conversion) and `music-import-plan.test.ts` (6 cases: legacy add-only, authority rewrite, deactivation, unchanged counts, content-hash warning) |
| Generator | `manifest-builder.test.ts` (12 cases) plus `pnpm music:manifest --root <temp>` runs: derivation, hand-written preservation, idempotent re-run |
| Migration | `migrate dev --create-only` on a copy database, reviewed, the B-17 `DROP INDEX` removed by hand, applied to the copy database first, then `pnpm db:deploy` on the real database |
| Copy-database integration | Legacy manifest → `default` created, 4 memberships added; authoritative manifest → two libraries created, `default` deactivated, memberships rewritten (2 added, 1 removed); a second run reported `0 created, 0 updated, unchanged` everywhere; `--validate` clean apart from pre-existing orphan mirrors |
| API shape | `listActiveMusicCatalog()` returns active libraries ordered by `(position, id)` and each track's keys in the same order; an active track without an active library throws instead of shipping an invalid payload |
| Browser (agent-browser, real CDP input) | Chips render `全部 / 默认 / 精选`; switching changed the heading `列表（4）→ 列表（2）→ 列表（3）` and the visible rows; a playing track present in both views kept playing across a switch (`t` 1 → 29, same `src`); a playing track absent from the new view moved the cursor to the new head and kept playing; the selection survived a reload; an unknown stored key self-healed to `null`; a single-library catalogue renders no switcher; real playback started from a real click (`paused: false`) |

Repository state during the acceptance: the running dev server belonged to the user (port 3000, PID 17388) and was reused; the browser session was closed afterwards, and the real database was restored to the repository's manifest with a final import.

## Review Round

An independent review raised two P1 findings and two P2 notes, plus test-output noise. All of them are fixed.

- **P1 — a mistyped library key was silently created.** `buildMusicManifest` synthesised `{ key, title: key }` for any key a track referenced that no folder derived and no previous declaration covered, so a typo became a library and the importer's "undeclared library" error could never fire. The merge now accepts only keys a numbered folder derives, keys the previous manifest declares, and the reserved `default`; anything else throws naming the file and the key. `manifest-builder.test.ts` gained three cases: the rejection, a declared library referenced only by a track, and a stale missing entry falling back to `default` when its folder is gone.
- **P1 — `--validate` missed inactive and drifted declared libraries.** It compared keys only, so a declared library that exists but is inactive validated clean while the API filtered it out, and title/position drift went unreported. The comparison moved into the pure `inspectMusicLibraryConsistency`, which now reports inactive declarations and title/position drift under `libraryNotImported`; `library-consistency.test.ts` covers seven cases, including the legacy branch and both membership directions.
- **P2 — `listActiveMusicCatalog` was three independent reads.** It now runs inside one interactive transaction with `isolationLevel: 'RepeatableRead'`, so a concurrent import commit cannot produce a mixed snapshot that looks like an unassigned track.
- **P2 — an unresolvable membership pair was dropped silently.** `resolvePairs` now throws inside the transaction instead of filtering, so a caller that bypasses the runner's validation cannot receive a summary reporting writes that never happened.
- **Test noise.** `HTMLMediaElement` "Not implemented" lines came from the two media-mocking suites: their `afterEach` restored the prototype stubs before the setup file's `cleanup()`. Both now unmount first and restore afterwards; three consecutive full runs are silent.

## Known limits

- **B-17 stays open.** The generated migration contained the unrelated `DROP INDEX "docs_collection_items_collectionId_idx"`; it was removed by hand again and the backlog entry now names both migrations that had to strip it.
- **The browser acceptance left one inactive row**: the temporary `精选` library used to exercise the switcher remains in the database with `isActive = false`, which is the documented deactivate-not-delete behaviour.
- **`apps/web`'s default music surface is one library** (the content root holds four files at its root), so the switcher is absent there until a numbered folder is added.
- Missing-on-disk entries keep their library alive: removing a library means clearing those entries too, and the runbook says so.
