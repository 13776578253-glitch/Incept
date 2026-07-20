[2026-05-13 22:10] - Update by AI完成改动:
- docs block v1 的阅读侧基线已经基本锁定，当前可稳定进入下一阶段开发。
- paragraph inline 体系已从单纯文本扩展为：
  - `text`
  - `link`
  - `delete`
  - `mark`
  - `inlineCode`
- standalone block 体系当前已覆盖：
  - `heading`
  - `paragraph`
  - `list`
  - `checklist`
  - `callout`
  - `quote`
  - `divider`
  - `code`
  - `image`

本轮完成内容:
- 将 docs block system 从 `shared/components` 中拆出，形成 `features/docs/block-system` 独立规则层。
- 在 `features/docs/shared/renderers` 下建立 block renderer 层，让页面拼装和 block UI 解耦。
- 建立 `/[locale]/docs/style-lab` 作为接近真实 docs 外壳的 block 样式验证面。
- 完成 paragraph 统一正文列宽收口，避免不同 paragraph block 自带宽度导致的换行漂移。
- 完成 list / checklist / callout / quote / divider / code / image 的第一轮可视化验证。
- 完成 paragraph inline 能力第一轮接入：
  - link
  - delete line
  - mark
  - inline code

当前已锁定的结构规则:
- docs 阅读结构继续保持：
  - `page -> sections[] -> blocks[]`
- section title 继续属于页面结构，不并入 block。
- `heading block` 继续只作为 section 内部的正文级标题。
- `image` 是 standalone block，不进入 paragraph inline。
- `link` / `delete` / `mark` / `inlineCode` 是 paragraph inline，不单独升成 block。
- 当前 block system 只服务：
  - docs 阅读演示
  - create 界面未来选型
  - AI 在 create 内的格式选择依据

当前关键文件位置:
- `apps/web/src/features/docs/block-system/`
  - `schema/`
  - `presets/`
  - `catalog/`
  - `examples/`
- `apps/web/src/features/docs/shared/renderers/`
  - `docs-block-renderer.tsx`
  - `blocks/*`
- `apps/web/src/features/docs/shared/components/docs-article-body.tsx`
  - 现在只负责 article / section / block 拼装
- `apps/web/src/app/[locale]/docs/style-lab/page.tsx`
  - 当前 block 样式实验入口

当前推荐作为基线的验证页面:
- `/en/docs/style-lab`
  - 用于逐条 review block 与 inline 样式
- `/en/docs/series/document-shells/*`
  - 用于确认真实 docs 壳层下的阅读节奏

当前遗留问题:
- code block 目前只完成容器样式与阅读体验第一版，未接 syntax highlighting。
- image block 目前主要还是占位图与壳层验证，后续需要接真实截图 / 真实照片再看最终节奏。
- block system 目前还未进入 create 交互层，也未接快照系统。
- inline 体系暂时不继续扩张，先以现有 5 类稳定为主。

下一阶段建议:
- 进入 docs create 第一阶段设计。
- 优先明确：
  - create 页面结构
  - block 插入与排序逻辑
  - create 侧如何消费 `block-system/catalog`
- 在 create 之前，可先补一份“block create contract / payload contract”文档，减少后续返工。

Commit 建议: docs: record docs block v1 reading baseline and inline contract
