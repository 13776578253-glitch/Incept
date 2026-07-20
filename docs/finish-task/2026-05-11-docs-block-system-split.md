[2026-05-11 00:26] - Update by AI完成改动:
- 在 `features/docs` 内新增了 `block-system` 目录，用于承接 docs 演示与 create 共用的 block 规则层。
- 将 block 的 schema、preset、catalog、example 从 `shared/components` 中抽离，避免 `docs-article-body.tsx` 同时承担内容定义、样式依据和阅读端渲染三层职责。
- 在 `features/docs/shared` 下新增 `renderers` 层，让 block 的具体 UI 实现与页面拼装逻辑分离。
- 新增 `/[locale]/docs/style-lab` 路由，作为格式目录测试页，用于并行服务 docs 演示和后续 create / AI 的样式依据验证。

本轮主要结构变化:
- `apps/web/src/features/docs/block-system/`
  - `schema/`
  - `presets/`
  - `catalog/`
  - `examples/`
- `apps/web/src/features/docs/shared/renderers/`
  - `docs-block-renderer.tsx`
  - `blocks/*`
- `apps/web/src/features/docs/shared/components/docs-article-body.tsx`
  - 现在仅负责 article / section / block 的拼装
- `apps/web/src/app/[locale]/docs/style-lab/page.tsx`
  - 新增格式测试页入口

当前建议验证:
- 打开 `/en/docs/style-lab`
- 重点看：
- heading 的 level 与 variant 是否区分清晰
- paragraph / list / callout / quote / code / divider 是否都能在同一测试页被直观看出差异
- `style-lab` 是否已经足够作为 create 与 AI 的格式对照页
- 再打开 `/en/docs/series/document-shells/block-v1-regression-lab`
- 对比真实文章壳层下的阅读节奏是否和 style-lab 中看到的样式一致

遗留问题:
- 这一步只完成“规则层 + renderer 层 + 测试页”的分层，不包含 create 交互。
- block system 目前只覆盖文字类 block，后续媒体和交互块仍需单独扩展。
- 我这边没有在当前会话里完成本地运行验证，下一步需要你直接在页面上逐条把关样式与结构。

Commit 建议: refactor: split docs block system from article body rendering
