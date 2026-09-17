# Floating Music Player Plugin

## Status

Implemented and committed: the player landed as `8e481fe feat(web): add the floating music player with a DOM-free core package`, and the speed control, list fixes and settings section as `f87e07b`. Neither commit is pushed; the branch `feat/music-Plugin` is four commits ahead of its upstream.

The preference channel described below is **not** committed yet. It is part of the uncommitted working-tree layer. Its browser verification was completed on 2026-09-17 and is recorded under "Preference Channel"; the one behaviour left open there is a product question, not a missing check.

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
- The audio source decision is closed (see "Next Round" above). Queue and progress persistence remain undesigned: `snapshot` was intentionally not created in the first version, and nothing persists the queue or the playhead yet.
- Reference-image details. Settled and recorded above: the `18:01` chip (playback position by default, total duration on hover), the two list controls (`▼` / chevron toggles the list between compact and expanded, `×` closes it), and the fact that a list row plays the track rather than expanding it. Still open: whether a volume control is needed.
- Repository-wide ESLint and the z-index token migration remain separate infrastructure tasks.

## Commit record

`feat(web): add the floating music player with a DOM-free core package` — landed as `8e481fe`. The speed control, the list fixes and the settings section followed as `f87e07b feat(web): add the music player speed control, list fixes and settings section`.

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

Subject unchanged. The fixes above belonged in the same commit because the feature had not been committed yet, and that is how it landed (`8e481fe`).

### Scope Decision

Confirmed after the review round:

- Four un-wired controls (`nextRequested`, `previousRequested`, `seekRequested`, `repeatModeRequested`) moved to Phase 5 and were registered as B-16. `playbackRateRequested` was deferred here as well and wired later, when the speed control landed; `repeatModeRequested` is now driven by the persisted default-playback-mode preference instead of a player control, so three controls remain un-wired. The count in this block was five until then.
- The `18:01` chip shows the **playback position** by default and the total duration on hover. The earlier reading — that the chip is total duration, which the implementation then rendered — was superseded when the two clocks were split: `clock` is `state.currentTime`, `totalClock` is the duration, and the two overlap in the same circle so the swap does not move any layout.
- The plan's acceptance table never listed these controls, so no acceptance item changes; only the earlier reporting was wrong to imply they worked.
- Because these controls are deferred, they must not be cited as delivered capability in the commit message or anywhere else.

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

**Behaviour: the UI is hidden, playback continues.**

Hidden routes return `null` from the floating component and nothing else happens. The runtime lives above the locale segment, so audio keeps playing and the listener's position is untouched.

Revision note: this decision was reversed twice, and the second reversal is the one that stands. The first version hid the UI and kept playing. It was then changed to pause on entry, reasoning that a page emitting sound with no visible control is worse than one that stops. Real use showed the opposite: these pages are visited briefly, so pausing splits a single listening session in two, while the cost of continuing is only that the controls are temporarily out of sight. Pausing on hidden routes was therefore removed. The position-preservation problem that motivated the earlier pause no longer applies, because nothing interrupts playback at all.

### Verified in the browser

| Route | Player UI | `<audio>` |
| --- | --- | --- |
| `/zh/settings?returnTo=%2Fzh%2Fdocs` | hidden | present |
| `/en/studio/docs/library` | hidden | present |
| `/en/docs/style-lab` | hidden | present |
| `/zh/docs/import-preview/` | hidden | present |
| `/zh/docs` (control) | shown | present |

**Evidence for the superseded pause policy.** The pause-and-preserve behaviour was verified as a full round trip while that policy was in effect. It is kept as the record of what the earlier version did; it does not describe the current behaviour.

| Step | Path | Player UI | `paused` | `currentTime` |
| --- | --- | --- | --- | --- |
| initial | `/zh` | shown | true | 0 |
| after pressing play | `/zh` | shown | false | 1.95 |
| after entering settings | `/zh/settings` | hidden | true | 2.09 |
| after returning home | `/zh` | shown | true | 2.09 |
| after pressing play again | `/zh` | shown | false | 4.11 |

Entering `/settings` flipped `paused` to true and left `currentTime` at 2.09 rather than 0. Returning home kept that position with playback still paused, and pressing play resumed from 2.09 to 4.11 over a 1.9 s wait — it did not restart the track.

**The current policy was measured in a browser** (2026-09-17). With a track playing on `/zh`, a client-side navigation to `/zh/settings` left playback running:

| Step | Path | Player controls | `<audio>` | `paused` | `currentTime` |
| --- | --- | --- | --- | --- | --- |
| after pressing play | `/zh` | present | 1 | false | 0 → 2.20 over 1.5 s |
| after navigating to settings | `/zh/settings?returnTo=%2Fzh` | absent (`[data-player-interactive]` count 0) | 1 | false | 15.43 → 17.80 over 1.5 s |
| after returning home | `/zh` | present | 1 | false | 32.90 → 35.24 over 1.5 s |

Nothing paused, nothing restarted, and the element count never left one. This table is the evidence for the current policy; the round trip above remains the evidence for the policy it replaced.

The compact title was also inspected in this round. See the correction under "Expand interaction" below: the first reading of that probe was wrong and the title really was interactive.

Test-method note for future rounds: `agent-browser open` clears the element ref table, so a real click must be preceded by a fresh `snapshot` in the same session. A click against a stale ref silently fails with `Unknown ref`, which produces an all-paused reading that looks like a code defect.

## Playback Rate, Long List And Interaction Fixes

### Playback rate

- `PLAYBACK_RATE_OPTIONS` lives in `adapter/player-copy.ts` and cycles `0.5 → 0.8 → 1 → 1.5 → 2`. The requested set was `0.5 / 0.8 / 1.5 / 2`; `1` was added because a cycle without it can never return to normal speed. Removing it is a one-element edit.
- Every option sits inside core's `[MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE]` range, so `playbackRateRequested` accepts all of them and core needed no change.
- Core **rejects** an out-of-range rate instead of clamping it, which is why the option list is the only place that decides what the user can pick. A rate that is not one of the five is simply unreachable.
- Verified: the label reads `1x`, and one click advances it to `1.5x`.
- **The speed now ships locked.** `playbackRateLocked` defaults to `true` in the preference channel, so the speed button is visible but inert until the owner unlocks it under Settings → Plugin → 倍速锁定. The click-through verification above describes the unlocked state, and both states were measured separately on 2026-09-17: locked, a real click leaves the label at `1x`; unlocked, it advances to `1.5x`. This is a deliberate product decision — visitors see a fixed 1x — and it is the reason the lock exists as a preference rather than the button being removed.

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

## Preference Channel

The settings rows and the floating player read the same persisted preferences through one provider, so the row and the player never hold two different copies of the same value.

- Provider: `apps/web/src/components/base/music-player-preferences-provider.tsx`. `AppProviders` mounts it, and `apps/web/src/app/layout.tsx` places that above `MusicPlayerRuntimeMount`, so the settings page and the floating player share one instance.
- Hook: `@/hooks/use-music-player-preferences` throws when it is used outside the provider, so a missing mount fails loudly instead of quietly handing out defaults.
- Storage: `localStorage['incept-music-player-preferences']`, a JSON object, per browser and never synced across devices.

| Preference | Default | Effect when set |
| --- | --- | --- |
| `playbackRateLocked` | `true` | The speed button stays visible but pressing it no longer changes the rate |
| `rememberPlacement` | `true` | Edge, vertical offset and collapsed mode survive a reload |
| `playbackMode` | `'off'` | Applied to core on mount and whenever it changes |

### Reading and writing

- Reads are validated field by field: a value of the wrong type falls back to that field's default, while unparseable JSON or an unavailable `localStorage` falls back to all three. A preference that cannot be read must not stop the player from starting.
- Writes happen in an effect rather than inside the state updater. StrictMode invokes updaters twice and concurrent rendering can read a stale `current`, so a side effect there would write a value the listener never chose.
- `isReady` gates both directions. The first write has to happen after the read, or the defaults would overwrite whatever was already stored; the settings rows use the same flag to stay non-interactive until the stored values are in hand.

### How it reaches the player

- `rememberPlacement` goes into `useFloatingPosition`. While it is off, the player starts from the default position and never writes, but dragging still works for the session: the reset runs only when the switch flips off, not on every placement change. The first version reset on every change, which made the toggle freeze the player in place instead of merely not remembering it.
- Nothing is positioned until the preference layer has read storage. The hook takes `isPreferenceReady` and stays unpositioned until then; otherwise it would paint one frame at the stored position and jump to the default a moment later while the memory is off.
- `playbackRateLocked` is checked inside `handleCycleRate`. The control stays rendered, because the row describes a lock on the button rather than the button's absence.
- `playbackMode` is dispatched as `repeatModeRequested`. The preference is persisted while core's `repeatMode` is session state, so the effect also runs on mount: core starts at `DEFAULT_REPEAT_MODE` (`'off'`, the same value as the preference default), and any other stored mode is applied at startup instead of the settings page showing a mode the player is not using.

### The type boundary

`MusicPlaybackMode` is declared in the provider rather than imported from `@incept/music-player-core`, so the preference layer does not depend on the player core. The two are held together at the one place they meet — `sendIntent({ type: 'repeatModeRequested', mode: playbackMode })` — where a divergence is a type error.

### Verification status

Measured in a browser on 2026-09-17, on `/zh` against the running dev server, with real tracks from the database:

| Claim | Evidence |
| --- | --- |
| The speed ships locked | With the defaults in place, a real click on the speed button left the label at `1x` |
| Unlocking makes the button work | After turning the lock off in settings, the same click advanced the label to `1.5x` |
| The write path works | Storage held `{"playbackRateLocked":true,"rememberPlacement":true,"playbackMode":"off"}` on first load, matching the documented defaults |
| The read path works | After a full reload the lock still read `切换` and the segmented control still showed `单曲` selected |
| The mode reaches core | With `playbackMode: "one"`, seeking to 266 s of a 268 s track replayed the same track from zero instead of advancing the queue — both after the preference changed and after a fresh page load, so the mount-time application works too |
| Placement memory is on by default | A 50 px drag moved `top` from 492 to 442, storage recorded `offsetRatio` 0.8936, and a reload restored 442 |
| Turning memory off returns to the default | With `rememberPlacement: false` the player rendered at the default `top` 492 even though storage still held 0.8936 |
| Dragging still works while the memory is off | With `rememberPlacement: false` a 50 px drag moved `top` 492 → 442 and held it after release; storage was not written; a reload returned to 492 |
| Turning the memory back on resumes remembering | Flipping the switch on wrote the current placement (`offsetRatio` 1), and a reload kept the player where it was |
| The default sits in the bottom-right corner | On a 1258 × 566 viewport the default renders at `top` 492 / `bottom` 546 / `right` 1238 — 20 px from the bottom and the right edge, the same margin the sides use |

The placement figures above were re-measured after the default moved to the corner. The same drag deltas read `342 → 292` in the round before that change, which is where the geometry table under "Interaction And Layout Revision" comes from.

### Default position moved to the bottom-right corner (2026-09-17)

`DEFAULT_FLOATING_PLACEMENT.offsetRatio` was `0.68`, which parked the player around 70 % of the viewport height — visually the middle of the screen rather than a corner. It is now `1`, the lowest position the bottom-anchored range allows. The value is a single number in the hook if it needs to move again.

### Dragging while the memory is off (2026-09-17)

The first version reset the placement inside an effect keyed on the placement itself, so any drag was reverted on release and the toggle effectively disabled moving the player rather than only remembering it. The reset now runs only on the transition where the switch turns off, the write remains disabled while it is off, and turning the switch back on writes the current position so remembering resumes from where the player actually is.

Still open:

- **The rate itself is not persisted**, only the lock. A reload returns the speed to `1x`, which the evidence above shows directly, and it matches the design: there is no default-speed preference.
- **The segmented control's option ids are the only tie to the four modes.** The renderer speaks `string`, so `settings-page-content.tsx` narrows with `value as MusicPlaybackMode`; that cast is unchecked, and `reducePlayerState` stores whatever mode it receives. A typo in a `plugin-schema.ts` option id would therefore compile and reach core unvalidated. The read path in the provider does validate against `PLAYBACK_MODES`, so the two ends are not equally strict.
- **The storage key is not versioned**, unlike the placement key (`incept-music-player:v1:floating-ui`). If the preference shape ever changes, this is the key that will need a migration or a rename.

Note on method: a scripted `element.click()` produces no user activation and the browser rejects `play()`, so every interaction above used real CDP input (`agent-browser click @ref`, `mouse down left` / `mouse up left`). Drags must move in small steps, because the pointer is captured only after the movement threshold and a single large jump leaves the element before capture is taken.

## Settings Plugin Section

A settings section was added so plugin preferences have a home instead of accumulating inside the floating player.

- Section id `plugin`, registered between `account` and `ai`, so the sidebar order is Appearance → Language → Account → Plugin → Model.
- Files: `features/settings/plugin/plugin-schema.ts` is new; `shared/settings-schema.ts` registers it and `shared/settings-types.ts` widens the `id` union.
- The section is `visibility: 'public'`.

### First version: read-only status rows (superseded)

The first version shipped three read-only `status` rows — whether the floating player is enabled, the current speed with a `Pending` badge, and the remembered floating position — on the rule that a value which cannot be configured yet is shown as a status row rather than as a switch that does nothing when clicked. This followed the existing `ai` section, which already ships locked rows, so the shape was an established pattern rather than a new compromise. Its row labels were 悬浮播放器, 默认倍速, 悬浮位置 / Floating player, Default speed, Floating position, and its copy told the reader that the player hides **and pauses** on tool pages — a claim the route-visibility reversal later contradicted, which is one more reason the rows were replaced rather than reworded.

### Current version: three interactive rows

The section now hosts the persisted preferences instead of describing them, so every row is `interactive` and writes to the preference channel.

| Row (zh / en) | Control type | Values |
| --- | --- | --- |
| 倍速锁定 / Speed lock | `plugin-rate-lock-toggle` | 锁定 / 切换 · Locked / Switch |
| 记住悬浮位置 / Remember floating position | `plugin-placement-toggle` | 开启 / 关闭 · On / Off |
| 默认播放模式 / Default playback mode | `plugin-playback-mode-segmented` | 顺序 · 循环 · 单曲 · 随机 / Sequential · Repeat list · Repeat one · Shuffle |

Second-level grouping was added to the renderer for this: `SettingsRow.group` carries a heading, and `settings-renderer.tsx` splits consecutive same-group rows into segments with an `h3` above each. Rows without a `group` keep the previous single-list shape, so the other sections render unchanged. All three rows here carry `group: '音乐播放器' / 'Music player'`.

**Default speed is still not a preference.** What ships is a lock, not a stored default value; the lock and its default are described under "Playback Rate" above.

### Verified in the browser

| Check | Result |
| --- | --- |
| Sidebar order (zh) | 主题 → 语言 → 账户 → 插件 → 模型 |
| Sidebar order (en) | Appearance → Language → Account → Plugin → Model |
| Selected heading | 插件 / Plugin |

The first version's row labels were verified at the time and no longer exist. The current three rows and the grouping heading were verified on 2026-09-17:

| Check | Result |
| --- | --- |
| Section and group headings | `插件` renders, with `音乐播放器` as the second-level heading above the three rows |
| Row states on first load | 倍速锁定 `锁定` checked, 记住悬浮位置 `开启` checked, 默认播放模式 `顺序` selected — all matching the stored defaults |
| Toggling the lock | the switch flips to `切换` / `checked=false`, and `playbackRateLocked` becomes `false` in storage |
| Selecting a mode | `单曲` becomes the selected segment, and `playbackMode` becomes `"one"` in storage |
| After a full reload | the lock still reads `切换` and `单曲` is still selected, so the read path restores both |
| What the values do to the player | recorded under "Preference Channel" below |

The four segmented buttons appear twice in the DOM — the desktop branch and the mobile branch — which is why a selector for them matches eight elements.

Note: a selected section's rows appear twice in the DOM because the desktop branch renders only the selected panel while the mobile branch renders every section; which copy is visible is decided by `lg:block` versus `lg:hidden`. That duplication is pre-existing behaviour for every section, not something this change introduced.

## Next Round

This section is closed. The real music source and storage design was the next discussion at the time; it has since been decided and implemented.

- The decision is recorded in `docs/decisions/en/music-source-storage-and-import.md` and `docs/decisions/zh/music-source-storage-and-import.md`.
- The pipeline landed in `1d77175`: `adapter/music-source.ts` replaced `mock-music-source.ts`, the catalogue arrives from `GET /api/music/tracks`, and `pnpm music:manifest` plus `pnpm music:import` populate the database from `MUSIC_CONTENT_ROOT`.
- The question left open here — whether the default-speed preference becomes a persisted setting — was answered in the opposite direction: what shipped is a speed **lock**, not a persisted default value.

## Verification Closure

Two items were listed as unverified. Both were reviewed by the repository owner in a real browser and passed:

- Light and warm themes render correctly, including the raised-surface play button and the artwork/time circle.
- The mobile layout works: the player is pinned to the bottom edge with safe-area padding, the orb state is absent by design, and the expanded list behaves as a bottom sheet.

With those closed, every acceptance item in the plan is either verified or explicitly deferred. The deferred set is three playback controls moved to Phase 5 and registered as B-16 — `nextRequested`, `previousRequested` and `seekRequested`. `playbackRateRequested` was wired later, when the speed control landed, and `repeatModeRequested` is now driven by the persisted default-playback-mode preference, so neither is part of that set — and the remaining three must not be described as delivered.

### Version control note

`apps/web/public/mock/audio/` is ignored. The three WAV files are deterministic output of `scripts/music-mock-audio.mjs`, so the generator is committed instead of the artefacts.

They are development fixtures only. The player reads the database, not these files, so a fresh clone does not need them in order to run. What populates the player is `pnpm music:manifest` followed by `pnpm music:import` against a real `MUSIC_CONTENT_ROOT`.

## Driving The Player From A Script

Verifying the floating player through `agent-browser` has three traps. Each one cost a failed attempt; they are recorded here so the next attempt starts further along.

1. **`mouse down` needs an explicit `left`.** The default button is not the left one, and the drag handler returns immediately when `event.button !== 0`. The outcome is a silent no-op: nothing moves, nothing is logged. Use `mouse down left` and `mouse up left`.
2. **`left` is not a valid "did it move" indicator.** The drop snaps to the nearest horizontal edge, so a drag that ends right of the viewport centre snaps back to `left: 886` even though the drag worked. Read `top` instead: the vertical offset is continuous and does reflect the drag.
3. **Move in small steps.** The drag captures the pointer only after the movement threshold is crossed, and before capture `pointermove` goes to whatever element sits under the pointer. A single large jump ends outside the element, so the threshold is never crossed and the drag never starts.

Also: open the page before writing to `localStorage`. An `eval` issued before `open` has no page to run against, and with `&&` chaining that aborts the whole sequence without a useful message.

**Known limitation behind trap 3.** Because capture happens only after the threshold, grabbing close to the element's edge combined with a fast flick can leave the element before capture is taken, and the drag will not start. Real pointer movement is continuous, so this is rare in practice — but it is the same mechanism that makes synthetic drags flaky, and it is why an automated drag test here passed once and then failed on an identical repeat.
