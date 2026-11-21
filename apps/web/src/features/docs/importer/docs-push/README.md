# Docs Authoring And Import

This directory documents the current Docs authoring contract. Real Markdown-like articles and their original media live outside Git; the importer creates a draft, an Owner reviews it in the browser, and confirmation writes the published document to PostgreSQL.

## Content Root And Media

Set an absolute, untracked content source directory in `apps/web/.env.local`:

```env
DOCS_CONTENT_ROOT="D:\\Incept-content"
```

Markdown-like source files must live inside this directory. A practical structure is:

```text
D:\Incept-content/
  2026-07-27/
    article-slug.docs.md
    assets/
      cover.png
  shared-media/
    diagram.png
```

Use relative image references in the article. The path may point anywhere inside `DOCS_CONTENT_ROOT`, including shared media.

```md
![Architecture overview](./assets/cover.png "Optional caption")
```

- Local image paths are validated, hashed, and mapped to `/_docs-media/<hash>.<ext>`.
- A normal import copies new media into the Git-ignored `apps/web/public/_docs-media/` preview mirror.
- `--dry-run` validates and reports media operations without copying files, writing a draft, or writing the database.
- `http://` and `https://` image URLs remain external and are not copied.
- Supported local extensions: `avif`, `gif`, `jpeg`, `jpg`, `png`, and `webp`.
- `public/_docs-media` is a disposable local preview mirror, not an article source directory and not a Git asset directory.

## Import Workflow

Run commands from the repository root.

```powershell
# Validate source, routes, and media without writing anything.
pnpm docs:import --file 2026-07-27/article-slug.docs.md --dry-run

# Publish local media and create an import draft.
pnpm docs:import --file 2026-07-27/article-slug.docs.md

# Replace an existing locale article intentionally.
pnpm docs:import --file 2026-07-27/article-slug.docs.md --replace
```

The CLI prints a preview URL. Open it in an Owner session, inspect the rendered document and media, then use the confirmation action to write PostgreSQL data. Creating a draft is not publication.

`--replace` overwrites the existing locale content after confirmation and records a `replaced` publication event. A new document records a `published` event. Adding another locale to an existing `documentKey` does not create a duplicate writing contribution.

TypeScript `DocsImportArticleSource` files remain supported for advanced or programmatic imports, but `.docs.md` is the normal writing format.

## Frontmatter

Every Markdown-like file starts with frontmatter.

```md
---
documentKey: article-slug
locale: zh
routeType: singleArticle
slug: article-slug
title: Article title
summary: A short description for the article page and listings.
eyebrow: Docs
publishedAt: 2026-07-27
kind: article
layoutMode: contentOnly
accessRole: pro
isListed: true
---
```

Required fields are `locale`, `slug`, `title`, and `summary`.

| Field | Applies to | Notes |
| --- | --- | --- |
| `documentKey` | all | Optional lowercase-hyphen identity shared by locale variants. New authored articles should provide it. |
| `locale` | all | `en` or `zh`. |
| `routeType` | all | `singleArticle` by default; use `collectionArticle` for a series entry. |
| `slug` | all | Locale-specific route slug. |
| `title`, `summary`, `eyebrow` | all | Visible article metadata. `title` and `summary` are required. |
| `publishedAt` | all | Optional; omitted values default to import time. First publication history uses this value. |
| `kind` | all | `article`, `reference`, or `note`. A note is published under `/{locale}/notes/{slug}`. |
| `layoutMode` | single article | `contentOnly` by default; `sidebar` is also valid. |
| `accessRole` | all | `guest`, `pro`, or `private`; defaults to `guest`. |
| `isListed` | single article | Defaults to `true`. `false` creates an internal, unlisted Docs-backed article. |
| `seoTitle`, `seoDescription` | all | Optional search metadata. |

### Collection Article Frontmatter

Collection articles require the normal fields plus stable collection identity and position:

```md
---
documentKey: architecture-part-one
locale: en
routeType: collectionArticle
collectionKey: account-access-architecture
collectionSlug: account-access-architecture
collectionTitle: Account access architecture
position: 1
slug: principals-and-sessions
title: Principals and sessions
summary: The first article in the collection.
accessRole: pro
---
```

Rules:

- `collectionKey`, `collectionSlug`, `collectionTitle`, and integer `position` are required.
- Collection articles always use `sidebar` layout and are always listed through their collection.
- Locale variants of one `documentKey` must use the same collection identity and position.
- A collection and all of its articles must use the same `accessRole`.

### Collection Directory Layout

Collection articles remain independent `.docs.md` files. For a folder-based collection, the directory name supplies the collection source and numbered entries supply the navigation tree:

```text
account-access/
├─ 01-overview.docs.md
├─ 02-identity/
│  ├─ 01-principal.docs.md
│  └─ 02-session.docs.md
└─ 03-revocation/
```

- Numbered `.docs.md` files become `article` nodes.
- Numbered directories become empty `folder` nodes; folders may contain articles or more folders.
- Prefixes such as `01-` and `02-` define sibling order; entries must be consecutive and start at `01`.
- Folder nesting is limited to three levels. Unnumbered directories such as `assets` are ignored as navigation nodes.
- `documentKey` remains the article identity; moving a file does not change it.

Preview the inferred tree with:

```powershell
pnpm docs:import --dir account-access --dry-run
```

The directory command validates and prints the inferred tree. Without `--dry-run` it also creates a batch draft and prints a preview URL; an Owner must still confirm that draft on the preview page before anything is published. A directory scan is never a direct publication command.

## Markdown-like Body

`#` starts a Docs section. `##` through `####` are heading blocks inside the current section.

```md
# Overview

## Context

Normal paragraph text with [a link](https://example.com), `inline code`, ==mark==, and ~~deleted text~~.
```

Supported blocks:

| Syntax | Result |
| --- | --- |
| `# Title` | Section and current right-rail outline item. |
| `##` / `###` / `####` | Heading blocks. |
| Plain text | Paragraph; consecutive non-empty lines merge. |
| `{paragraph variant=lead spacing=relaxed} Text` | Paragraph variant and spacing. |
| `- item` / `1. item` | Unordered or ordered list. |
| `- [ ] item` / `- [x] item` | Single-level checklist. |
| `> quote` | Quote block; consecutive quote lines merge. |
| `:::callout ...` | Callout block. |
| Fenced code | Code block with an optional language and attributes. |
| `---` / `--- {variant=spacious}` | Divider. |
| `![alt](src "caption")` | Image block. |

### Callout

```md
:::callout tone=tip variant=soft title="Writing tip"
Use a callout for a short note that should stand apart from the main prose.
:::
```

Allowed tones: `note`, `tip`, `attention`, `warning`, `meta`.

Allowed variants: `default`, `soft`, `context`.

### Code

````md
```ts variant=compact caption="Example"
export const answer = 42;
```
````

Code fences preserve source text. Rendering, syntax highlighting, light/dark palettes, and eye-comfort colors are handled by the Docs code renderer.

### Equations and tables

Use `$…$` for inline math in paragraphs, list items, quotes, body headings, and table cells.
For display math, open and close the block with `$$` on separate lines. Add an optional
`\tag{M0-01}` as the last line before closing. The number appears beneath the formula on
the right and is linkable as `#eq-m0-01`. Use letters, digits, dots, and hyphens in tags.
Tags must be unique within an article, ignoring case. The number comes from the source.

Start and end each table row with `|`. Write a header and a separator row with at least
three hyphens per column. Use colons for alignment (`:---`, `:---:`, or `---:`).
Columns without explicit alignment are centered. Each data row must have the same number of
columns. An empty cell still needs its separators.
Use `\|` for a literal pipe in plain text. Pipes inside math or inline code stay in their cells.

## Unsupported Syntax

The parser reports source lines for unsupported syntax rather than guessing a conversion.

- Raw HTML, scripts, iframes, video, and embed blocks.
- Bold and italic Markdown syntax.
- Nested or multiline checklist items.
- Heading attributes, list/checklist emphasis containers, and quote attribution syntax.

Do not use `file://` URLs or local image paths that leave `DOCS_CONTENT_ROOT`.

## Validation And Checks

```powershell
pnpm docs:check-markdown-like
pnpm docs:check-media
pnpm docs:import --file 2026-07-27/article-slug.docs.md --dry-run
```

For an import error, fix the source file and create a new draft. A draft with validation errors cannot be confirmed.

---

# Docs 写作与导入

本节是上方英文说明的中文镜像。真实 Markdown-like 文章和原始媒体位于 Git 仓库外；导入器先创建草稿，再由 Owner 在浏览器预览并确认，最终写入 PostgreSQL。

## 内容根目录与媒体

在未跟踪的 `apps/web/.env.local` 中配置绝对内容源目录：

```env
DOCS_CONTENT_ROOT="D:\\Incept-content"
```

Markdown-like 源文件必须位于该目录内。推荐结构：

```text
D:\Incept-content/
  2026-07-27/
    article-slug.docs.md
    assets/
      cover.png
  shared-media/
    diagram.png
```

文章中使用相对图片路径；路径可以引用 `DOCS_CONTENT_ROOT` 内任意共享素材：

```md
![架构概览](./assets/cover.png "可选图片说明")
```

- 本地图片会校验路径、计算内容 hash，并映射为 `/_docs-media/<hash>.<ext>`。
- 正式导入会把新增媒体复制到 Git 忽略的 `apps/web/public/_docs-media/` 本地预览镜像。
- `--dry-run` 只校验并报告媒体操作，不复制文件、不写草稿、不写数据库。
- `http://` 与 `https://` 图片保持外部 URL，不复制。
- 支持的本地扩展名：`avif`、`gif`、`jpeg`、`jpg`、`png`、`webp`。
- `public/_docs-media` 是可删除的本地预览镜像，不是文章源目录，也不提交到 Git。

## 导入流程

从仓库根目录执行：

```powershell
# 只校验文章、路由与媒体。
pnpm docs:import --file 2026-07-27/article-slug.docs.md --dry-run

# 发布本地媒体镜像并创建导入草稿。
pnpm docs:import --file 2026-07-27/article-slug.docs.md

# 明确替换已有 locale 文章。
pnpm docs:import --file 2026-07-27/article-slug.docs.md --replace
```

CLI 会输出预览 URL。使用 Owner session 打开预览，检查正文和媒体后，再执行确认操作写入 PostgreSQL。创建 draft 不等于发布。

`--replace` 会在确认后覆盖已有 locale 内容并写入一条 `replaced` 发布事件。新文章写入 `published` 事件。同一 `documentKey` 新增另一语言 locale 不会重复计算写作贡献。

TypeScript `DocsImportArticleSource` 仍可用于高级或程序化导入；`.docs.md` 是常规写作格式。

## Frontmatter

每个 Markdown-like 文件以 frontmatter 开头：

```md
---
documentKey: article-slug
locale: zh
routeType: singleArticle
slug: article-slug
title: 文章标题
summary: 用于文章页与列表的简短摘要。
eyebrow: Docs
publishedAt: 2026-07-27
kind: article
layoutMode: contentOnly
accessRole: pro
isListed: true
---
```

必填字段为 `locale`、`slug`、`title`、`summary`。

| 字段 | 适用范围 | 说明 |
| --- | --- | --- |
| `documentKey` | 全部 | 可选的小写连字符稳定身份；新文章建议提供，用于关联多语言版本。 |
| `locale` | 全部 | `en` 或 `zh`。 |
| `routeType` | 全部 | 默认 `singleArticle`；合集文章使用 `collectionArticle`。 |
| `slug` | 全部 | locale 对应的路由 slug。 |
| `title`、`summary`、`eyebrow` | 全部 | 可见文章元数据；`title` 与 `summary` 必填。 |
| `publishedAt` | 全部 | 可选；省略时使用导入时间。首次发布历史使用该值。 |
| `kind` | 全部 | `article`、`reference`、`note`。`note` 发布到 `/{locale}/notes/{slug}`。 |
| `layoutMode` | 单文章 | 默认 `contentOnly`；也可使用 `sidebar`。 |
| `accessRole` | 全部 | `guest`、`pro`、`private`；默认 `guest`。 |
| `isListed` | 单文章 | 默认 `true`；`false` 创建内部、不进入列表的 Docs 文章。 |
| `seoTitle`、`seoDescription` | 全部 | 可选 SEO 元数据。 |

### 合集文章 Frontmatter

合集文章除了普通字段外，还必须提供合集稳定身份与排序：

```md
---
documentKey: architecture-part-one
locale: en
routeType: collectionArticle
collectionKey: account-access-architecture
collectionSlug: account-access-architecture
collectionTitle: Account access architecture
position: 1
slug: principals-and-sessions
title: Principals and sessions
summary: The first article in the collection.
accessRole: pro
---
```

规则：

- 必填 `collectionKey`、`collectionSlug`、`collectionTitle` 与整数 `position`。
- 合集文章固定使用 `sidebar` layout，并通过合集进入列表。
- 同一 `documentKey` 的 locale 版本必须使用相同合集身份与 position。
- 同一合集和其中全部文章必须使用一致的 `accessRole`。

### 合集目录结构

合集文章仍然是一篇文件对应一篇独立文章。对于文件夹式合集，目录表示合集源，带数字前缀的条目表示导航树：

```text
account-access/
├─ 01-overview.docs.md
├─ 02-identity/
│  ├─ 01-principal.docs.md
│  └─ 02-session.docs.md
└─ 03-revocation/
```

- 带数字前缀的 `.docs.md` 是 `article` 节点。
- 带数字前缀的目录是空的 `folder` 节点，可以继续包含文章或子目录。
- `01-`、`02-` 等前缀决定同级顺序；编号必须从 `01` 开始且连续。
- 文件夹最多嵌套三层；`assets` 等无数字前缀目录不会进入导航树。
- `documentKey` 仍是文章稳定身份；移动文件不会改变文章身份。

使用以下命令预览自动识别的树：

```powershell
pnpm docs:import --dir account-access --dry-run
```

目录命令会校验并打印推导出的树；不带 --dry-run 时还会创建批量草稿并输出预览 URL，需由 Owner 在预览页确认后才会正式发布。目录扫描本身不是直接发布命令。

## Markdown-like 正文

`#` 开始一个 Docs section；`##` 到 `####` 是当前 section 内的 heading block。

```md
# 概览

## 背景

普通段落可包含 [链接](https://example.com)、`行内代码`、==高亮== 与 ~~删除线~~。
```

支持的 block：

| 写法 | 结果 |
| --- | --- |
| `# 标题` | Section 与当前右侧目录项。 |
| `##` / `###` / `####` | Heading block。 |
| 普通文本 | 段落；连续非空行会合并。 |
| `{paragraph variant=lead spacing=relaxed} 文本` | 段落变体与行距。 |
| `- item` / `1. item` | 无序或有序列表。 |
| `- [ ] item` / `- [x] item` | 单层 checklist。 |
| `> quote` | Quote block；连续引用行会合并。 |
| `:::callout ...` | Callout block。 |
| fenced code | 含可选语言与属性的代码块。 |
| `$$` 独立围栏 | 块级 LaTeX，支持显式编号。 |
| 管道分隔表格 | 保留列对齐、行内公式和链接的表格。 |
| `---` / `--- {variant=spacious}` | 分割线。 |
| `![alt](src "caption")` | 图片 block。 |

### Callout

```md
:::callout tone=tip variant=soft title="写作提示"
用 callout 承载需要从正文节奏中轻微分离的短说明。
:::
```

可用 tone：`note`、`tip`、`attention`、`warning`、`meta`。

可用 variant：`default`、`soft`、`context`。

### 代码块

````md
```ts variant=compact caption="示例"
export const answer = 42;
```
````

代码围栏保留原始文本；语法高亮、亮暗主题与护眼配色由 Docs 代码渲染器处理。

### 公式和表格

行内公式用 `$…$`，适用于段落、列表项、引用、正文小标题和表格单元格。
独立公式用两行 `$$` 包围。需要编号时，在闭合符之前的最后一行写 `\tag{M0-01}`。
编号显示在公式右下角，可通过 `#eq-m0-01` 跳转。编号可用字母、数字、点和连字符，
在同一篇文章内忽略大小写后须唯一。

```md
$$
\frac{TP}{TP+FP}
\tag{M0-01}
$$

| 公式编号 | 名称 | 公式概览 |
| --- | --- | :---: |
| [M0-01](#eq-m0-01) | 精确率 | $\frac{TP}{TP+FP}$ |
```

表格每行用 `|` 开头和结尾。表头之后要有分隔行，每列至少三个连字符，可写为
`:---`、`:---:` 或 `---:` 设置列对齐。未指定对齐时默认居中。
数据行必须与表头列数一致，空单元格也要保留分隔符。
普通文本里的竖线用 `\|`，行内代码或公式内部的竖线留在单元格中。

## 不支持的语法

Parser 会报告不支持语法所在行，而不是猜测转换结果。

- 原始 HTML、script、iframe、video、embed。
- Markdown bold 与 italic。
- 嵌套或多行 checklist。
- heading attributes、list/checklist emphasis 容器、quote attribution。

不要使用 `file://` URL，也不要让本地图片路径离开 `DOCS_CONTENT_ROOT`。

## 校验命令

```powershell
pnpm docs:check-markdown-like
pnpm docs:check-media
pnpm docs:import --file 2026-07-27/article-slug.docs.md --dry-run
```

导入报错时，修改源文件后重新创建 draft。包含 validation error 的 draft 无法确认发布。
