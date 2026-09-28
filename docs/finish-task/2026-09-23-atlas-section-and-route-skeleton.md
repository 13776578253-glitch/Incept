# Atlas Section And Its Route Skeleton

## Status

Implemented and verified in the current working tree, **uncommitted**. The owner reviews it
before any commit. This record covers the `/[locale]/atlas` section on 2026-09-23:
the section was created, named, given a route skeleton, and mounted into public navigation.

## What Changed

`/[locale]/workspace` was a 25-line placeholder that rendered a heading and the sentence
"This surface is reserved for the standalone workspace experience." It was hidden from public
navigation by a commented-out block in `components/layouts/site-navigation.ts`.

It was rebuilt, renamed twice, and restructured — all before any commit. The section now owns
a subtree of maps derived from the project itself, and is called `atlas` (图谱).

## The Naming Sequence, And Why It Took Three Attempts

The failures are the useful part of this record, because the first two names failed for
different reasons and both reasons are repeatable.

**1. `workspace`.** Mounted as a hub linking out to `/docs`, `/notes`, `/settings`, `/about`.
Rejected because "workspace" promises a place to work, and the section holds small viewing
surfaces. It was also a name collision: `WorkspaceShell` and `.page-shell-workspace` are the
*shared utility shell* that `/studio/docs/library` mounts.

**2. `tools`.** Mounted with its own subtree, then rejected because "tools" names a container
by the kind of thing inside it, and nothing fit:

- Playback is a way of *listening*, not a way of reading the project.
- An architecture diagram and a roadmap are not implements you pick up to do work; they are
  ways of *looking* at what already exists.

The section's members do not share a container type. They share a relationship to content.

**3. `atlas`.** Kept. The members are maps of the project: structure, time, subject. Each
derives a view from material that already exists rather than producing new material. The word
carries both "figure" (architecture, roadmap) and "collection" (keywords), which is why it
survives where the other two did not.

## Playback Was Moved Out

`playback` was the one entry that did not fit the grouping, so it left the section rather than
being accommodated by a vaguer name. Its navigation entry now points at `/settings`, where
playback preferences and the music library already live, and `/tools/playback` redirects there.

This is recorded in the decision document as a **coherence condition**: the section is defined
by "a view derived from existing content", so a future non-map entry is the signal to
reconsider whether the section still holds together.

## Section Shape

```
/{locale}/atlas                card grid, one per map
/{locale}/atlas/architecture   not implemented
/{locale}/atlas/roadmap        not implemented
/{locale}/atlas/keywords       not implemented
```

Navigation is a hover dropdown modelled on the existing `docs` entry: the top-level label is
still a `<Link>` to `/atlas`, so clicking opens the overview while hovering reveals the three
maps. The dropdown carries a fourth entry, Playback, pointing at `/settings`; it is an exit
from the section, not a member of it.

## Redirects Instead Of Broken Links

Both earlier paths were genuinely reachable and appeared in public navigation, so neither was
deleted:

| Old path | Now |
| --- | --- |
| `/workspace` | → `/atlas` |
| `/tools` | → `/atlas` |
| `/tools/architecture` | → `/atlas/architecture` |
| `/tools/roadmap` | → `/atlas/roadmap` |
| `/tools/keywords` | → `/atlas/keywords` |
| `/tools/playback` | → `/settings` |

The three moved routes are handled by one catch-all, `tools/[...tool]/page.tsx`, rather than
three near-duplicate files. A path not in its table returns `notFound()` rather than falling
back to `/atlas`, so a wrong URL stays visibly wrong.

## The Three Maps Are Not Implemented, And Say So

Each atlas route mounts `AtlasPlaceholderScreen`, which renders an explicit "not implemented
yet" state. The nav dropdown lists three maps that do not exist yet, which is a real risk of
over-promising, so both surfaces admit it: every card carries a line naming what that map is
planned to show, and every map page says the map has not been drawn.

The decision document records this as a **deliberate relaxation** of its own earlier rule,
which had required every listed entry to already work.

## The Boundary That Was Kept

The decision document states that this surface does **not** carry docs back-office data. The
rebuild respects that:

- No entry links to an internal surface. `/studio/docs/library`, `/docs/style-lab` and
  `/docs/import-preview` are not referenced.
- The section reads no database and takes no viewer, so the six-layer boundary in
  `docs/decisions/en/db-layer-architecture-rules.md` is untouched: no new query, mapper or
  loader.
- Nothing outside the `/atlas` subtree is listed.

## Single Registry

`features/atlas/atlas-registry.ts` is the one place a map is declared: `key`, `path` and the
three i18n key names. The overview cards and the map page titles both derive from it, so
adding a map is a one-file change and the labels cannot drift apart.

## Files

Created:

- `apps/web/src/app/[locale]/atlas/page.tsx` — overview
- `apps/web/src/app/[locale]/atlas/{architecture,roadmap,keywords}/page.tsx`
- `apps/web/src/app/[locale]/tools/page.tsx`, `tools/playback/page.tsx`,
  `tools/[...tool]/page.tsx` — redirects for the retired paths
- `apps/web/src/features/atlas/` — `index.ts`, `atlas-registry.ts`, `atlas-index.tsx`,
  `atlas-placeholder-screen.tsx`, `components/{atlas-hub,atlas-card,atlas-placeholder}.tsx`,
  `components/__tests__/atlas-hub.test.tsx`
- `apps/web/src/messages/{en,zh}/atlas.json`

Modified:

- `apps/web/src/app/[locale]/workspace/page.tsx` — placeholder replaced by a redirect
- `apps/web/src/components/layouts/site-navigation.ts` — the `atlas` dropdown replaces `tools`
- `apps/web/src/messages/{en,zh}/navigation.json` — `primary.atlas` and the `groups.atlas` block
- `apps/web/src/i18n/loaders/get-messages.ts` — the `atlas` namespace is registered

Deleted:

- `apps/web/src/features/tools/` and `apps/web/src/messages/{en,zh}/tools.json`
- `apps/web/src/features/workspace/` and `apps/web/src/messages/{en,zh}/workspace.json`
- `apps/web/src/app/[locale]/tools/{architecture,roadmap,keywords}/` — superseded by redirects

## Conventions Followed

- **Copy is not hardcoded.** Cards are built from `t('...')` exactly as `features/home/index.tsx`
  does.
- **Presentational components take plain strings.** `AtlasHub`, `AtlasCard` and
  `AtlasPlaceholder` receive translated strings as props, following
  `features/music-player/components/player-library-switcher.tsx`, so they are testable without
  mocking `next-intl`.
- **Links go through `withLocalePath`**, and the registry stores locale-free paths for display.
- **`getTranslations` is awaited before use.** In next-intl 4.11 it returns
  `Promise<createTranslator(...)>`; the translator is only synchronous after `await`.
- **`WorkspaceShell` is reused, not replaced.** Its name now refers only to the shared utility
  shell used by `/studio/docs/library`; see Not Verified.

## Verification

| Check | Result |
| --- | --- |
| `pnpm --filter web typecheck` | Passes, no errors |
| `pnpm --filter web test` | **189 passed / 22 files**, including the 5 atlas-hub tests |
| i18n key parity (`atlas`) | 17 keys in `en` and `zh`, **identical**; none defined-but-unused, none used-but-undefined |
| i18n key parity (`navigation`) | 31 keys in `en` and `zh`, **identical**; all 11 `groups.atlas.*` / `primary.atlas` keys referenced by `site-navigation.ts` resolve |
| Atlas pages render | `/zh/atlas`, `/en/atlas` and all three map pages: **HTTP 200**, expected copy present |
| Playback absent from the atlas | No `/atlas/playback` link and no playback card on the hub |
| All six redirects | `/workspace`, `/tools`, `/tools/playback` and the three moved routes all land on the documented target |
| Unknown path under a retired prefix | `/zh/tools/nonexistent` → **404**, not a silent fallback |
| Nav dropdown | All five `atlas`/`settings` hrefs present in the served HTML of `/zh/docs` |
| `[object Promise]` leak | Absent |

Pages were rendered by the long-running Next.js dev server already on port 3000, so the
`useTranslations` / `getTranslations` lookups are confirmed to resolve at describe time.

**Three check failures in this round were bugs in my own verification, not in the code.** They
are recorded so they are not mistaken for defects later:

1. A `-like '*[object Promise]*'` test matched every page, because PowerShell treats `[...]` as
   a character class. Re-run with `String.Contains`: zero occurrences.
2. `Test-Path` / `Set-Location` on `app\[locale]\...` missed every file, same cause. Re-run
   with `-LiteralPath`. This one also caused a `Remove-Item` to run in the wrong directory
   and delete nothing, which is why it was caught rather than silently ignored.
3. An assertion expected the string `计划：绘制六层边界` while the rendered card actually reads
   `计划：依据已核实来源绘制六层边界与数据库结构`. The page was correct; the expected value was
   wrong.

## Not Verified

- **The English and Chinese copy has not been second-reviewed.**
- **No browser or screenshot pass.** Pages were verified by fetching rendered HTML; grid
  layout, dark-theme variables and hover states were reasoned about, not seen. Card styles use
  `--color-border`, `--color-text`, `--color-text-muted` and `--color-text-soft`, all defined
  for both themes in `styles/theme.css`.
- **`WorkspaceShell` and `.page-shell-workspace` still carry the old name.** They are now used
  only by `/studio/docs/library` and the atlas pages, and the name is accurate for neither this
  section nor the studio surface. Renaming the shared shell and its CSS class is a separate
  cross-cutting change; it was deliberately not folded into this one.
- **The three maps are placeholders**, so no map behaviour exists to test. The registry-to-route
  correspondence is covered by the filesystem check above, not by a test.
- **`pnpm --filter web lint` was not run.** It is unusable in this repository — ESLint 9 is
  installed but no `eslint.config.*` exists — a pre-existing condition.

## Next Steps

- Review the copy, the name and the structure, then commit.
- Pick one map to implement first. `/atlas/roadmap` is the cheapest real one: `docs/NEXT.md`,
  `docs/BACKLOG.md` and `docs/finish-task/` already hold the data, so it needs no new data
  channel. `/atlas/keywords` and `/atlas/architecture` each need a data path that does not
  exist yet.
- `docs/BACKLOG.md` records no TODO for this surface.
- Still-hidden top-level surfaces: `home` (B-01, the only route where a data path exists but is
  not wired up), `resources`, and `/docs/archive`.
