[2026-05-10 16:18] - Update by AI完成改动:
- 为 docs 正文系统补齐了 Block V1 的第一批渲染类型：
- `paragraph`
- `list`
- `callout`
- `heading`
- `quote`
- `code`
- `divider`
- 在 `document-shells` collection 内新增了一篇临时试验文章 `block-v1-regression-lab`，作为真实 `series` 路由下的 block 样式测试页。
- 当前策略为“先在真实文档壳层内锁定 UI 与阅读节奏，再继续推进 create 与 snapshot”。

本轮主要改动:
- `apps/web/src/features/docs/shared/types.ts`
  - 扩展 `DocsContentBlockModel`，加入 `heading / quote / code / divider`
- `packages/db/src/docs/types.ts`
  - 扩展 DB 侧 `DbDocsSectionBlock`，与 web block union 保持一致
- `apps/web/src/features/docs/shared/components/docs-article-body.tsx`
  - 新增 4 类 block renderer
  - 保持现有正文 shell 结构不变，仅补阅读侧 block 样式
- `packages/db/prisma/seed.ts`
  - 新增 `blockV1RegressionBody`
  - 新增文档 `block-v1-regression-lab`
  - 将该文章接入 `document-shells` collection 末尾

当前建议验证:
- 先执行 `pnpm db:seed`
- 打开：
- `/en/docs/series/document-shells/block-v1-regression-lab`
- 重点观察：
- heading 与 section title 的层级关系
- quote 与 callout 的区分度
- code block 的基础视觉语言
- divider 在长文中的节奏是否过重
- block 混排时的上下间距是否稳定

遗留问题:
- 这一轮只锁“阅读侧 block 样式”，尚未进入 block 拼接规则、snapshot、create、AI 编辑等后续阶段。
- `block-v1-regression-lab` 当前是临时试验文章，后续可删除、重写或替换。
- 我这边没有在当前会话里完成本地运行验证，下一步需要你用真实页面逐条把关。

Commit 建议: feat: add docs block v1 renderers and seed-based regression article
