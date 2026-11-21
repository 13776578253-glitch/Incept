# Docs 模块收敛重构与交接文档（第一档 + 第二档完成 / 第三档预留交接）

日期：2026-11-15。范围：`packages/db/src/docs`、`apps/web/src/features/docs`、`apps/web/src/server/docs`。

## 1. 背景与第一性原理结论

Docs 子系统经过「前端纯样式渲染 $\rightarrow$ 类 JSON 结构 $\rightarrow$ 类 Markdown 解析器 $\rightarrow$ `.docs.md` 写作格式」四阶段演进后，主干实际已稳定收敛为一条清晰的三段式编译流水线：

```text
.docs.md（常规写作）──► parseMarkdownLikeDocument ──┐
.ts（高级导入入口） ───► loadTsDocsImportSource    ──┴─► sections/blocks（JSON IR / DB）──► DocsArticleBody
                                                                                             └─► DocsBlockRenderer
```

按第一性原理判断：**主干流水线与 JSON 中间层职责清晰、解耦合理，无需做架构重写或数据库迁移**。本轮只解决演进过程中留下的两类实际问题：
1. **第一档（物理降噪）**：清除已退役路线残留的空目录、死类型、重复导出、模糊注释与过期模板说明。
2. **第二档（契约收拢）**：将原本手写三遍的正文块类型与手写两遍的校验白名单收拢为单一事实源，消除同步遗漏风险，为后续第三档功能扩展（如 B-05 公式与表格）铺平最小改动路径。

---

## 2. 本轮已完成改动（第一阶段：小步重构基线）

### 2.1 第一档：物理降噪与过期标记清理

| 类别 | 目标路径 | 改动内容 |
| --- | --- | --- |
| 删除 4 处空目录树 | `apps/web/src/features/docs/admin/`（含 `components/`）<br>`apps/web/src/features/docs/archive/`<br>`apps/web/src/features/docs/block-system/examples/`<br>`apps/web/src/features/docs/block-system/__fixtures__/` | 经核实内部均为 0 文件的历史遗留空壳，直接移除。 |
| 清理死类型与模糊注释 | `apps/web/src/features/docs/block-system/schema/docs-block-types.ts`<br>`apps/web/src/features/docs/block-system/presets/docs-block-presets.ts` | 1. 移除无人使用的死类型 `DocsParagraphWidth`。<br>2. 移除 `docs-block-presets.ts` 顶部的无意义注释 `// 待修改`。 |
| 清理重复/无用导出 | `apps/web/src/features/docs/shared/types.ts` | 1. 将 `DocsContentBlockModel` 并入文件顶部的 `@/features/docs/block-system/schema` 转发块，删除文件第 44–45 行的重复导出。<br>2. 移除未使用的 `DocsBlockCatalogItem` 转发（`catalog/` 按 B-09 继续作为静态参考保留，运行时零引用）。 |
| 修正过期说明文档 | `apps/web/src/features/docs/importer/docs-push/example-first-mapping/README.md`<br>`apps/web/src/features/docs/importer/docs-push/README.md` | 1. 在 `example-first-mapping/README.md` 中指明 `.docs.md` 为常规写作格式、将错误的 `.../example/...` CLI 路径修正为 `.../example-first-mapping/...`，并将已退役 `style-lab` 描述替换为 `block-system/schema` 与 `/{locale}/docs/import-preview/{draftId}`。<br>2. 对齐 `docs-push/README.md` 第 371 行中文合集目录命令说明，与英文第 148 行语义一致（非 `--dry-run` 时会创建批量草稿并输出预览 URL，仍需 Owner 确认后发布）。 |

### 2.2 第二档：单一正文块契约与校验白名单收拢

| 层面 | 目标路径 | 改动内容 |
| --- | --- | --- |
| 存储契约唯一事实源 | `packages/db/src/docs/types.ts`<br>`packages/db/src/docs/index.ts` | 提取 `DbDocsInlineContent` 联合类型并在 `packages/db/src/docs/index.ts` 导出；`DbDocsSectionBlock` 的 `paragraph.content` 直接引用 `DbDocsInlineContent[]`。保留原 `// history:` 注释以匹配 `docs/BACKLOG.md` 登记。 |
| 前端块模型派生 | `apps/web/src/features/docs/block-system/schema/docs-block-types.ts` | 改为从 `@incept/db/docs` 导入 `DbDocsInlineContent` 与 `DbDocsSectionBlock`，令 `DocsContentBlockModel = DbDocsSectionBlock`、`DocsBlockType = DbDocsSectionBlock['type']`，并用 `Extract` / `NonNullable` 派生所有子块模型、行内模型与变体联合类型。所有原有导出类型名 100% 保持不变。保留第 1 行 `// history:` 注释。 |
| 服务端映射去强转 | `apps/web/src/server/docs/mappers.ts` | `toDocsContentBlocks` 直接 `return blocks;`，移除 `as DocsContentBlockModel[]` 类型断言。 |
| 解析器块模型派生 | `apps/web/src/features/docs/importer/parsers/markdown-like/document/types.ts` | 新增 `WithParserLine<TBlock, TOverrides>` 辅助类型，从 `../../../../block-system/schema` 派生 `MarkdownLikeInline` 与 9 种 `MarkdownLike*Block`，保留 `line: number` 源码行号以及解析器侧的收窄约束（如 heading `level: 2 \| 3 \| 4`、必填 `variant`/`spacing`/`listStyle`、quote 不含 `attribution`）。`conversion/single-article.ts` 剥离 `line` 后天然满足 `DocsContentBlockModel`。 |
| 校验与语法白名单统一 | `apps/web/src/features/docs/importer/parsers/markdown-like/syntax.ts`<br>`apps/web/src/features/docs/importer/validation.ts` | 1. `syntax.ts` 通过相对路径 `../../../block-system/presets` 导入 `docsCalloutTones`、`docsCalloutVariants`、`docsCodeVariants`、`docsDividerVariants`、`docsParagraphSpacings`、`docsParagraphVariants`，直接生成运行时校验 `Set<string>`。<br>2. `validation.ts` 复用 `markdownLikeAllowedFrontmatterKeys` 作为 `allowedMetaKeys`，移除原有的 20 字段重复 `Set` 与 `// 待对齐` 注释。 |

---

## 3. 第二阶段交接指南：第三档功能扩展预留（供 GPT 推进 B-05 公式/表格及 B-03/B-04）

完成契约收拢后，后续扩展新块（如 **B-05 表格 `table`、独立公式 `equation`**）、扩展行内语法（如 **`inlineMath`**）或完善 **B-03 / B-04**，只需按以下固定 4 步推进，无需改动草稿外壳、确认发布流程、Prisma schema 或页面路由：

### 3.1 四步最小扩展路径

1. **步骤 1：扩展唯一存储契约与派生类型**
   - 在 `packages/db/src/docs/types.ts` 的 `DbDocsInlineContent` 中新增行内节点（例如 `{ type: 'inlineMath'; tex: string }`），在 `DbDocsSectionBlock` 中新增块节点（例如 `equation`、`table`）。
   - 在 `apps/web/src/features/docs/block-system/schema/docs-block-types.ts` 中通过 `Extract<...>` 导出对应前端别名（同步检查 `apps/web/src/features/docs/shared/types.ts` 是否需要透传）。
   - 在 `apps/web/src/features/docs/importer/parsers/markdown-like/document/types.ts` 中用 `WithParserLine<...>` 派生解析器块类型并并入 `MarkdownLikeBlock`（注：`MarkdownLikeInline` 已自动继承除 `link` 外的所有 `DocsParagraphInlineModel` 分支）。
   - 若新块带可枚举变体/选项，优先加入 `apps/web/src/features/docs/block-system/presets/docs-block-presets.ts`，再由 `syntax.ts` 构造 `Set`。

2. **步骤 2：放开解析分发与行号诊断**
   - 在 `apps/web/src/features/docs/importer/parsers/markdown-like/document/index.ts` 的 `parseMarkdownLikeBody`（目前约第 59–69 行存在表格 `unsupported_syntax` 拦截）与 `blocks/index.ts` 的 `isMarkdownLikeParagraphBoundary` 中加入新块（如 `$$` 公式块、`|...|` 表格块）边界识别与解析器。
   - 在 `apps/web/src/features/docs/importer/parsers/markdown-like/document/inline.ts` 中补充行内公式解析，若需在列表/引用/标题内支持行内节点，注意同时评估旧 JSON 文章字符串字段的向后兼容。
   - 未闭合围栏、重复公式编号、表格列数不一致等校验继续复用 `addMarkdownLikeIssue`，保留源文件 `line` 行号诊断。

3. **步骤 3：补齐阅读统计穷尽分支**
   - 在 `packages/db/src/docs/reading-stats.ts` 的 `getBlockText` 与 `getParagraphText` 中补齐新块与新行内节点的纯文本提取；由于类型系统已收拢，`switch (block.type)` 的 TypeScript 检查会直接提示遗漏分支。

4. **步骤 4：接入渲染组件与样式**
   - 将 `apps/web/src/features/docs/shared/renderers/blocks/docs-paragraph-block.tsx` 中的 `renderInlineContentItem` 抽离为共享行内渲染器，供段落、表格单元格及后续接入行内渲染的块共用。
   - 在 `apps/web/src/features/docs/shared/renderers/blocks/` 下新增块组件，并在 `apps/web/src/features/docs/shared/renderers/docs-block-renderer.tsx` 的 `DocsBlockRenderer` `switch (block.type)` 中挂接渲染分支；同步更新 `apps/web/src/features/docs/importer/parsers/markdown-like/fixtures/` 正反例与 `docs-push/README.md`。

### 3.2 必须遵守的工程红线

- **Importer 运行时相对路径约束**：`pnpm docs:check-markdown-like` 与 `pnpm docs:import` 是通过 `pnpm --filter @incept/db exec tsx ../../scripts/...` 在 `packages/db` 工作目录下运行的。因此 `apps/web/src/features/docs/importer/` 下的任何**运行时（非 `import type`）跨目录引用**必须使用相对路径（如 `../../../block-system/presets`），禁止使用 `@/` 路径别名，否则 `tsx` 运行时会因找不到 Web tsconfig 别名而报错。
- **保留历史登记注释**：`packages/db/src/docs/types.ts` 与 `apps/web/src/features/docs/block-system/schema/docs-block-types.ts` 顶部的 `// history:` 注释已在 `docs/BACKLOG.md` 登记，未完成对应功能闭环前请勿擅自删除（如 B-05 完成表格支持后再更新相关说明）。
- **`catalog/` 决策边界**：`apps/web/src/features/docs/block-system/catalog/docs-block-catalog.ts` 若未来扩展新块时仍无块编辑器消费者，可根据 `docs/BACKLOG.md` B-09 决定是否同步补条目或单独评估清理。

---

## 4. 本轮验证记录

| 检查项 | 命令 | 结果与范围说明 |
| --- | --- | --- |
| Markdown-like 解析回归 | `pnpm docs:check-markdown-like` | **通过**：输出 `Markdown-like parser fixtures passed.` |
| 媒体路径解析检查 | `pnpm docs:check-media` | **通过**：输出 `Docs media checks passed.` |
| 代码高亮检查 | `pnpm docs:check-code-highlighting` | **通过**：输出 `Docs code highlighting checks passed.` |
| 全仓类型检查 | `pnpm typecheck` | **通过**：`web`、`@incept/music`、`@incept/db`、`@incept/roadmap`、`@incept/dashboard`、`@incept/sync-agent`、`@incept/sync-gateway`、`scripts/tsconfig.json` 全部零错误。 |
| Docs 定向单测 + 认证单测 | `pnpm --filter web exec vitest run src/features/docs src/server/docs src/features/settings/docs src/server/settings/__tests__/docs.test.ts src/server/auth/__tests__/owner-security.test.ts` | **通过**：8 个测试文件 / 26 项用例全部通过。 |
| 全量 Web 单测对照 | `pnpm --filter web test`（前后两次运行） | 33 个非跳过文件（144 项）通过；5 个 DB/同步集成测试文件（55 项）因缺少测试数据库/同步环境按预期跳过；非本次改动范围的 `src/server/auth/__tests__/owner-security.test.ts`（单测内含 7 次密码 KDF 调用）在 39 文件并发时两次触发 Vitest 默认 5000ms 超时（5043ms / 5032ms），单独或小范围运行时以 1344ms 通过。 |
| 导入 CLI 冒烟检查 | `pnpm docs:check-import-cli` | `--file ... --dry-run` 单文章草稿校验通过；`--dir ... --dry-run` 阶段调用 `previewDocsCollectionDirectory` 查询本地 PostgreSQL（`127.0.0.1:15432`），受限于沙箱未连接本地数据库而失败（`Can't reach database server at 127.0.0.1:15432`），需在连接本地数据库环境后补验目录预览。 |
