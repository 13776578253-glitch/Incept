# The Plugin Section Becomes The Music Section

## Status

Implemented and verified on 2026-09-20. Not committed at the time of writing; the proposed commit is `refactor(web): make music its own settings section`.

## Scope

The settings page's **Plugin** section is replaced by **Music**: the player preferences and the owner-only tracks-and-libraries manager now live in one section that is no longer named after a generic container.

- Section id `plugin` → `music`, label 插件 / Plugin → 音乐 / Music, description 全站插件与偏好 → 播放器偏好与曲库 (en: "Player preferences and libraries.").
- The three preference rows and their control types are namespaced `music-*` (`music-rate-lock`, `music-placement-memory`, `music-playback-mode`), which retires the plugin-namespace TODO the schema carried.
- The second-level group heading above the three rows is 播放器 / Player.
- `features/settings/plugin/` is gone: `plugin-schema.ts` became `features/settings/music/music-schema.ts` and the admin-panel files moved into the same folder, so a section owns one folder the way `appearance/`, `language/`, `account/` and `ai/` do.
- `PluginManagerBlock` became `MusicManagerBlock` and still renders the owner panel below the section's rows.

## Follow-up (same day): the library rows lost their box

The library rows were boxes (`border` + `p-2`) wrapping a bordered input, so the row read as a separate block: its inner input sat 9px inside the row's edge and did not line up with the "new library" input above or the track search below. The rows are now divider-separated plain rows (`divide-y` on the list, `py-2` per row) whose input starts at the section's left edge like every other control, and the row's trailing action button ends on the same right edge as the new-library button. Measured after the change at 834px: editor, new-library input, both rows, the row inputs and the buttons share the edges 20 and 814.

## Follow-up (same day): the panel is a list, not a form

- **Only actions draw a box.** The per-row frames, the status pills and the title/artist inputs are gone: the library title, the track title with its `trackKey` subtext, the artist, the duration and the status render as plain text, so a border now means "you can press this". The clickable membership chips, the order arrows, the row action buttons, the create input and the search and filter controls keep theirs. The **library title** stays editable as a borderless input (it reads as text until hover or focus) because a library name is the owner's own choice; a dirty title still offers the boxed Save button.
- **Track titles and artists are read-only.** The row no longer offers inputs for them, the UI patch type dropped both fields (`MusicTrackPatch` is now `publishedAt` / `position` / `isActive` / `libraries`), and an unread artist or duration renders as the copy's `unknownValue` (`-`) instead of an empty box. A wrong title is a recognition problem, not an editing problem — registered as B-22, together with the now-caller-less `title` / `artist` support on the track PATCH route.
- **The membership control is a dropdown, and multi-membership stays.** The row's chips (one pill per active library, which wrapped onto a second line once three libraries existed) became a `MusicMultiSelect` beside the library filter: the button shows the current memberships as text and the popover ticks them one at a time, staying open while several are ticked. The last membership still cannot be cleared, and its row explains why. The panel's other dropdowns stay single-select, and the chevrons in both select components dropped to 9×6 px with a 1.25 stroke.
- **Alignment is explicit now.** The panel is capped at the same `max-w-[760px]` column the preference rows use, so it no longer runs wider than the rest of the section, and inside it **only the tracks block** carries a 16px indent (`ml-4 max-w-[744px]`) — the heading, the upload zone and the libraries stay on the panel's left edge while the track block's right edge stays flush at 780. The track table is `table-fixed` with a `colgroup` (30 / 16 / 15 / 13 / 8 / 9 / 9 %), so a cell can no longer drift from its header with its content and the membership column carries real space in front of it; the arrows carry a `-ml-3` because the header has to line up with the arrow glyphs, not with their button padding; the library rows give the member count and the status text fixed widths (`w-5` / `w-16`) so both rows' counts, statuses, arrows and buttons share columns; and the unknown-value placeholder is a plain hyphen so it starts where the digits do. Measured at 827px: the panel spans `[20, 780]` and the preference rows share that box, the panel heading, upload zone and library rows sit at 20 while the track heading, search and table run `[36, 780]`, the columns start at 0 / 223 / 342 / 454 / 551 / 610 / 677 from the table's left edge with the chip, status and action button under their own headers, both library rows share every child's box, and a row's action button ends at 780 like the create button above it.

## Decisions

- **The section is named after its content.** "Plugin" described a container with exactly one member; the player preferences and the library manager are the same subject, so they render together under Music.
- **No redirect for `?section=plugin`.** The section id is a UI detail with no inbound links anywhere in the app, so the old value falls back to the first section — which is what an unknown `?section=` already did.
- **Live docs were updated, records were annotated.** The runbooks, `BACKLOG.md` and the authoring decision now say Settings → Music; the 2026-09-18 records keep "Plugin" as the name at the time and point here.

## Verification

| Check | Evidence |
| --- | --- |
| Unit suites | `pnpm test` — core 73, web 118 across 14 files; `pnpm typecheck` clean; no `plugin` reference left in `apps/web/src` |
| Renderer | `settings-renderer.test.tsx` renders the music section: the 音乐 / 播放器 headings, both switches, the playback-mode segmented control, and the disabled state before the preferences are ready |
| Browser, guest | `/zh/settings?section=music` renders 音乐 with the 播放器 group and its three rows, no admin panel, and the sidebar shows 音乐 / 播放器偏好与曲库 |
| Browser, owner | The same URL with the owner session renders 曲库与曲目管理 below the rows with the real libraries and tracks; `/en/settings?section=music` renders Music / Player / Tracks and libraries |
| Fallback and scope | `?section=plugin` falls back to the first section (主题); the desktop branch of `?section=appearance` carries no panel, and only the music section renders it |

## Known limits

- The panel is still rendered twice, once per desktop and mobile branch, exactly as before this round.
- The id change is not backward compatible: a bookmark to `?section=plugin` lands on the first section rather than on Music.
