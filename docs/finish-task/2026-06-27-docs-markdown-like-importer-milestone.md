[2026-06-27] - Update by AI

阶段结论:
- docs importer 已从 TypeScript / JSON-like 手写源，推进到 Markdown-like 写作层。
- 当前 `.docs.md` 可以作为第一阶段正式文章输入格式。
- importer 仍保持单一标准合同：
  - `.docs.md`
  - `-> markdown-like parser`
  - `-> DocsImportArticleSource`
  - `-> validation`
  - `-> draft`
  - `-> preview`
  - `-> confirm import`
- docs 系统已经接近“初步可用”状态，剩余最关键闭环是文章删除 / 归档。

本轮完成内容:
- 新增 Markdown-like parser:
  - `apps/web/src/features/docs/importer/parsers/markdown-like/`
- `source-loader.ts` 已支持按文件类型分流:
  - `.ts` 继续动态 import `DocsImportArticleSource`
  - `.md` / `.docs.md` 走 markdown-like parser
- `create-draft.ts` 已合并 parser issues 与 validation issues，统一在 dry-run / preview 阶段展示。
- 新增 Markdown-like 示例文章:
  - `apps/web/src/features/docs/importer/docs-push/example-first-mapping/docs-page-example-single.docs.md`
- 新增 Markdown-like 写作规则文档:
  - `docs/decisions/zh/docs-authoring-markdown-like-rules.md`
  - `docs/decisions/zh/docs-markdown-like-authoring-syntax.md`
- 修复 parser 自动 block id 生成问题:
  - 原规则过度依赖英文 slug，中文内容会被清空，导致重复 id。
  - 新规则改为 `sectionId + blockType + blockIndex + readableSuffix`。

当前已支持的 `.docs.md` 能力:
- frontmatter:
  - `locale`
  - `slug`
  - `title`
  - `summary`
  - `eyebrow`
  - `seoTitle`
  - `seoDescription`
  - `publishedAt`
  - `kind`
  - `layoutMode`
  - `accessRole`
  - `routeType`
- block:
  - section
  - heading
  - paragraph
  - list
  - checklist
  - callout
  - quote
  - divider
  - code
  - image
- paragraph inline:
  - text
  - link
  - mark
  - delete
  - inlineCode

当前明确限制:
- Markdown-like v1 只支持 `singleArticle`。
- collection article 仍使用现有 TypeScript 模板。
- `.docs.md` 的语法关键字必须使用英文受控值，正文内容可以是中文或英文。
- 当前不支持:
  - `documentKey`
  - collection authoring
  - hidden article 独立模块
  - heading variant attributes
  - list / checklist emphasis attributes
  - quote attribution
  - table
  - video / embed block
  - 图片相对路径自动发布
  - 原始 HTML
  - bold / italic inline

当前图片与媒体规则:
- parser 只会把 Markdown 图片语法中的 `src` 写入 image block。
- 当前不会自动复制 `docs-image/` 内的图片，也不会自动上传或发布媒体资源。
- 第一阶段建议 `.docs.md` 中使用最终可访问路径:
  - `/images/docs/{article-slug}/cover.png`
- 计划中的原始内容结构:
  - `docs/日期/*.docs.md`
  - `docs-image/日期/{article-slug}/*`
- 后续需要新增 media publish pipeline，才能稳定支持相对路径图片。

当前导入 / 修改流程:
- dry-run:
  - `pnpm docs:import --file path/to/article.docs.md --dry-run`
- 生成 preview draft:
  - `pnpm docs:import --file path/to/article.docs.md`
- 修改已有文章:
  - `pnpm docs:import --file path/to/article.docs.md --replace`
- confirm import 后才真正写入数据库。
- `--replace` 当前按 `locale + slug` 查找已有文章，并替换对应 locale 的内容。

当前已验证:
- TypeScript 检查通过:
  - `pnpm --filter web exec tsc --noEmit`
- Markdown-like 示例 dry-run 通过:
  - `pnpm docs:import --file apps/web/src/features/docs/importer/docs-push/example-first-mapping/docs-page-example-single.docs.md --dry-run`
- 第一篇真实中文测试文章 dry-run 通过:
  - `pnpm docs:import --file apps/web/src/features/docs/importer/docs-push/docs/2026-06-27/first-real-single.docs.md --dry-run`

当前关键文件位置:
- Markdown-like parser:
  - `apps/web/src/features/docs/importer/parsers/markdown-like/`
- importer 入口:
  - `apps/web/src/features/docs/importer/source-loader.ts`
  - `apps/web/src/features/docs/importer/create-draft.ts`
- CLI:
  - `scripts/docs-import.mjs`
- DB 写入:
  - `packages/db/src/docs/import.ts`
- confirm import:
  - `apps/web/src/app/[locale]/docs/import-preview/[draftId]/confirm/route.ts`
- block system:
  - `apps/web/src/features/docs/block-system/schema/docs-block-types.ts`
  - `apps/web/src/features/docs/block-system/presets/docs-block-presets.ts`
  - `apps/web/src/features/docs/block-system/examples/docs-block-style-lab-page.ts`

当前重要架构判断:
- `/en/docs` 与 `/zh/docs` 目前是按 locale 独立展示的 docs 界面。
- 当前系统还没有 `documentKey`，所以英文文章和中文文章不会自动被识别为同一篇文档的两个语言版本。
- 现在只能通过人为保持相同 slug 来形成约定式对应:
  - `/en/docs/my-article`
  - `/zh/docs/my-article`
- 后续如果需要语言切换、缺失语言 fallback、双语覆盖率统计，需要新增 `documentKey`。

当前最重要遗留问题:
- 文章删除 / 归档尚未形成正式入口。
- 当前已有文章修改通过 `--replace` 解决，但删除文章仍需补 CLI 或管理入口。
- 推荐优先实现 archive，而不是物理删除:
  - `DocsDocumentLocale.status -> archived`
- 查询层需要确认:
  - archived 不出现在 docs 首页 / 列表
  - archived 直接访问返回 not found

下一阶段建议:
- P0: 补文章归档 / 删除能力。
  - 建议新增 `pnpm docs:archive --locale zh --slug only-test`
  - 第一版只修改 locale 行状态为 `archived`
- P1: 补 `documentKey`。
  - 用于绑定同一篇文档的不同 locale 版本
  - 支持双语切换与覆盖率统计
- P1: 做全站 i18n 覆盖率清理。
  - 当前中文 locale 下仍存在大量英文 UI 文案
  - 需要区分产品文案、docs 内容、内部工具文案
- P2: 完善 Markdown-like style coverage。
  - heading attributes
  - list / checklist emphasis
  - quote attribution
- P2: 设计 media publish pipeline。
  - 支持 `docs-image/` 原始资产发布到 public/CDN URL

Commit 建议:
- `docs: record markdown-like importer milestone`

