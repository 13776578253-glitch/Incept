# Frontend Style Optimization Plan (Phase 1 – Phase 5)

- **Date**: 2026-09-25
- **Worktree**: `D:\Desktop\code\code\Incept-style`
- **Branch**: `feature/style`
- **Reference Commit**: `0e556e01fb0cf0e216f41b9201c837605d040c65` (`feat/roadmap` UI tuning & visual anchors)
- **Status**: Ready for Review (No application code modified yet)

---

## 1. Visual Language Extracted from `0e556e01fb0cf0e216f41b9201c837605d040c65`

From inspecting `0e556e01fb0cf0e216f41b9201c837605d040c65` (`apps/web/src/styles/theme.css`, `roadmap-chip.tsx`, `roadmap-card.tsx`, `roadmap-lane.tsx`, `roadmap-switcher.tsx`, `roadmap-toolbar.tsx`), five core visual patterns and anchor mechanisms were identified for cross-surface reuse:

1. **Semantic Tinted Pills & Visual Anchors (Icons + Status Dots)**
   - **Icon + Tinted Pill**: `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.74rem] font-medium leading-5 whitespace-nowrap` with semantic icon colors (`Amber #f59e0b`, `Sky #0ea5e9`, `Indigo #6366f1`, `Emerald #10b981`, `Rose #ef4444`) and soft translucent backgrounds/borders across Light, Dark, and Warm Eye-Comfort modes.
   - **Status Dot + Pill**: `size-1.5 shrink-0 rounded-full` solid status dot + semantic foreground/background/border tokens (never relying on color alone; always paired with text or icon).
2. **Dual-Layer Surface Hierarchy ("Recessed Soft Container + Crisp Elevated Card")**
   - **Outer Group / Lane Container**: `rounded-xl border border-[var(--color-border)] bg-[var(--surface-recessed-bg)] p-3` (reusing `--roadmap-lane-bg` value: `rgba(15, 23, 42, 0.025)` in light, `rgba(245, 245, 245, 0.035)` in dark, `rgba(122, 102, 85, 0.045)` in warm).
   - **Inner Interactive Card**: `rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all duration-[var(--duration-fast)] hover:-translate-y-0.5 hover:border-[var(--color-text-soft)] hover:shadow-[0_4px_12px_rgba(15,23,42,0.05)]`.
3. **Recessed Track Capsule Switchers & Action Pills**
   - **Segmented Switcher (`RoadmapSwitcher` pattern)**: Recessed pill track (`rounded-full border border-[var(--color-border)] bg-[var(--surface-recessed-bg)] p-1`) + active elevated pill (`border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]`) with a leading 14px vector icon.
   - **Toolbar Action Pill (`RoadmapToolbar` pattern)**: `rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-1.5 text-[0.8125rem] font-medium shadow-[0_1px_2px_rgba(15,23,42,0.05)]` with a leading muted icon and animated chevron (`rotate-180`).
4. **Section Header Anchors (Leading Colored Icon + Semibold Title + Tabular Count)**
   - Group headers pair a leading semantic vector icon (`size-4`), a compact semibold title (`text-[0.92rem] font-semibold tracking-[-0.01em]`), and a right-aligned `tabular-nums` count badge.
5. **Timeline & Structural Connectors**
   - Activity/history feeds and hierarchical rails use vertical `1px` connector lines paired with circular status/node indicators.

---

## 2. Five-Phase Execution Plan (Phase 1 – Phase 5)

### Phase 1: Navbar Style & Global Semantic Visual Anchor Tokens
**Verified Target Files**:
- `apps/web/src/styles/theme.css`
- `apps/web/src/components/layouts/site-header.tsx`
- `apps/web/src/components/layouts/site-header-mo.tsx`

**Optimization Scope**:
1. **Shared Semantic Visual Tokens (`apps/web/src/styles/theme.css`)**:
   - Port and unify the `0e556e01` surface & semantic badge variables across `:root`, `.dark`, and `html[data-eye-comfort-filter='warm']:not(.dark)`:
     - Recessed & chip surfaces: `--surface-recessed-bg` (aliased with `--roadmap-lane-bg`), `--surface-chip-bg` (`--roadmap-chip-bg`), `--surface-chip-border` (`--roadmap-chip-border`), `--shadow-card-sm`, `--shadow-card-hover`, `--shadow-pill-active`.
     - Semantic palette tokens (`amber`, `sky`, `indigo`, `emerald`, `rose`): `--badge-<tone>-icon`, `--badge-<tone>-dot`, `--badge-<tone>-fg`, `--badge-<tone>-bg`, `--badge-<tone>-border`.
2. **Desktop Navbar (`apps/web/src/components/layouts/site-header.tsx`)**:
   - **Primary Nav Pill Anchor**: Upgrade active top-level navigation items (`Home`, `Docs`, `About`, `Roadmap`) from flat gray fill to an elevated capsule (`border border-[var(--color-border)] bg-[var(--color-bg)] shadow-[var(--shadow-pill-active)]`) with a subtle semantic status dot or crisp active contrast, while keeping inactive items clean.
   - **Dropdown Menu Visual Anchors**: Add leading 14px semantic vector icons for dropdown entries (`Docs` vs `Notes`, `About` vs `Activity`, `+ Create` actions) and a subtle active indicator dot when `pathname === navItem.href`. Animate the dropdown trigger chevron (`rotate-180` when `isDropdownOpen`).
   - **Search Trigger Pill**: Add a compact keyboard shortcut kbd badge (`/` pill) alongside the search icon and apply the `0e556e01` toolbar button micro-shadow (`shadow-[0_1px_2px_rgba(15,23,42,0.04)]`).
   - **Settings & Theme Icon Buttons**: Add subtle border/surface elevation on active/hover states matching the toolbar pill language.
3. **Mobile Header Drawer (`apps/web/src/components/layouts/site-header-mo.tsx`)**:
   - Wrap expandable secondary route groups in a recessed soft container (`bg-[var(--surface-recessed-bg)] rounded-xl p-2`) with leading item icons and active status dots.

---

### Phase 2: Docs Surface Style (Home / Notes Feed, Article Reader, Admin & Import Preview)
**Verified Target Files**:
- `apps/web/src/features/docs/home/components/docs-home-intro.tsx`
- `apps/web/src/features/docs/home/components/docs-home-group-section.tsx`
- `apps/web/src/features/docs/home/components/docs-home-list-item.tsx`
- `apps/web/src/features/docs/article/docs-article-feature.tsx`
- `apps/web/src/features/docs/shared/components/docs-article-sidebar.tsx`
- `apps/web/src/features/docs/shared/components/docs-article-right-rail.tsx`
- `apps/web/src/features/docs/admin/components/docs-library-stats.tsx`
- `apps/web/src/features/docs/admin/components/docs-library-table.tsx`
- `apps/web/src/features/docs/import-preview/import-preview-review-panel.tsx`

**Optimization Scope**:
1. **Docs & Notes Header Toolbar (`docs-home-intro.tsx`)**:
   - Upgrade the role indicator badge (`Owner` / `Pro`) to a semantic tinted pill with a leading status dot (`indigo` for Owner, `amber` for Pro).
   - Style `Manage` / `Import` action links as `0e556e01` toolbar action pills (`rounded-full border bg-[var(--color-bg)] shadow-[var(--shadow-card-sm)]` + leading icon).
2. **Year Group Sections & Article Rows (`docs-home-group-section.tsx` & `docs-home-list-item.tsx`)**:
   - **Year Group Header**: Add a leading calendar/timeline accent icon (`sky`/`indigo`), compact semibold year title, and right-aligned `tabular-nums` entry count pill (`bg-[var(--surface-chip-bg)] border border-[var(--surface-chip-border)] rounded-full px-2.5 py-0.5`).
   - **Article Row Card**: Wrap each year's entries in a soft recessed lane container (`bg-[var(--surface-recessed-bg)] rounded-2xl p-2.5`) with elevated white/surface cards (`bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl shadow-[var(--shadow-card-sm)]`).
   - **Semantic Type & Lock Anchors**: Differentiate `Collection` icon (`indigo` tint) vs `Single Article` icon (`sky`/`amber` tint); render locked role badges (`Pro` / `Owner`) as semantic tinted pills with a lock icon; style expanded tag chips with `0e556e01` chip borders and leading `#` anchor.
3. **Article Reader Rails (`docs-article-sidebar.tsx` & `docs-article-right-rail.tsx`)**:
   - Add a vertical guide rail with an active left indicator bar/dot on the active chapter and active TOC heading; add metadata pills (published date / collection chip) in `docs-article-feature.tsx`.
4. **Docs Admin & Import Preview (`docs-library-stats.tsx`, `docs-library-table.tsx`, `import-preview-review-panel.tsx`)**:
   - Apply `0e556e01` semantic status pills (`Published` emerald dot pill, `Draft` amber dot pill, `Collection` indigo icon pill) and elevated stat cards with leading category icons.

---

### Phase 3: Settings Surface Style (Sidebar, Segmented Controls & Account Panel)
**Verified Target Files**:
- `apps/web/src/features/settings/page/settings-page-sidebar.tsx`
- `apps/web/src/features/settings/page/settings-page-content.tsx`
- `apps/web/src/features/settings/shared/settings-renderer.tsx`
- `apps/web/src/features/settings/account/account-settings-panel.tsx`

**Optimization Scope**:
1. **Settings Sidebar (`settings-page-sidebar.tsx`)**:
   - Place sidebar items inside a soft recessed container (`bg-[var(--surface-recessed-bg)] border border-[var(--color-border)] rounded-2xl p-2`).
   - Add dedicated leading vector icons for each section (`appearance`, `language`, `music`, `ai`, `account`); style the active section as an elevated crisp card (`bg-[var(--color-bg)] border-[var(--color-border)] shadow-[var(--shadow-pill-active)]`) with a right-side semantic active dot.
2. **Settings Segmented Controls & Row Cards (`settings-renderer.tsx`)**:
   - Upgrade `SettingsSegmentedControl` and `SettingsBooleanToggle` to the exact `0e556e01` `RoadmapSwitcher` capsule track pattern (`rounded-full border border-[var(--color-border)] bg-[var(--surface-recessed-bg)] p-1` track + `rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] shadow-[var(--shadow-pill-active)]` active pill with leading status dot/icon).
   - Group setting rows into soft recessed containers with crisp inner cards so each setting group has clear visual boundaries.
3. **Account Settings Panel (`account-settings-panel.tsx`)**:
   - Render current user role/access state (`Owner`, `Pro`, `Anonymous`) as a `0e556e01` semantic tinted chip with status dot; refine credential/session cards with the dual-layer container + card surface hierarchy.

---

### Phase 4: About Surface Style (Identity Screen, Editorial Sections & Activity Heatmaps)
**Verified Target Files**:
- `apps/web/src/features/about/index.tsx`
- `apps/web/src/features/about/activity.tsx`

**Optimization Scope**:
1. **About Identity & Sections (`apps/web/src/features/about/index.tsx`)**:
   - Add an identity eyebrow status pill (with an emerald online/active dot anchor) above the avatar/name block.
   - Add section header visual anchors (leading semantic icon/index pill) for each editorial section.
   - Upgrade the bottom `activityLink` (`View Activity ->`) into a `0e556e01` elevated capsule action button (`rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2 shadow-[var(--shadow-card-sm)]`).
2. **About Activity & Heatmaps (`apps/web/src/features/about/activity.tsx`)**:
   - Upgrade the Period (`7d / 30d / 90d / 1y`) and Scope (`All / Public`) selectors to `0e556e01` recessed-track capsule switchers (`RoadmapSwitcher` pattern).
   - Wrap GitHub Activity and Writing Activity heatmap panels in the `0e556e01` dual-layer surface (`bg-[var(--surface-recessed-bg)]` outer frame + `bg-[var(--color-bg)]` elevated heatmap card), adding leading category icons (Git branch icon in emerald, Writing pen icon in amber) and `tabular-nums` total contribution pills in the card headers.
   - Add vertical timeline connectors and semantic status dots to the activity breakdown feed.

---

### Phase 5: Music Plugin Style (Floating Player Orb/Compact/Expanded & Settings Music Admin)
**Verified Target Files**:
- `packages/music/src/react/music-player/components/player-orb.tsx`
- `packages/music/src/react/music-player/components/player-compact.tsx`
- `packages/music/src/react/music-player/components/player-expanded.tsx`
- `packages/music/src/react/music-player/components/player-library-switcher.tsx`
- `packages/music/src/react/music-player/components/player-playlist.tsx`
- `packages/music/src/react/settings/music-settings-panel.tsx`
- `packages/music/src/react/settings/music-admin-panel.tsx`
- `packages/music/src/react/settings/music-upload-zone.tsx`
- `packages/music/src/react/settings/music-library-editor.tsx`
- `packages/music/src/react/settings/music-track-table.tsx`
- `packages/music/src/react/settings/music-multi-select.tsx`

**Optimization Scope**:
1. **Floating Music Player (`player-orb.tsx`, `player-compact.tsx`, `player-expanded.tsx`, `player-library-switcher.tsx`, `player-playlist.tsx`)**:
   - **Playback Status Visual Anchor**: Add an emerald active dot / equalizer pulse indicator when `isPlaying` is true (and a soft neutral/amber dot when paused) on `PlayerCompact` and `PlayerOrb`.
   - **Rate & Library Switcher Pills**: Upgrade `PlayerLibrarySwitcher` to the `0e556e01` recessed-track capsule switcher style; refine the playback rate badge (`1.0x` / `1.25x`) as a bordered semantic chip (`bg-[var(--surface-chip-bg)] border border-[var(--surface-chip-border)]`).
   - **Expanded Playlist (`PlayerPlaylist`)**: Wrap the track list in a soft recessed container where the currently playing track is highlighted as an elevated crisp card (`bg-[var(--color-bg)] border border-[var(--color-border)] shadow-[var(--shadow-card-sm)]`) with a leading colored indicator dot.
2. **Settings Music Admin (`music-settings-panel.tsx`, `music-admin-panel.tsx`, `music-upload-zone.tsx`, `music-library-editor.tsx`, `music-track-table.tsx`, `music-multi-select.tsx`)**:
   - **Upload Zone & Library Editor**: Frame the upload dropzone and library editor in `0e556e01` soft recessed containers with elevated inner library cards and semantic badge counts (`tabular-nums`).
   - **Track Table & Multi-Select Chips**: Render track library tags in `MusicMultiSelect` and `MusicTrackTable` as `0e556e01` tinted semantic chips (with leading colored dot and subtle border), and display track enabled/disabled status with emerald/neutral dot pills.

---

## 3. Verification & Commit Protocol per Phase
- Run `pnpm typecheck` and `pnpm test` after each phase (or logical commit group).
- Strictly preserve all existing comments and docstrings (`docs/READAI.md` §2.1).
- Work strictly inside `D:\Desktop\code\code\Incept-style` on branch `feature/style` (no push, merge, branch switch, or worktree deletion).
