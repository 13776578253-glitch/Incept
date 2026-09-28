# Frontend Style Optimization (`feature/style`)

## Scope

1. **Design Token Completion & B-29 Arbitrary Value Migration**
   - Added missing `--color-surface` and `--color-accent` definitions in `apps/web/src/styles/theme.css` across `:root`, `.dark`, and `html[data-eye-comfort-filter='warm']:not(.dark)`.
   - Added semantic border, surface, text, callout, and shadow tokens in `apps/web/src/styles/tokens.css` and `apps/web/src/styles/theme.css`.
   - Replaced all comma-bearing `color-mix(...)` and `rgba(...)` Tailwind arbitrary value utilities across `about`, `home`, `docs/home`, `docs/admin`, `docs/import-preview`, `docs/article`, and `docs/shared/renderers/blocks` with comma-free `var(--...)` token references, closing `B-29` in `docs/BACKLOG.md`.
   - Added explicit `bg-[var(--color-bg)]` to filter `<select>` and `<input>` controls in `docs-library-table.tsx` so native dropdown popups remain legible in dark mode on Windows.

2. **Header, Home, Settings, and Docs/Notes Surface Alignment**
   - Added `backdrop-blur-md` to the sticky `SiteHeader` and unified the Settings link and Theme toggle button hit targets (`size-9 rounded-full`).
   - Replaced the fixed `justify-center gap-150` (`600px`) flex gap in `docs-home-group-section.tsx` with `items-baseline justify-between gap-4 px-1` so year headings and entry counts align cleanly with article rows without overflowing narrow viewports.
   - Aligned `HomeBlogList` container width (`max-w-[920px]`), responsive left offset (`xl:pl-12 2xl:pl-22`), and negative row margins (`-mx-3 md:-mx-4`) with `HomeHero` and `HomeBottomSection`.
   - Aligned `.page-shell-settings-sidebar` top offset (`calc(var(--navbar-height) + 32px)`) with `.page-shell-settings` top padding in `apps/web/src/styles/layout.css`.

## Verification

- `pnpm typecheck`: passed across all 4 workspace packages (`@incept/music-player-core`, `@incept/db`, `@incept/music`, `web`).
- `pnpm test`: passed (`@incept/music-player-core`, `@incept/db`, `@incept/music`, and `web` Vitest suites).
- `pnpm lint`: blocked by pre-existing missing `eslint.config.js` in `apps/web` (ESLint 9).

## Commit Summary

[2026-09-25 18:00] - Update by AI完成改动:
- 修改了 `tokens.css`、`theme.css`、`layout.css` 及 `about`、`home`、`docs`、`site-header` 相关组件逻辑，实现了设计 Token 补齐（`--color-surface`、`--color-accent` 等）、全站 B-29 含逗号任意值样式收敛、顶栏毛玻璃与按钮热区统一、Home 与 Docs/Notes 列表对齐修复。
- 遗留问题: `pnpm lint` 仍受仓库既有缺少 ESLint 9 `eslint.config.js` 影响；真实浏览器多视口视觉回归留待主控合入后复核。
- Commit 建议: `refactor(web): complete design tokens and resolve B-29 arbitrary value styles` / `fix(web): align header, home, and docs/notes list surfaces`
