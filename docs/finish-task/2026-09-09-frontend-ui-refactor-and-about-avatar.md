# Frontend UI Refactor And About Avatar

## Status

Implemented in the working tree on branch `refactor/frontend-ui`. The changes are ready to review and for a proposed Git commit; they have not been committed yet.

## Scope

This task records the current UI refinement pass across Docs, Notes, Docs article reading pages, and the About page:

- Docs and Notes home pages now share a restrained narrow-column layout with clearer hierarchy, compact article rows, aligned year/count labels, and expandable row details.
- The article-row disclosure control uses a right-pointing chevron (`›`) and keeps the details area borderless. The tag rendering location is reserved for the future tag system and marked with TODO comments; no tag data model was introduced.
- Article summaries and the introductory sentence about recording ongoing thoughts, experiments, and practice remain removed from the home presentation to keep the list concise.
- Docs reference shells expose a layout modifier for `sidebar` and `contentOnly`. Collection and standalone article pages remain in the same grid coordinate system so their article content and `On this page` rail can share stable anchors. The shared content container has no horizontal transform or padding offset.
- About keeps its body in the independent unlisted Docs document (`documentKey: about`) loaded through the existing Owner page flow. The page sections, hero, and activity link use the Docs content width for a common left edge.
- About's initial identity avatar test uses `apps/web/public/images/about/avatar-test.jpg`, sourced from the second supplied reference image and rendered as a circular `next/image` asset with localized alternative text.
- Notes and Docs UI labels added in this pass use the existing `next-intl` message structure for Chinese and English locales.

## Main files

- `apps/web/src/features/docs/home/index.tsx`
- `apps/web/src/features/docs/home/components/docs-home-intro.tsx`
- `apps/web/src/features/docs/home/components/docs-home-group-section.tsx`
- `apps/web/src/features/docs/home/components/docs-home-list-item.tsx`
- `apps/web/src/features/notes/index.tsx`
- `apps/web/src/components/layouts/containers/docs-reference-shell.tsx`
- `apps/web/src/styles/layout.css`
- `apps/web/src/features/about/index.tsx`
- `apps/web/src/messages/zh/{about,docs,notes}.json`
- `apps/web/src/messages/en/{about,docs,notes}.json`
- `apps/web/public/images/about/avatar-test.jpg`

## Content and routing constraints

- Hidden navigation and internal surfaces remain hidden; this task does not restore routes to the public navigation.
- About content remains independently published through Docs push and stays unlisted. It is not copied into message JSON or a fixed page component.
- Article data, routes, collection sidebar content, and outline data are unchanged.

## Verification

Passed:

- `git diff --check`
- Turbopack compilation during `pnpm --filter web build`

Environment limitations:

- The build later failed during the Windows TypeScript phase with `spawn EPERM` after compilation completed.
- The web lint command is currently unavailable because ESLint 9 cannot find `eslint.config.js` in the existing repository setup.
- Direct `tsc` invocation could not resolve the TypeScript binary in the current dependency environment.

## Follow-up checks

- Review the Docs standalone and collection routes at desktop, tablet, and mobile widths and compare article start positions and `On this page` anchors visually.
- Replace the temporary avatar asset when the final profile image is selected.
- Replace the temporary `eyebrow` tag fallback after the tag system is implemented.

## Commit proposal

`refactor(web): align docs notes and about surfaces`

[2026-09-09 16:57] - Update by AI完成改动:
- 修改了 About 首屏身份区，接入第二张参考图作为临时头像资源，并补充中英文 `identity.avatarAlt` 文案；About 继续通过 unlisted Docs 文档提供正文。
- 修改了 Docs/Notes 列表、Docs 阅读壳层及共享布局样式，保留隐藏导航与独立页面路由，单篇与 collection 文章继续使用可区分的布局语义。
- 遗留问题: 需要在真实 Docs 单篇/collection 路由及桌面、平板、移动视口完成视觉对齐验收；构建 TypeScript 阶段受 Windows `spawn EPERM` 影响，lint 受仓库缺少 ESLint 9 flat config 影响。
- Commit 建议: `refactor(web): align docs notes and about surfaces`

[2026-09-09 16:55] - Update by AI完成改动:
- 修改了 Docs、Notes、Docs 阅读壳层与 About 容器的布局和层级，实现共享坐标、局部可回滚的视觉实验、展开行接口和 About 头像测试图。
- 遗留问题: 仍需在真实路由和多个视口下进行视觉验收；构建 TypeScript 阶段受 Windows `spawn EPERM` 影响，lint 受仓库 ESLint 配置缺失影响。
- Commit 建议: `refactor(web): align docs notes and about surfaces`

[2026-09-09 16:58] - Update by AI完成改动:
- 修改了 About 首屏身份区，接入第二张参考图作为临时头像资源，并补充中英文 `identity.avatarAlt` 文案；About 继续通过 unlisted Docs 文档提供正文。
- 修改了 Docs/Notes 列表、Docs 阅读壳层及共享布局样式，保留隐藏导航与独立页面路由，单篇与 collection 文章继续使用可区分的布局语义。
- 遗留问题: 需要在真实 Docs 单篇/collection 路由及桌面、平板、移动视口完成视觉对齐验收；构建 TypeScript 阶段受 Windows `spawn EPERM` 影响，lint 受仓库缺少 ESLint 9 flat config 影响。
- Commit 建议: `refactor(web): align docs notes and about surfaces`

## Archive Note

Archived to `finish-task/` on 2026-09-10. The work described above was committed as `0edc55d refactor(web): align docs notes and about surfaces` and merged into `main` through PR #1 (`1e6be8c`), so the "not been committed yet" status no longer applies. The follow-up visual alignment review, the temporary avatar replacement, and the `eyebrow` tag fallback replacement remain open; the tag contract placeholder is now tracked as B-15.
