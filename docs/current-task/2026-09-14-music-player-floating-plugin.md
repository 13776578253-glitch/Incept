# Floating Music Player Plugin

## Status

Implemented in the working tree. Prepared for the next Git commit.

## Scope

This task records the first closed loop of the site-wide floating music player, plus the new workspace package that owns its domain logic.

Delivered:

- `@incept/music-player-core`: a DOM-free, dependency-free workspace package holding the player domain (track types, queue operations, playback-mode resolution, timing clamps, and the pure reducer).
- `apps/web/src/features/music-player`: the host-side runtime (single audio owner, audio event bridge, intent side effects), the mock music source adapter, and the `orb / compact / expanded` floating UI.
- Deterministic mock audio generated into `apps/web/public/mock/audio/` by `scripts/music-mock-audio.mjs`.

Explicitly out of scope for this task: database tables, real hosted audio, guest/pro/owner access rules, cross-device sync, queue and progress persistence, Media Session, repository-wide ESLint setup, and a repository-wide z-index refactor.

## Architecture boundary

```text
@incept/music-player-core          pure domain state and queue decisions
              ↓
features/music-player/runtime     HTMLAudioElement and browser events
              ↓
features/music-player/adapter     locale copy, mock source resolution
              ↓
features/music-player/components  React UI, floating interaction, Tailwind
```

The core package has empty `dependencies`, no `@/*` paths, and a dedicated TypeScript configuration with `"lib": ["ES2022"]` and `"types": []`. It cannot reference `window`, `document`, `navigator`, `localStorage`, or `HTMLAudioElement` without a TypeScript error.

## Key design decisions

- **User intent and browser facts are separate inputs.** `PlayerIntent` (`playRequested`, `pauseRequested`, …) never reports success; only `<audio>` events (`playStarted`, `playPaused`, `playRejected`, `trackLoaded`, `timeUpdated`, `trackEnded`, `audioErrored`) update the real playback state. A rejected `play()` therefore cannot leave the UI claiming playback.
- **One audio element for the whole site**, rendered and owned by `MusicPlayerRuntimeProvider` in `apps/web/src/app/layout.tsx`, above the `[locale]` segment. Switching `zh`/`en` rebuilds the floating UI without recreating the audio element or the in-memory queue.
- **`restartToken`** distinguishes "restart the current track from zero" from "resume". The runtime resets `currentTime` only when the token changes, so repeat-one replay works without breaking pause/resume.
- **Source swaps suppress the browser's synthetic `pause` event**, which would otherwise overwrite the new track's state.
- **Only the floating UI position is persisted**, under `incept-music-player:v1:floating-ui`, as `{ edge, offsetRatio, mode }`. No queue or progress persistence exists, because the real audio source is still undecided.
- **The player sits at `--z-music-player: 45`**, below the header (50) and above the toast layer (40). Existing z-index values were deliberately not refactored.

## Main files

New package:

- `packages/music-player-core/package.json`
- `packages/music-player-core/tsconfig.json`
- `packages/music-player-core/tsconfig.test.json`
- `packages/music-player-core/src/{types,state,intents,runtime-events,reducer,queue,playback-mode,timing,index}.ts`
- `packages/music-player-core/src/__tests__/{queue,reducer,playback-mode,timing}.test.ts`

New feature:

- `apps/web/src/features/music-player/runtime/{music-player-provider.tsx,audio-element-driver.ts,runtime-controller.ts}`
- `apps/web/src/features/music-player/adapter/{mock-music-source.ts,player-copy.ts}`
- `apps/web/src/features/music-player/components/{music-player-floating,player-orb,player-compact,player-expanded,player-playlist,player-icons}.tsx`
- `apps/web/src/features/music-player/hooks/{use-music-player,use-floating-position,use-player-viewport}.ts`
- `apps/web/src/features/music-player/{music-player-runtime-mount,music-player-floating-mount,index}.ts(x)`
- `scripts/music-mock-audio.mjs`
- `apps/web/public/mock/audio/mock-track-0{1,2,3}.wav`

Modified:

- `apps/web/next.config.ts` (transpilePackages)
- `apps/web/package.json` (workspace dependency)
- `apps/web/src/app/layout.tsx` (runtime mount)
- `apps/web/src/app/[locale]/layout.tsx` (floating mount)
- `apps/web/src/styles/tokens.css` (`--z-music-player`)
- `package.json` (music check scripts)

## Verification

Passed:

- `pnpm --filter @incept/music-player-core test` — 64 tests, 0 failures.
- `pnpm --filter @incept/music-player-core typecheck` — both the DOM-free source config and the test config.
- `pnpm --filter web exec tsc --noEmit`.
- `git diff --check` — no whitespace errors.
- Boundary probe: a temporary file containing `window.localStorage` inside the core source made the core typecheck fail with `error TS2304: Cannot find name 'window'`, confirming the configuration — not a text search — enforces the boundary. The probe was removed.
- Server-rendered checks against the running dev server: the player renders on `/zh`, `/zh/notes`, `/zh/settings`, `/zh/docs`, `/en`, `/en/notes`, `/en/settings`, and `/en/docs`; the `/zh` document contains exactly one `<audio>` element; Chinese and English copy resolve correctly; `/mock/audio/mock-track-01.wav` is served at the expected 132344 bytes.

Not verified here (requires a real browser; see the acceptance checklist):

- Actual audio playback and pause/resume.
- Same-locale navigation and `zh`/`en` switching without interrupting playback.
- Three-state switching, drag and edge snapping, and position restore after reload.
- Mobile bottom-bar behaviour and drag suppression below the `md` breakpoint.
- Autoplay-rejection handling in the UI.
- light / dark / warm readability.

Environment notes:

- `next build` still fails at the Windows TypeScript phase with `spawn EPERM`; this pre-dates the task, so verification used `tsc --noEmit`.
- `pnpm lint` remains unavailable because the repository has no ESLint configuration. Playback of the added code was verified with `tsc` only, by design.

## Follow-up checks

- Run the browser acceptance checklist in `docs/current-task` scope and record results.
- Decide the real audio source before designing any persistence protocol; `snapshot` was intentionally not created.
- Confirm the reference-image details that were left open: the meaning of the `18:01` chip, the exact roles of the `×` and `▼` controls, whether a list row plays or expands, and whether a volume control is needed.
- Repository-wide ESLint and the z-index token migration remain separate infrastructure tasks.

## Commit proposal

`feat(web): add the floating music player with a DOM-free core package`

[2026-09-14 23:02] - Update by AI完成改动:
- 新增 `packages/music-player-core`，实现无 DOM、无第三方依赖的播放器领域层（类型、队列、播放模式、时间校验、reducer），并配 4 个 node:test 测试文件与无 DOM 的独立 tsconfig。
- 新增 `apps/web/src/features/music-player`，实现唯一 audio owner 的 runtime、mock 音源适配层与 orb/compact/expanded 三态悬浮 UI，以及拖拽吸附、位置持久化与移动端底部条。
- 修改了 `apps/web/next.config.ts`、`apps/web/package.json`、根 `package.json`、`apps/web/src/app/layout.tsx`、`apps/web/src/app/[locale]/layout.tsx`、`apps/web/src/styles/tokens.css`，接入工作区依赖、双挂载点与 `--z-music-player: 45`。
- 遗留问题: 真实浏览器验收未完成（实际播放、跨页面与跨 locale 连续播放、三态切换、拖拽吸附、位置恢复、移动端、自动播放被拒时的 UI）；B-06 式真实数据验收仍缺；参考图细节（18:01 语义、× 与 ▼ 的分工、行点击行为、是否需要音量）待确认；next build 的 Windows `spawn EPERM` 与仓库缺 ESLint 配置为既有环境限制。
- Commit 建议: `feat(web): add the floating music player with a DOM-free core package`

## Review Round

An independent browser review rejected the first version. Recorded here with the fixes applied in response.

### Confirmed defects

1. **Playback never started.** `audio.play()` was called from a React effect instead of the click call stack, so the browser could reject it after transient user activation was lost. Confirmed in the browser: `paused` stayed `true` and `currentTime` stayed `0`.
2. **Pointer capture swallowed clicks.** The drag wrapper called `setPointerCapture` on pointerdown, so the expand button and the orb never received their click events. Desktop could not reach `expanded`, and could not return from `orb`.
3. **Playback errors were invisible.** `playRejected` and `audioError` copy existed in the adapter, but nothing rendered the error state.
4. **`pause` before `ended` race.** A natural end may dispatch `pause` before `ended`, and the queue decision derived "keep playing" from `status === 'playing'`, so the next track would have stayed paused.

### Fixes

- `startPlayback` is now the single playback entry point. `playRequested` calls it directly inside the click handler; the reconciliation effect calls it for automatic continuation, repeat-one replay, and the case where the source is not resolved yet. An `!audio.paused` guard stops the two paths from double-firing. `playStarted` is still only ever produced by the real `play` event, and a rejected `play()` still becomes `playRejected`.
- `setPointerCapture` now happens only after the drag threshold is exceeded, and a completed drag sets a click-suppression flag consumed by an `onClickCapture` handler. A plain click or tap on the title or orb is no longer captured, so those buttons work again.
- The runtime now exposes a `PlayerErrorKind` (`playRejected` | `audioError`). The floating UI maps it to localized copy through the adapter and renders it in a `role="status"` / `aria-live="polite"` notice. Raw browser error messages are never displayed.
- `trackEnded` always continues playback when it selects a next track, because a track can only end naturally while playing. Covered by three new core tests: the pause-then-ended order, repeat-all after a pause, and the requirement that a manual pause never advances the queue.
- Added reproducible check scripts: `apps/web` and the repository root both expose `typecheck`, so verification no longer depends on resolving `tsc` from the repository root.

### Verification status after the fixes

- `pnpm --filter @incept/music-player-core test` — 67 tests, 0 failures, in the implementer's environment.
- `pnpm typecheck` — web and core both pass through the new explicit project scripts.
- `git diff --check` — clean.
- Server-rendered re-check of `/zh`: exactly one `<audio>`; the player markup is intact; the draggable title button is no longer marked interactive; no error notice is rendered while there is no error.

**Not re-verified:** the browser checks that found these defects have not been re-run, because this environment has no browser. Basic playback, three-state clicking, pointer-capture behavior, and natural-end continuation still require a real browser pass.

Note for the record: the reviewer could not independently reproduce the core test run because `node:test` / `tsx` / `esbuild` hit `spawn EPERM` in its Windows environment. The 67-passed result above is the implementer's own run, not a reproduction by the reviewer, and must not be cited as a review pass.

### Still open

- `nextRequested`, `previousRequested`, `seekRequested`, `playbackRateRequested`, and `repeatModeRequested` are implemented and tested in core but have no UI entry point. They are either wired up in this task or moved to Phase 5 and removed from the acceptance table.
- Reference-image details remain undecided: the meaning of the `18:01` chip, the roles of `×` and `▼`, whether a list row plays or expands, and whether a volume control is needed.

### Updated commit proposal

`feat(web): add the floating music player with a DOM-free core package`

Subject unchanged. The fixes above belong in the same commit because the feature has not been committed yet.

### Scope Decision

Confirmed after the review round:

- All five un-wired controls (`nextRequested`, `previousRequested`, `seekRequested`, `playbackRateRequested`, `repeatModeRequested`) move to Phase 5. The first version deliberately delivers only play, pause, and track selection. They are registered as B-16 and marked with an in-place TODO at the wiring site, so the capability cannot be mistaken for delivered.
- The `18:01` chip is confirmed as **total duration**, which is what the current implementation already renders. No change required.
- The plan's acceptance table never listed the five controls, so no acceptance item changes; only the earlier reporting was wrong to imply they worked.
- Because the five controls are deferred, they must not be cited as delivered capability in the commit message or anywhere else.

### IDE Configuration Fix

The first version kept the test files in `tsconfig.test.json` and excluded them from `tsconfig.json`. The editor assigns files that no project owns to an inferred project, which has no `types` configuration, so VS Code reported `Cannot find module 'node:test'` and `Cannot find module 'node:assert/strict'` on every test file even though all command-line checks passed.

The configuration was restructured so every file is owned by a project the editor can resolve by name:

- `tsconfig.json` — the editor's default. Includes all of `src/` (source and tests), `types: ["node"]`, `lib: ["ES2022"]`. This is the full check.
- `tsconfig.src.json` — the strict boundary config for source only. `types: []`, tests excluded. This is what stops core from using DOM or Node globals.
- `tsconfig.test.json` was removed as superseded.

`typecheck` now runs the strict config first, then the full one, so the boundary guarantee is unchanged.

Boundary re-verified after the restructure:

- `window.localStorage` placed in `src/` produces `error TS2304: Cannot find name 'window'`, and the package `typecheck` script exits with status 2.
- `process.env.HOME` placed in `src/` produces `error TS2591: Cannot find name 'process'` under the strict config, while the editor config accepts it because it carries Node types for the test files.

DOM globals are rejected by both configs, since the DOM library is excluded from both. The strict config additionally rejects Node globals.

## Interaction And Layout Revision

Four defects were reported against the first browser pass. All four are addressed, and the evidence below comes from a browser run in the implementer's environment.

### 1. 急速点击与收起时的残影

Cause: changing `placement.mode` resized the element immediately, but the geometry was still derived from the previous `ResizeObserver` measurement, which only lands after paint. For one frame the collapsed orb was positioned using the expanded panel's width and height, so it appeared where the panel had been.

Fix: a `useLayoutEffect` measures the element right after the DOM updates and before paint, so size and position change in the same frame. The `ResizeObserver` remains, but its callback and the layout effect share one `measureElement` function that reads `getBoundingClientRect()`, so both agree on border-box numbers.

### 2. 交互语义反了

Previously the chevron collapsed the player and the title expanded the list. Now each control owns exactly one transition:

- The circular artwork/time button toggles the player between `orb` and `compact` (click to expand, click again to collapse).
- The chevron toggles the list between `compact` and `expanded`.
- The chevron points down while the list is collapsed and up while it is expanded, matching the reference images.
- The title is plain text again, which also restores it as a drag surface.

### 3. 展开后整体偏移

Measured before the fix: `top` 359 → 228 and `bottom` 413 → 475, so both vertical edges moved. Two causes: the vertical position was a ratio over an element-height-dependent range, so any height change moved both edges; and the compact bar and the expanded card had different widths, which moved the left edge as well.

Fix: the ratio now maps over a height-independent range and anchors the **bottom** edge, and both surfaces share one fixed width (`min(22rem, calc(100vw - 2.5rem))`). Expanding therefore only moves the top edge — the list grows upward out of the pill.

Measured after the fix:

| State | left | right | bottom | top | width | height |
| --- | --- | --- | --- | --- | --- | --- |
| compact | 886 | 1238 | 396 | 342 | 352 | 54 |
| expanded | 886 | 1238 | 396 | 167 | 352 | 229 |
| orb | 1182 | 1238 | 396 | 340 | 56 | 56 |
| compact (round-trip) | 886 | 1238 | 396 | 342 | 352 | 54 |

Left, right and bottom are identical in all three states; only the top edge moves, and the round-trip returns to the exact starting geometry.

### 4. 展开态是一张卡片而不是嵌套胶囊

The expanded state used to be a rounded card containing a second, separately styled pill. It is now a single surface: `PlayerCompact` gained a `bare` variant that drops its own border, radius, background and shadow, and `PlayerExpanded` renders that variant as the card's bottom row. Header, list and bar share one background and one border.

Colour was also aligned with the reference: the play button and the artwork/time circle now use the raised-surface token with the foreground text colour, instead of the inverted primary-button treatment.

### 本轮浏览器验证结果

- 播放可用：真实输入点击后 `audio.paused` 为 `false`，`currentTime` 持续推进（等待 1.5 秒后为 1.44），按钮文案切到 `暂停`。
- 自动续播可用：播放从 track 01 连续推进到 track 03 未中断，即此前修复的 pause-before-ended 竞态。
- 三种状态均可切换并正确渲染，上表的几何数值稳定。

**关于播放测试方法的注意事项：** 用脚本 `element.click()` 触发播放按钮不产生 user activation，浏览器会拒绝 `play()`，`paused` 保持 `true`。这正是本次修复针对的条件，因此该路径必须用真实输入（`agent-browser click @ref`，走 CDP）验证，脚本点击无法验证它。

### 仍未验证

残影没有逐帧复现；本次是靠机制（同帧测量）与几何稳定性这两项证据确认的，而不是截取到中间帧。浅色与 warm 主题下的观感、移动端底部条布局仍未验证。

## Route Visibility

The player rendered on every HTML route because it is mounted in `[locale]/layout.tsx`, which every page shares.

This cannot be solved by excluding a layout. The App Router has no way for a route to opt out of a parent layout, and the mount has to stay at the layout level: moving it down into a page shell would remount the runtime on every cross-shell navigation and destroy the single `<audio>` element. The decision therefore lives inside the component.

`adapter/player-route-policy.ts` owns both the list and the matching rule; `MusicPlayerFloating` returns `null` when the current pathname matches.

- Matching strips the locale prefix first, so `/en/studio/x` and `/zh/studio/x` are the same route, then matches on whole segments: a path is hidden when it equals a prefix or starts with `prefix/`.
- The query string never participates. `usePathname()` does not return it, so `/zh/settings?returnTo=%2Fzh%2Fdocs` matches on `/settings` alone.

Hidden prefixes: `/settings`, `/workspace`, `/studio`, `/docs/style-lab`, `/docs/import-preview`.

These are the tool-shaped surfaces. A floating overlay adds nothing on a page the visitor is using to do a specific task, and it covers content.

**Behaviour: the UI is hidden and playback is paused, with the position preserved.**

Hidden routes dispatch `pauseRequested` from an effect that is registered before the early return, since hooks cannot run after it. Only the UI is removed; nothing touches `currentTime` or `restartToken`, so the listener's position survives and pressing play on a normal page resumes from that spot instead of restarting the track.

Revision note: the first version of this policy hid the UI but left audio playing. It was reversed by an explicit decision, because a page that emits sound with no visible control is worse than one that stops — the visitor hears music and has nothing to stop it with. Auto-resume was deliberately not added: returning to a normal page leaves the player paused, so sound never starts on its own.

### Verified in the browser

| Route | Player UI | `<audio>` |
| --- | --- | --- |
| `/zh/settings?returnTo=%2Fzh%2Fdocs` | hidden | present |
| `/en/studio/docs/library` | hidden | present |
| `/en/docs/style-lab` | hidden | present |
| `/zh/docs/import-preview/` | hidden | present |
| `/zh/docs` (control) | shown | present |

The pause-and-preserve behaviour was verified as a full round trip, not as a single reading:

| Step | Path | Player UI | `paused` | `currentTime` |
| --- | --- | --- | --- | --- |
| initial | `/zh` | shown | true | 0 |
| after pressing play | `/zh` | shown | false | 1.95 |
| after entering settings | `/zh/settings` | hidden | true | 2.09 |
| after returning home | `/zh` | shown | true | 2.09 |
| after pressing play again | `/zh` | shown | false | 4.11 |

Entering `/settings` flipped `paused` to true and left `currentTime` at 2.09 rather than 0. Returning home kept that position with playback still paused, and pressing play resumed from 2.09 to 4.11 over a 1.9 s wait — it did not restart the track.

The compact title was also inspected in this round. See the correction under "Expand interaction" below: the first reading of that probe was wrong and the title really was interactive.

Test-method note for future rounds: `agent-browser open` clears the element ref table, so a real click must be preceded by a fresh `snapshot` in the same session. A click against a stale ref silently fails with `Unknown ref`, which produces an all-paused reading that looks like a code defect.

## Playback Rate, Long List And Interaction Fixes

### Playback rate

- `PLAYBACK_RATE_OPTIONS` lives in `adapter/player-copy.ts` and cycles `0.5 → 0.8 → 1 → 1.5 → 2`. The requested set was `0.5 / 0.8 / 1.5 / 2`; `1` was added because a cycle without it can never return to normal speed. Removing it is a one-element edit.
- Every option sits inside core's `[MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE]` range, so `playbackRateRequested` accepts all of them and core needed no change.
- Core **rejects** an out-of-range rate instead of clamping it, which is why the option list is the only place that decides what the user can pick. A rate that is not one of the five is simply unreachable.
- Verified: the label reads `1x`, and one click advances it to `1.5x`.

### Long list

- `mock-music-source.ts` now builds 27 tracks, matching the reference image's count. Only three real WAV files exist; they are reused by index. List length and audio asset count are independent concerns.
- The playlist exposes exactly five rows: rows are fixed at `h-11` (44px) and the list is capped at `13.75rem` (220px) with `overflow-y-auto`. A fixed row height is what makes "at most five visible" a real constraint rather than an estimate that drifts with content.
- Verified: 27 items, `clientHeight` 220, `scrollHeight` 1214, so the list scrolls rather than growing the panel.

### Expand interaction

- The compact title is a plain `<span>` again. It previously carried `role="button"`, `tabIndex={0}`, and an `onClick` that expanded the list, which made the title and the chevron two entry points for the same transition.
- Only the chevron toggles the list now; the title is a drag surface and nothing else.
- Verified: the title reports `role: null` and `tabindex: null`, and clicking it leaves the mode at `compact`.

Correction to an earlier entry in this document: a previous round concluded that the accessibility snapshot labelling the title `button` was a tool artifact, because a DOM probe found `titleTag: SPAN` and `titleInsideButton: false`. **That conclusion was wrong.** The element genuinely was interactive — it carried `role="button"` and a click handler, neither of which the probe checked. The snapshot was reporting the element accurately and the probe was too narrow.

### Heading

The section heading dropped its leading word and now renders `列表（27）` / `List (27)` through `formatPlaylistHeading`.

## Settings Plugin Section

A settings section was added so plugin preferences have a home instead of accumulating inside the floating player.

- Section id `plugin`, registered between `account` and `ai`, so the sidebar order is Appearance → Language → Account → Plugin → Model.
- Files: `features/settings/plugin/plugin-schema.ts` is new; `shared/settings-schema.ts` registers it and `shared/settings-types.ts` widens the `id` union.
- The section is `visibility: 'public'` with three read-only `status` rows: whether the floating player is enabled, the current speed with a `Pending` badge, and the remembered floating position.
- **No dead controls.** Values that cannot be configured yet are shown as status rows rather than as switches that do nothing when clicked. This follows the existing `ai` section, which already ships three locked rows, so the shape is an established pattern rather than a new compromise.
- Interactive preferences — default speed, edge snapping, and whatever the music source and storage decision produces — wait for that decision.

### Verified in the browser

| Check | Result |
| --- | --- |
| Sidebar order (zh) | 主题 → 语言 → 账户 → 插件 → 模型 |
| Sidebar order (en) | Appearance → Language → Account → Plugin → Model |
| Selected heading | 插件 / Plugin |
| Row labels | 悬浮播放器, 默认倍速, 悬浮位置 / Floating player, Default speed, Floating position |

Note: a selected section's rows appear twice in the DOM because the desktop branch renders only the selected panel while the mobile branch renders every section; which copy is visible is decided by `lg:block` versus `lg:hidden`. That duplication is pre-existing behaviour for every section, not something this change introduced.

## Next Round

The real music source and storage design is the next discussion. It is deliberately not started here: the player currently reads from `adapter/mock-music-source.ts`, which resolves a track id to one of three generated WAV files and holds the publish dates that core does not know about. Whatever replaces it has to decide the schema, the access rules, and whether the default-speed preference becomes a persisted setting.

## Verification Closure

Two items were listed as unverified. Both were reviewed by the repository owner in a real browser and passed:

- Light and warm themes render correctly, including the raised-surface play button and the artwork/time circle.
- The mobile layout works: the player is pinned to the bottom edge with safe-area padding, the orb state is absent by design, and the expanded list behaves as a bottom sheet.

With those closed, every acceptance item in the plan is either verified or explicitly deferred. The deferred set is the five playback controls moved to Phase 5 and registered as B-16; they must not be described as delivered.

### Version control note

`apps/web/public/mock/audio/` is now ignored. The three WAV files are deterministic output of `scripts/music-mock-audio.mjs`, so the generator is committed instead of the artefacts.

Consequence: a fresh clone has no audio, and `resolveTrackSource` fails until the files exist. Run one of these before starting the player:

- `pnpm music:mock-audio`, or
- `node scripts/music-mock-audio.mjs`

The failure is handled — a missing source dispatches `audioErrored` and the UI renders the localized audio-error copy — but generating the files is a required setup step, not an optional one.
