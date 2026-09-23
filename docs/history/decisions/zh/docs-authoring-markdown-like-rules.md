# Docs Authoring: Markdown-like Rules (Superseded Plan)

> **Archived on 2026-09-23.** This is a planning draft, kept for history only.
> It was superseded by [docs-markdown-like-authoring-syntax.md](../../../decisions/zh/docs-markdown-like-authoring-syntax.md),
> which describes the parser that actually shipped, and by the authoring contract in
> `apps/web/src/features/docs/importer/docs-push/README.md`.
>
> Two things in this draft never shipped as written and must not be followed:
> frontmatter here uses `description` / `visibility`, whereas the implementation uses
> `summary` / `isListed`; and Phase 5 (`documentKey`) is not "later" work — `documentKey`
> is implemented and is the recommended identity for every new article.
>
> Originally at `docs/decisions/zh/docs-authoring-markdown-like-rules.md`. The original
> Chinese text is preserved below, unedited.

## 目标

建立一层比当前 TypeScript / JSON-like 导入源更容易书写的文章输入格式。

这层格式的职责不是直接渲染页面，而是：

```text
Markdown-like source
  -> parser
  -> DocsImportArticleSource
  -> validation
  -> draft
  -> preview
  -> confirm import
```

也就是说，Markdown-like 只是新的“写作输入层”，后续仍复用现有导入链路。

## 设计原则

| 原则 | 说明 |
| --- | --- |
| 不追求完整 Markdown | 只支持 docs 文章需要的语法，避免解析规则失控。 |
| 明确优先于灵活 | 每一种块都应该有清晰、稳定、可报错的写法。 |
| 先转标准源 | parser 的输出必须是 `DocsImportArticleSource`，不能绕过现有 validation。 |
| 保留高级入口 | 当前 TypeScript source 继续保留，作为高级模板和 parser 输出目标。 |
| 错误可定位 | 解析错误必须能指出行号、块类型、错误原因。 |
| 禁止危险内容 | 第一版不支持原始 HTML、script、iframe、事件属性等。 |

## 文件建议

| 文件 / 目录 | 职责 |
| --- | --- |
| `apps/web/src/features/docs/importer/parsers/markdown-like/index.ts` | 对外导出 Markdown-like parser。 |
| `apps/web/src/features/docs/importer/parsers/markdown-like/parse.ts` | 把原始文本解析为中间结构。 |
| `apps/web/src/features/docs/importer/parsers/markdown-like/to-source.ts` | 把中间结构转换成 `DocsImportArticleSource`。 |
| `apps/web/src/features/docs/importer/parsers/markdown-like/errors.ts` | 定义解析错误、行号、错误类型。 |
| `apps/web/src/features/docs/importer/parsers/markdown-like/syntax.ts` | 集中定义受支持的语法标记。 |
| `apps/web/src/features/docs/importer/parsers/markdown-like/fixtures/` | 放置 parser 测试用文章。 |
| `apps/web/src/features/docs/importer/parsers/index.ts` | 统一导出不同 parser。 |

## 文档元信息

文章顶部使用 frontmatter。

```md
---
kind: article
locale: en
slug: document-shells
title: Document Shells
description: A guide to document shell structure.
visibility: public
---
```

| 字段 | 是否必填 | 映射目标 | 说明 |
| --- | --- | --- | --- |
| `kind` | 是 | `kind` | 第一版支持 `article`，后续可扩展 `collection`。 |
| `locale` | 是 | `meta.locale` | 当前仍按单语言文章导入。 |
| `slug` | 是 | `meta.slug` | 页面路由 slug。 |
| `title` | 是 | `meta.title` | 文章标题。 |
| `description` | 否 | `meta.description` | 文章摘要。 |
| `visibility` | 否 | `meta.visibility` | 建议支持 `public` / `hidden`，用于隐藏文章。 |
| `documentKey` | 暂不启用 | 预留 | 后续用于同一篇文章的多语言版本关联。 |

## 块语法规则

| 写作语法 | 映射 block | 第一版状态 | 说明 |
| --- | --- | --- | --- |
| `# Section Title` | section | 支持 | 一个一级标题代表一个 section。 |
| `## Heading` | `heading` | 支持 | 默认 level 2。 |
| `### Heading` | `heading` | 支持 | 默认 level 3。 |
| 普通段落 | `paragraph` | 支持 | 连续非空文本合并为一个段落。 |
| `- item` | `list` | 支持 | 默认 unordered list。 |
| `1. item` | `list` | 支持 | ordered list。 |
| `- [ ] task` / `- [x] task` | `checklist` | 支持 | 转为 checklist block。 |
| `> quote` | `quote` | 支持 | 多行 quote 合并。 |
| ```` ```ts ```` | `code` | 支持 | fence language 映射为 code language。 |
| `---` | `divider` | 支持 | 独立一行才识别为 divider。 |
| `![alt](src)` | `image` | 支持 | 需要 `alt` 和 `src`。 |
| `:::callout tone=info` | `callout` | 建议支持 | 用明确容器语法，避免和 quote 混淆。 |
| 表格 | 暂不支持 | 延后 | 先不映射复杂 table。 |
| 原始 HTML | 禁止 | 禁止 | 避免安全和渲染风险。 |

## Inline 语法规则

| 写作语法 | 映射 inline | 第一版状态 | 说明 |
| --- | --- | --- | --- |
| 普通文本 | `text` | 支持 | 默认 inline 节点。 |
| `[label](href)` | `link` | 支持 | 需要校验 href。 |
| `` `code` `` | `inlineCode` | 支持 | 适合短代码片段。 |
| `==mark==` | `mark` | 建议支持 | 对应现有 mark inline。 |
| `~~delete~~` | `delete` | 建议支持 | 对应删除线。 |
| `**bold**` | 暂不支持或映射 mark | 待定 | 需要确认 block system 是否应新增 bold。 |
| `_italic_` | 暂不支持 | 待定 | 需要确认是否真的需要。 |

## Callout 建议语法

```md
:::callout tone=info variant=default title="Design note"
这里是 callout 内容。
:::
```

| 参数 | 是否必填 | 说明 |
| --- | --- | --- |
| `tone` | 否 | 默认 `info`，必须来自 block presets。 |
| `variant` | 否 | 默认 `default`，必须来自 block presets。 |
| `title` | 否 | 可选标题。 |

第一版建议 callout 内部只允许普通段落和 inline 内容，不支持嵌套复杂 block。

## 隐藏文章规则

隐藏文章不要和普通文章混成一种列表展示逻辑。

建议 frontmatter 使用：

```md
visibility: hidden
```

解释：

| visibility | 行为 |
| --- | --- |
| `public` | 可进入 docs 列表、collection、导航索引。 |
| `hidden` | 不进入列表，只能通过直接链接访问。 |

后续如果隐藏文章逐渐形成独立模块，可以再升级为更明确的 `kind: privateArticle` 或单独的导入目录。

## 校验规则

| 阶段 | 校验内容 |
| --- | --- |
| Parser 阶段 | frontmatter 是否存在、语法块是否闭合、未知语法是否报错。 |
| Source validation 阶段 | `DocsImportArticleSource` 字段是否完整、block 类型是否合法、variant/tone 是否来自 presets。 |
| Preview 阶段 | 是否能映射到 `DocsArticlePageModel` 并正常渲染。 |
| Confirm 阶段 | slug 冲突、locale 冲突、replace 策略、数据库写入结果。 |

## 出错处理

错误信息需要尽量接近写作者语言。

| 错误类型 | 示例提示 |
| --- | --- |
| 缺少 frontmatter | `第 1 行：缺少文章元信息 frontmatter。` |
| 未闭合容器 | `第 42 行：callout 没有使用 ::: 关闭。` |
| 未知 tone | `第 18 行：callout tone=warning 不在允许列表内。` |
| 图片缺少 alt | `第 25 行：图片必须提供 alt 文本。` |
| 空 section | `第 10 行：section 至少需要一个内容块。` |

## 第一阶段范围

第一阶段只解决“正式文章能更容易写出来”的问题。

优先支持：

- frontmatter
- section
- heading
- paragraph
- list
- checklist
- quote
- callout
- code
- divider
- image
- link / inlineCode / mark / delete

暂不支持：

- 原始 HTML
- 表格
- block 嵌套 block
- 多语言 documentKey 自动关联
- 复杂 collection 自动生成
- AI 自动修复导入错误

## 与现有模板关系

| 层级 | 是否保留 | 说明 |
| --- | --- | --- |
| Markdown-like source | 新增 | 面向日常写作和 AI 辅助写作。 |
| TypeScript `DocsImportArticleSource` 模板 | 保留 | 面向高级调试、完整样式覆盖、parser 输出对照。 |
| Style lab example | 保留 | 面向 block system 视觉测试，不作为日常写作入口。 |
| Preview page | 保留 | 所有导入源都必须先预览。 |

## 后续阶段

| 阶段 | 目标 |
| --- | --- |
| Phase 1 | 完成 Markdown-like parser，能稳定生成单篇文章。 |
| Phase 2 | 增强错误定位和 block-level validation。 |
| Phase 3 | 加入 hidden article 的独立列表/访问规则。 |
| Phase 4 | 加入 collection authoring 语法。 |
| Phase 5 | 加入 `documentKey`，解决双语文章关联。 |
