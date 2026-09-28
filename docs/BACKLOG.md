# Code Backlog

This is the reviewable backlog for explicit source-code TODOs. It intentionally does not duplicate historical task documents or broad product ideas that have no current code marker.

## Working Rules

- Do not delete a TODO merely because it is old.
- A completed or superseded TODO is rewritten in place as `history: <what replaced it>` when its source file is cleaned.
- Multiple TODOs describing one capability are consolidated into one canonical backlog item, then the duplicate source comments are converted to history notes.
- `Active` means a concrete next feature. `Deferred` means an intentional future direction. `Review` means the containing surface may be removed or merged before its TODO should be decided.
- **An agent working in a worktree writes its blocked or deliberately-skipped items here, not only in its report.** Acceptance reads git — a clean tree, the commit range, whether the merge applies — and explicitly does not read the AI's own summary. Anything left only in that summary disappears when the worktree is reclaimed. A follow-up that never reached this file was never recorded.

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

### B-28 Roadmap Module Implementation

- Source: `docs/decisions/{en,zh}/roadmap-integration-surface.md` (no code marker yet; registered per the worktree blocked/skipped-items working rule).
- Status: Phase 1 (fixture read chain) delivered on 2026-09-23. T1–T4 settled on 2026-09-23: T1 stable status enum + per-roadmap display names (implemented in `@incept/roadmap`), T2 multi-roadmap switcher under `/atlas/roadmap`, T3 Prisma sharing `@incept/db` with music-style layered encapsulation (package owns repository rules and the Prisma adapter behind the port; `@incept/db` keeps schema, migrations and client), T4 owner-gated studio UI with no vote/comment interaction for now (further feature additions wait until the surface completes; counts are not a current topic). Phase 2 (storage read chain) and Phase 3 (studio write surface) are unblocked and await phase approval.
- Phase 1 covers the `@incept/roadmap` package (domain validation, read port, fixture data in `src/testing/`, board UI) wired to `/atlas/roadmap` with `?rd=` switching and the sample-data honesty banner. It follows the boundary rules restated in `docs/decisions/{en,zh}/roadmap-integration-surface.md` standalone, because the music package template is still unmerged upstream.
- Phase 2 storage code is delivered **as code only**: the schema and the `20260923090000_add_roadmap` migration are committed but **not executed** (`db:migrate` / `db:deploy` remain controller-authorized, after the music refactor merges and the migration histories align). `PrismaRoadmapRepository` implements the read chain behind the port with an injected client; page wiring and the sample-data banner removal follow the authorized execution. `prismaSchemaRevision` was bumped with the schema change.
- Phase 2 is now **live** (2026-09-24): the controller authorized `pnpm db:migrate`, `20260923090000_add_roadmap` applied cleanly (14/14 migrations, `migrate status` up to date), `pnpm roadmap:seed` (`scripts/roadmap-seed-fixtures.ts`, idempotent) loaded the initial bilingual content, the page switched to the Prisma read chain through host assembly, and the sample markers were removed per the staged order (migrate → seed → wire → unmark). Real read chain verified end to end on both locales incl. `?rd=` switching. Note: `prisma migrate dev` prompts for a drift-capture migration afterwards (pre-existing drift, consistent with B-17); no drift migration was created and `migrate deploy` is the safer apply path next time. Phase 3 (studio write surface) coding is held: its design spec (routes, auth, forms, write-port contract) is submitted for review first.
- Deliberate non-goals of the first surface: drag-reorder, an entry detail route, vote/comment interaction (decided with the authoring mechanism at the gate), and search/sort controls.
- Phase 3 (studio write surface) delivered on 2026-09-24 per the reviewed spec: `RoadmapWriter` and `AuthorizeOwner` ports, `createPrismaRoadmapWriter` with the transaction invariants (entry + links rewrite in one transaction; column delete refuses while entries still reference its status), `roadmapEndpoints` plus six route-handler factories with non-owner 404 semantics, six `app/api` re-export stubs, and the owner-gated `/studio/roadmap` admin (boards / columns / entries zones, bilingual pairs rejected at the edge). Spec refinements during implementation: column routes are addressed as `/columns/[roadmapKey]/[status]` (matching the port identity; the spec draft said `[id]`), and `next` is declared peer+dev in the package (the template's next-layer privilege). Verified: 38 package tests (writer invariants + 404 semantics across all ten handlers), five-package typecheck, production build with every new route, live dev checks (anon studio page and API return 404 with the music error shape; public pages stay 200 and marker-free). Remaining manual check: an owner browser pass of the admin forms. This item was renumbered from `B-26` to `B-28` on 2026-09-24: the music freeze registered its own `B-26` (Account Section) and `B-27` (Scaffold) on `main`, and the main-side ids take precedence.
- Phase 4 (acceptance freeze) delivered on 2026-09-24 and the module is **frozen**. Acceptance table: B1 content-in-messages grep (scan limited to `apps/web/src/messages/**`) zero hits; B2 fixture definitions confined to `packages/roadmap/src/testing/` (consumers are tests and the authorized seed script); B3 two red→green probes passed (bilingual-parity weakening turned 5 assertions red across domain/repository/writer, the column-delete invariant weakening turned exactly its own test red, both restored to 38/38 green); B4 host residual inventory is exactly the stub/assembly/page family with zero deep imports; B5 deletion rehearsal: with the package exports hollowed the build fails at exactly the five connection files (`server/roadmap/assembly.ts`, `atlas/roadmap/{page,loading,error}.tsx`, `studio/roadmap/page.tsx`) and nowhere else, restored to green; B6 sample-marker removal already verified in Phase 2 (live pages carry zero markers). **Freeze statement:** every future extension of the roadmap enters through exactly three channels — the `@incept/roadmap` exports contract, host assembly injection, and plugin mounting (mount manifest / SettingsSectionContribution, only once a verified touchpoint demands it). The in-package layers (domain/ports pure closure, adapters IO, next routing, react UI) are the external contract from today; a new host-side touchpoint is an exception and must be named here or in a decision record. Remaining open item on this entry: the owner browser pass of the admin forms.
- T4 hardened on 2026-09-24: votes and comments are **not done at all**. The counts display, the upvote/comment icons, the chrome labels, the domain `metrics` field and the fixture samples are removed, and `pnpm roadmap:seed` pins the two dormant DB columns (`votes`, `comments`) to NULL on every run. The columns stay in the schema as dormant placeholders; dropping them awaits a separately authorized migration. A ruling-remnant audit found no other out-of-scope logic: drag-reorder, entry detail routes and search/sort controls remain absent.
- **U1–U6 backend wiring delivered on 2026-09-25** per the reviewed wiring spec (Modules A–G) and the M1–M5 review fixes. `RoadmapEntry` gained nullable `detailEn/detailZh` via migration `20260925120000_add_roadmap_entry_detail` (generated as a pure datamodel diff and applied with `prisma migrate deploy`, controller-authorized); `detail?: LocalizedText` plus `createdAt/updatedAt` ISO strings now travel through domain, ports, `toEntry()` and the writer — which merges `detail` with the null-check before `??` so an explicit `null` clears while an absent field preserves (all three states regression-tested), and whose `RoadmapEntryPatch` omits `detail` from its `Partial` base so the intersected union keeps `null` (M1). A keyless create derives a slug key with collision suffixes. The import channel (`roadmapEndpoints.import` → `POST /api/internal/roadmap/import`, one new host stub) batch-upserts human-curated JSON manifests — entries only, validated in full before a single transaction — with the non-derivation red line restated in code: nothing reads `docs/NEXT.md`, `docs/BACKLOG.md` or `docs/finish-task/` (grep confirms zero code paths; the only matches are the red-line comments themselves). Frontend wiring: Editor Save (U1 split/fallback rules), in-modal draft create on `+` (U3, POST only on Save), Board/Tags PATCH with optimistic update and rollback, Undo one column back (Module C), Delete with confirm, honest `Date`/`Activity feed` from timestamps — the second node reads "Last updated", never a status-change claim (M4) — toolbar JSON file upload (U5) and `?rd=` anchor navigation for Select project (U6). Non-owner visitors see no write controls (U2): `canEdit` comes from the new `assembly.isRoadmapOwner()`. Evidence grading (M3): component tests are the primary proof (15 react cases including `canEdit=false` hiding every write control) plus a mocked-viewer server assertion (`isRoadmapOwner() === false` for guests) and live anonymous API checks (POST/PATCH/DELETE/import all return `404 {"error":"Not found."}`); anonymous HTML scraping is weak evidence only and is not a gate. New user-visible strings are bilingual in `messages` with matching `RoadmapChrome` fields (M5). Remaining open item: an owner browser pass of the modal flows (Save/Undo/Delete/Backlog-+/import) alongside the existing studio-forms walkthrough. Note for the controller: this entry's id `B-28` collides again with the music-side `B-28 music:check-* Compatibility Aliases` (Code-Level Follow-Ups); renaming needs a ruling.
- The music migration merged to `main` (`380586a`) on 2026-09-23, and the promised template consistency check is done: the port/adapter/db split, the package skeleton and the exports shape match `music-package-boundaries`; the roadmap package gained the template's three-tsconfig layering (`tsconfig.node.json`). Registered deviations, deliberate: the Prisma adapter takes an injected structural client (the template's is a zero-arg factory), the package exports five layers (application / next / cli deferred by scope), and it does not depend on `@incept/db` yet. A read-only merge simulation (`git merge-tree`) reports four additive conflicts for the controller's merge: root `package.json` (typecheck chain), `apps/web/next.config.ts` (transpilePackages), `apps/web/package.json` (dependencies) and `pnpm-lock.yaml` (regenerate); `globals.css`, `docs/BACKLOG.md`, the schema and the migration history auto-merge cleanly. Migration histories align trivially: the music merge added no migrations, so `20260923090000_add_roadmap` orders cleanly and was later applied in Phase 2 under the controller's authorization.
- UI & toolbar pass on 2026-09-25 (`docs/current-task/2026-09-25-roadmap-ui-tuning-and-toolbar.md`): aligned `/atlas/roadmap` header typography (`Roadmap` eyebrow, concise `开发路线` / `Milestones & Backlog` title) and vertical `pb-16 md:pb-20` baseline with `/docs`; widened the board container to `max-w-[1480px]` (`minmax(288px, 1fr)` columns) with `md:items-start` natural column heights and colored status/type/priority visual anchors; preserved English column stage titles (`Backlog` / `Next up` / `In Progress` / `Done`) and internal chip labels across both `en` and `zh` locales; dropped the `示例` / `Sample` prefix from the board names (`路线图` / `Roadmap`, `图谱板` / `Atlas Board`); and added `RoadmapToolbar` on the right side of the `RoadmapSwitcher` horizontal baseline with an `Import` (`导入`) button and a `Select project` (`选择项目`) dropdown tag selector (backend and functional wiring pending the next specification round).
- Card detail modal 1:1 reproduction and Round 1–4 refinements on 2026-09-25 (`RoadmapDetailModal` in `packages/roadmap/src/react/roadmap-detail-modal.tsx`): clicking any `RoadmapCard` opens the two-column detail dialog positioned directly below the top navigation bar (`pt-[calc(var(--navbar-height,64px)+24px)]`). Round 1–4 updates: (1) moved modal up below the navbar; (2) placed the `+` entry-creation button exclusively inside the expanded modal below the right-edge `▲` / `▼` switcher when `status === 'reviewing'` (`Backlog`), removing the outer column header `+` button; (3) removed `Comments` and `Upvoters`, adding an English `Details` tab alongside `Activity feed` and a refined `Editor` (`Proposal Editor`) tab with `01 标题 · Title`, `02 小结 · Summary`, and `03 Detail · 具体内容` (`rounded-[7px]`, `resize-none`, live header/Details sync, `Preview Details` & `Save` bar); (4) made `Board` (`Feature Request` / `Improvement` / `Maintenance`) and `Tags` (`High` / `Middle` / `Low` / `No Priority`) interactive selectors with integrated chevrons and flat, non-nested dropdown menu items (`w-[164px]`) in the right sidebar; and (5) replaced `Subscribe to request` with the `Revert or delete` (`删除或者回退此提议`) action area featuring a white `Undo` button and a blue `Delete` button (with `Backlog` entries rendering only `Delete`).
- Backend wiring specification and `U1`–`U6` controller rulings settled on 2026-09-25 (`docs/current-task/2026-09-25-roadmap-ui-tuning-and-toolbar.md` Section 3):
  1. **`U1` (Option A)**: Add `detailEn` / `detailZh` (`detail?: LocalizedText`) to `RoadmapEntry`; `Editor` splits `Title` on ` / ` into `{ en, zh }` and updates `Summary` / `Detail` for the active `locale` with same-text fallback when the counterpart locale is empty.
  2. **`U2` (Guest hiding)**: Host RSC page derives `canEdit` via `(await getCurrentViewer()).role === 'owner'`; non-owner visitors (`canEdit === false`) on `/atlas/roadmap` have the `Editor` tab, `Backlog` `+` button, `Board`/`Tags` dropdown chevrons, `Revert or delete` (`Undo`/`Delete`) block, and toolbar `Import` button hidden.
  3. **`U3` (In-modal draft creation)**: Clicking `+` on a `Backlog` entry clears the modal into a draft creation state and switches to the `Editor` tab; `POST /api/internal/roadmap/entries` (`roadmapEndpoints.entries`) fires only when `Save` is clicked.
  4. **`U4` (Option A lightweight timeline)**: `RoadmapEntryRow` and the Prisma queries in `roadmap-repository.ts` already fetch `createdAt` / `updatedAt`, which `toEntry()` currently discards; retain `createdAt` / `updatedAt` in `toEntry()`, `RoadmapEntry` domain type, `validateEntry`, fixtures, and unit tests (zero Prisma query changes) to drive `Date` and `Activity feed` with `Author` fixed to `Soulter`.
  5. **`U5` (JSON file upload import)**: Toolbar `Import` uses a native file upload (`<input type="file" accept=".json" />`, no paste modal, targeting `/api/internal/roadmap/import`) to batch-import human-authored JSON manifests (`RoadmapImportManifest`); per `docs/decisions/{en,zh}/roadmap-integration-surface.md` Decision #1, it **must never derive or parse entries from `docs/NEXT.md`, `docs/BACKLOG.md`, or `docs/finish-task/`**.
  6. **`U6` (superseded 2026-09-26)**: Toolbar `Select project` previously linked with the left `RoadmapSwitcher` (`?rd=<roadmap.key>`); the revised project dimension below replaces that meaning.
- **Roadmap project dimension (2026-09-26, revision of the plan):** `RoadmapProject` is the cross-project axis, and each Roadmap is a board inside one project. The right dropdown selects `?project=<projectKey>`; the left switcher lists only that project's boards; a valid `rd` overrides `project` and establishes its owning project. Project CRUD and board reassignment are owner-gated. DB `projectId` remains nullable with `onDelete: Restrict` and `@@index([projectId])`; read adapters hide rows without a project. Phase 0 adds schema/migration; Phase 1 enables strict domain validation together with the idempotent Project One/Two seed, after migration and seed are applied in that order. No `db:deploy` was run from this worktree. Host touchpoints registered by this extension: `apps/web/src/app/api/internal/roadmap/projects/route.ts` and `apps/web/src/app/api/internal/roadmap/projects/[key]/route.ts`.
- **2026-09-27 navigation semantics correction:** each project exposes one Roadmap surface and one Atlas surface. Removed the redundant one-board `RoadmapSwitcher` from `/atlas/roadmap`; the single Roadmap/Atlas surface navigation remains. The Atlas catalog no longer includes a Roadmap card or links to `/atlas/roadmap`: it contains only project maps (currently Architecture and Keywords). The Atlas tab opens `/atlas?project=<key>`, the map catalog; Roadmap opens `/atlas/roadmap?project=<key>`. This keeps roadmap work tracking separate from derived project maps. See `docs/current-task/2026-09-27-roadmap-atlas-navigation-semantics.md`.
- Import boundary reaffirmed: import accepts only a human-maintained JSON manifest and upserts entries transactionally. It carries no project field and never reads or derives content from task records (`docs/NEXT.md`, `docs/BACKLOG.md`, or `docs/finish-task/`).
- Secondary style tuning Rounds 1–3 on 2026-09-25..26 (`docs/current-task/2026-09-25-roadmap-ui-tuning-and-toolbar.md`): (1) verified that dark-mode hexes `#0c0c0f` (`12,12,15`) and `#131317` (`19,19,23`) carried a `240°` blue-violet shift (`R=G < B`) and replaced all `.dark` roadmap surfaces in `apps/web/src/styles/theme.css` with pure neutral `R=G=B` grays (`--roadmap-lane-bg: #0b0b0b`, `--roadmap-card-bg: #141414`, `--roadmap-card-hover-bg: #191919`, `--roadmap-modal-bg: #121212`, `--roadmap-popover-bg: #181818`, `--roadmap-chip-bg: #1e1e1e`); (2) set `--roadmap-lane-border`, `--roadmap-border`, `--roadmap-chip-border`, and `.dark` type/priority chip borders to `transparent` (using `--roadmap-divider: #1f1f1f` only for structural modal hairlines) to eliminate both white edge halos on buttons/cards (`导入`, `图谱板`) and triple-nested lane/card/chip borders; (3) replaced the bluish `bg-slate-950/35` modal backdrop with neutral `bg-black/45 dark:bg-black/72`, fixed the top-right/bottom-right modal corner bleed by adding `rounded-b-[15px] md:rounded-r-[15px]` on `<aside>`, updated hardcoded `Author` to `cpp` with avatar initial `C`, formatted `Date` as `YYYY-MM-DD (relative)`, and mounted `RoadmapDetailModal` via `createPortal(..., document.body)` with `transform-gpu` and `outline-none` on `RoadmapCard` to eliminate the single-frame flash when closing the modal; (4) configured `RoadmapBoard` with `md:grid-rows-[minmax(0,1fr)] md:items-start` and `RoadmapLane` with `md:max-h-full md:self-start` (`md:min-h-[560px]` on the page container) so columns with 0 or 1+ items shrink-wrap dynamically around their content without clipping or stretching to the bottom, while columns with many items cap at the single-screen viewport bottom and scroll vertically inside `<ul>` with hidden scrollbars; and (5) delivered Scheme 3-A dynamic timeline synthesis and Scheme 4-B bilingual token similarity matching (`findSimilarEntry` with `MIN_SIMILARITY_SCORE = 10`), automatically hiding `View all similar requests` when unrelated, with Scheme 3-B recorded as B-30 below.

### B-30 Roadmap Entry Audit Trail & Activity Event Stream (Scheme 3-B)

- Source: `packages/roadmap/src/react/roadmap-detail-modal.tsx` (`Activity feed`), `docs/current-task/2026-09-25-roadmap-ui-tuning-and-toolbar.md`
- Status: Deferred schema & event stream proposal.
- In Round 3 tuning, the modal timeline adopted **Scheme 3-A** (lightweight dynamic synthesis from existing `createdAt`, `updatedAt`, `status`, and `priority` fields with zero new DB tables).
- **Scheme 3-B** proposes upgrading this to a complete audit trail:
  1. **Database schema**: add Prisma model `RoadmapEntryActivity` (`id`, `roadmapEntryId`, `actor`, `action`, `fromValue`, `toValue`, `createdAt`) with index `[roadmapEntryId, createdAt]`.
  2. **Transactional recording**: inside `PrismaRoadmapWriter` (`createEntry`, `updateEntry`, `deleteEntry`), atomically write an activity event record within the same transaction.
  3. **Read port & adapter**: add `listEntryActivities(entryKey: string)` to `RoadmapRepository` and expose via an internal read endpoint `/api/internal/roadmap/entries/[key]/activity`.
  4. **Frontend integration**: `RoadmapDetailModal`'s `Activity feed` tab fetches the real event log to render a chronological history of changes (authoring, stage transitions, priority adjustments, title/summary edits).
- Deliberately deferred until the roadmap write surface requires collaborative multi-user change auditing.



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

### B-25 Import-Boundary Lint Infrastructure

- Source: `packages/music/tsconfig.src.json`; `docs/decisions/{en,zh}/music-package-boundaries.md` (decision 1, amended 2026-09-23).
- Status: Active infrastructure work, scheduled by the Phase 3 review ruling (decision 3 always reserved lint enforcement for a separate task).
- The mechanical pure-layer check covers domain + ports only: application compiles in the node-flavoured config because it calls the adapters graph, so its "no direct Node imports" rule currently rests on review alone.
- Add an import-boundary lint across `packages/music` layers: domain/ports must not import Node built-ins, adapters, or each other's internals; application must not import Node built-ins directly; adapters/next/cli may use Node; react may use React. Cover `apps/web` imports of the package the same way (host only via ports/assembly/stubs).

### B-26 Account Section On The Same Contribution Primitive

- Source: `apps/web/src/features/settings/account/`（`account-settings-panel.tsx` / `account-schema.ts`）
- Status: Open. Registered at the Phase 8 freeze (2026-09-23), where music completed the SettingsSectionContribution adoption.
- The account section is the remaining built-in settings section that predates the mount registration surface: `settings-page-content.tsx` still branches on `section.id === 'account'` and renders `AccountSettingsPanel` directly, and `account` stays a reserved section id because of it.
- Move it onto the same primitive music now uses (a SettingsSectionContribution with an owner-gated server loader), then drop the special branch and the reserved id — the exact surgery Phase 7 did for music.

### B-27 New-Module Scaffold

- Source: `packages/music/`（the layered package layout）、`apps/web/src/mount/`
- Status: Open. Registered at the Phase 8 freeze; A6 of the migration acceptance explicitly deferred it ("scaffold 另立任务").
- Codify the migration's shape as a copyable scaffold: the layered exports + boundary tsconfigs + ports/assembly/registration seams + mount contribution wiring, so a new feature module starts from the structure instead of re-deriving it from `packages/music`.

### B-28 `music:check-*` Compatibility Aliases

- Source: root `package.json` (`music:check-core`, `music:check-adapter`)
- Status: Open. Registered at the Phase 8 freeze; B-18 recorded them as accepted compatibility aliases when the suites moved under Vitest.
- The tests they run now live in `@incept/music` / `@incept/music-player-core`. Decide whether the aliases still earn their keep; if not, delete them and point any external doc at `pnpm test` / `pnpm --filter <pkg> test`.

### B-29 Comma-Bearing Tailwind Arbitrary Values Generate No Rules

- Source: ~30 class strings across `apps/web/src` using `border-[color:color-mix(...)]` / `bg-[color-mix(...)]` / `shadow-[...color-mix(...)]` (docs/admin tables, import-preview panels, about/activity, home/blog, docs blocks, …).
- Status: Closed on 2026-09-25 on branch `feature/style`. Kept for history.
- Defined the previously missing `--color-surface` and `--color-accent` variables across `:root`, `.dark`, and `html[data-eye-comfort-filter='warm']:not(.dark)` in `theme.css`, and routed all remaining `color-mix(...)` and `rgba(...)` arbitrary value utilities across `about`, `home`, `docs/home`, `docs/admin`, `docs/import-preview`, `docs/article`, and `docs/shared/renderers/blocks` through semantic CSS variables in `tokens.css` and `theme.css`.

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
