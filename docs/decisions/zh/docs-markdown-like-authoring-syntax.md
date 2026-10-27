# Docs Markdown-like 写作语法说明

> 历史说明（2026-10-27）：文中的 `style-lab` 指已退役的内部界面。
> `/[locale]/docs/style-lab` 于 2026-10-15 退役，相关对照表仅保留为历史，不代表当前验证路由。

## 目标

这份文档说明 `.docs.md` 原始文章如何书写，以及它如何映射到当前 docs block system。

当前链路：

```text
.docs.md
  -> markdown-like parser
  -> DocsImportArticleSource
  -> validation
  -> import draft
  -> preview
  -> confirm import
```

`.docs.md` 是写作输入层，不是最终数据库结构，也不是页面渲染模型。

## 推荐原始存储结构

当前可以先把 docs 原始内容和图片资产从 app 代码目录中解耦出来，按日期组织：

```text
docs/
  2026-06-27/
    article-a.docs.md
    article-b.docs.md
  2026-06-28/
    article-c.docs.md

docs-image/
  2026-06-27/
    article-a/
      cover.png
      diagram-01.png
  2026-06-28/
    article-c/
      cover.png
```

解释：

| 目录 | 职责 |
| --- | --- |
| `docs/` | 存放 `.docs.md` 原始文章。 |
| `docs-image/` | 存放原始图片、截图、GIF 等媒体资产。 |
| `apps/web/public/images/docs/` | 当前 Next 页面可直接访问的发布态静态图片目录。 |

重要限制：

当前 parser 只会把图片语法中的 `src` 写入 image block，不会自动复制图片，也不会自动把 `docs-image/...` 发布成网页可访问资源。

所以当前最稳的测试方式是：

```md
![图片说明](/images/docs/article-slug/cover.png "图片标题")
```

并确保实际图片存在于：

```text
apps/web/public/images/docs/article-slug/cover.png
```

如果希望写作源文件中使用：

```md
![图片说明](../../docs-image/2026-06-27/article-a/cover.png)
```

那需要后续新增 media publish pipeline：

```text
docs-image 原始资产
  -> import/publish 时复制或上传
  -> 生成可访问 URL
  -> 写入 image.src
```

当前版本暂不做自动搬运。

## Frontmatter

每篇文章必须以 frontmatter 开头。

```md
---
locale: en
slug: article-slug
title: Article Title
summary: Article summary.
eyebrow: Optional eyebrow
---
```

| 字段 | 是否必填 | 当前支持 | 说明 |
| --- | --- | --- | --- |
| `locale` | 是 | 是 | 当前通常为 `en` 或 `zh`。 |
| `slug` | 是 | 是 | 文章 URL slug。 |
| `title` | 是 | 是 | 页面标题。 |
| `summary` | 是 | 是 | 页面描述。 |
| `eyebrow` | 否 | 是 | 页面标题上方的小标签。 |
| `seoTitle` | 否 | 是 | SEO 标题。 |
| `seoDescription` | 否 | 是 | SEO 描述。 |
| `publishedAt` | 否 | 是 | 发布时间。 |
| `kind` | 否 | 是 | `article` / `reference` / `note`。 |
| `layoutMode` | 否 | 仅 `contentOnly` | Markdown-like v1 只支持单文章阅读页。 |
| `accessRole` | 否 | 是 | `guest` / `member` / `pro`。 |
| `routeType` | 否 | 仅 `singleArticle` | v1 不支持 collection article。 |
| `documentKey` | 否 | 未支持 | 后续用于多语言关联。 |

默认值：

| 字段 | 默认值 |
| --- | --- |
| `routeType` | `singleArticle` |
| `kind` | `article` |
| `layoutMode` | `contentOnly` |
| `accessRole` | `guest` |

## Section

一级标题 `#` 映射为 docs section。

```md
# Opening section
```

映射结果：

```text
section.title = Opening section
section.id = opening-section
```

规则：

| 规则 | 说明 |
| --- | --- |
| 必须先写 section | 内容块必须出现在 `#` section 后面。 |
| section 不能为空 | 每个 section 至少要有一个 block。 |
| `#` 不是 heading block | 它是页面正文的 section 分组。 |

## Heading Block

当前基础语法：

```md
## Default heading level 2
### Default heading level 3
#### Default heading level 4
```

当前映射：

| 语法 | level | 当前 variant |
| --- | --- | --- |
| `##` | 2 | `default` |
| `###` | 3 | `default` |
| `####` | 4 | `default` |

style-lab 中已有但 Markdown-like 尚未完整写入的 heading variant：

| style-lab 样式 | 当前 Markdown-like 状态 |
| --- | --- |
| `display` | 未支持语法 |
| `default` | 默认支持 |
| `compact` | 未支持语法 |
| `subtle` | 未支持语法 |

建议后续语法：

```md
## {variant=display} Display heading level 1/2/3/4
## {variant=default} Default heading level 1/2/3/4
### {variant=compact} Compact heading level 1/2/3/4
#### {variant=subtle} Subtle heading level 1/2/3/4
```

当前 parser 尚未实现这个 heading attributes 语法。

## Paragraph Block

普通段落：

```md
This is a standard paragraph.
```

带样式段落：

```md
{paragraph variant=lead spacing=relaxed} This lead paragraph opens the section.
{paragraph variant=muted spacing=default} This muted paragraph is secondary context.
```

当前支持：

| 参数 | 可选值 | 说明 |
| --- | --- | --- |
| `variant` | `default` / `lead` / `muted` | 控制段落视觉层级。 |
| `spacing` | `default` / `relaxed` | 控制段落行距节奏。 |

style-lab 覆盖状态：

| style-lab 样式 | 当前 Markdown-like 状态 |
| --- | --- |
| lead + relaxed | 支持 |
| default + default | 支持 |
| default + relaxed | 支持 |
| muted + default | 支持 |
| inline link | 支持 |
| inline mark | 支持 |
| inline delete | 支持 |
| inline code | 支持 |
| strong / bold | 未支持，当前会报错 |
| italic | 未支持，当前会报错 |

## Inline 语法

```md
This paragraph includes [a link](https://openai.com), ==marked text==, ~~deleted text~~, and `inlineCode`.
```

| 语法 | 映射 |
| --- | --- |
| 普通文字 | `text` |
| `[label](href)` | `link` |
| `` `code` `` | `inlineCode` |
| `==mark==` | `mark` |
| `~~delete~~` | `delete` |
| `**bold**` | 未支持 |
| `_italic_` / `*italic*` | 未支持 |

## List Block

无序列表：

```md
- First item.
- Second item.
```

有序列表：

```md
1. First step.
2. Second step.
```

当前映射：

| 语法 | listStyle | 当前 variant |
| --- | --- | --- |
| `- item` | `unordered` | `default` |
| `1. item` | `ordered` | `default` |

style-lab 中已有但 Markdown-like 尚未完整写入的 list variant：

| style-lab 样式 | 当前 Markdown-like 状态 |
| --- | --- |
| unordered default | 支持 |
| ordered default | 支持 |
| unordered emphasis | 未支持语法 |
| ordered emphasis | 未支持语法 |

建议后续语法：

```md
:::list style=unordered variant=emphasis
- First emphasized item.
- Second emphasized item.
:::
```

当前 parser 尚未实现 list container attributes。

## Checklist Block

```md
- [x] Completed task.
- [ ] Open task.
```

当前映射：

| 语法 | checked | 当前 variant |
| --- | --- | --- |
| `- [x] item` | `true` | `default` |
| `- [ ] item` | `false` | `default` |

style-lab 中已有但 Markdown-like 尚未完整写入的 checklist variant：

| style-lab 样式 | 当前 Markdown-like 状态 |
| --- | --- |
| default mixed | 支持 |
| default completed | 支持 |
| emphasis mixed | 未支持语法 |
| emphasis completed | 未支持语法 |

建议后续语法：

```md
:::checklist variant=emphasis
- [ ] Important open task.
- [x] Important completed task.
:::
```

当前 parser 尚未实现 checklist container attributes。

## Callout Block

```md
:::callout tone=tip variant=soft title="Writing tip"
Use callouts for short context that should stand apart from the main paragraph rhythm.
:::
```

当前支持：

| 参数 | 可选值 |
| --- | --- |
| `tone` | `note` / `tip` / `attention` / `warning` / `meta` |
| `variant` | `default` / `soft` / `context` |
| `title` | 任意字符串 |

style-lab 覆盖状态：

| style-lab 样式 | 当前 Markdown-like 状态 |
| --- | --- |
| note default | 支持 |
| tip soft | 支持 |
| tip context | 支持 |
| attention default | 支持 |
| warning default | 支持 |
| meta default | 支持 |

限制：

| 限制 | 说明 |
| --- | --- |
| 不支持嵌套 block | callout 内部当前只会变成纯文本。 |
| 不支持 inline 解析 | callout text 当前不会拆成 inline content。 |

## Quote Block

```md
> A useful docs block system feels editorial before it feels feature-rich.
> Keep quotes short enough to preserve momentum.
```

当前支持：

| 能力 | 状态 |
| --- | --- |
| 多行 quote 合并 | 支持 |
| attribution / 出处 | 未支持语法 |

style-lab 中已有但 Markdown-like 尚未完整写入：

| style-lab 样式 | 当前 Markdown-like 状态 |
| --- | --- |
| quote with attribution | 未支持 attribution |
| quote without attribution | 支持 |

建议后续语法：

```md
> Quote text.
> -- Quote source
```

当前 parser 尚未实现 attribution。

## Divider Block

标准分割线：

```md
---
```

带间距变体：

```md
--- {variant=spacious}
```

当前支持：

| 参数 | 可选值 |
| --- | --- |
| `variant` | `default` / `spacious` |

style-lab 覆盖状态：

| style-lab 样式 | 当前 Markdown-like 状态 |
| --- | --- |
| default divider | 支持 |
| spacious divider | 支持 |

## Code Block

```md
```ts caption="DocsImportArticleSource target" variant=block
type DocsImportArticleSource = {
  meta: DocsImportArticleMeta;
  body: DocsImportArticleBody;
};
```
```

紧凑代码块：

```md
```bash caption="CLI commands" variant=compact
pnpm docs:import --file path/to/article.docs.md
```
```

当前支持：

| 参数 | 可选值 |
| --- | --- |
| language | fence 后的语言名，如 `ts` / `bash` / `json` |
| `caption` | 任意字符串 |
| `variant` | `block` / `compact` |

style-lab 覆盖状态：

| style-lab 样式 | 当前 Markdown-like 状态 |
| --- | --- |
| block multiline code | 支持 |
| compact command code | 支持 |
| block long-line code | 支持 |

## Image Block

当前基础语法：

```md
![图片说明](/images/docs/article-slug/cover.png "图片标题")
```

映射：

| Markdown 字段 | image block 字段 |
| --- | --- |
| `alt` | `alt` |
| `src` | `src` |
| `"caption"` | `caption` |

当前支持：

| 能力 | 状态 |
| --- | --- |
| PNG/JPG/WebP/GIF URL | 理论支持，取决于前端可访问 URL。 |
| caption | 支持 |
| alt 必填 | 支持校验 |
| 本地相对路径自动发布 | 未支持 |
| 图片上传 | 未支持 |
| 图片压缩/转码 | 未支持 |

如果采用解耦目录：

```text
docs-image/2026-06-27/article-a/cover.png
```

建议后续新增一种 source-only 写法：

```md
![图片说明](./cover.png "图片标题")
```

然后由 media pipeline 解析为：

```text
/images/docs/article-a/cover.png
```

当前 parser 尚未实现这个相对路径解析和复制发布流程。

## GIF / Video / Embed

当前状态：

| 类型 | 当前建议 |
| --- | --- |
| GIF | 可以先作为 image block 使用，只要 URL 可访问。 |
| MP4 / WebM | 不建议塞进 image block，后续新增 video block。 |
| YouTube / Bilibili / iframe | 当前不支持，后续做 embed block，并加白名单。 |
| 原始 HTML iframe | 当前禁止。 |

建议后续语法：

```md
:::video src="/videos/docs/article-slug/demo.mp4" poster="/images/docs/article-slug/poster.png" title="Demo video"
:::
```

```md
:::embed provider=youtube url="https://www.youtube.com/watch?v=xxx" title="Demo"
:::
```

什么时候考虑图床或外部媒体服务：

| 条件 | 建议 |
| --- | --- |
| 图片/GIF 体积明显拖慢 repo | 考虑 R2/S3/OSS + CDN。 |
| 视频开始进入正式文章 | 使用对象存储或视频平台，不建议进 Git。 |
| 非开发者也需要上传素材 | 做后台上传入口。 |
| 需要替换、压缩、审计素材 | 建立 media asset 管理层。 |

## 当前未写入 Markdown-like 的 style-lab 能力

| 能力 | block system 已有 | style-lab 已展示 | Markdown-like 当前状态 |
| --- | --- | --- | --- |
| heading `display` | 是 | 是 | 未支持语法 |
| heading `compact` | 是 | 是 | 未支持语法 |
| heading `subtle` | 是 | 是 | 未支持语法 |
| list `emphasis` | 是 | 是 | 未支持语法 |
| checklist `emphasis` | 是 | 是 | 未支持语法 |
| quote attribution | 是 | 是 | 未支持语法 |
| image 本地相对路径 | block 可承载 URL | 未专门展示 | 未支持发布流程 |
| video block | 否 | 否 | 未支持 |
| embed block | 否 | 否 | 未支持 |
| table block | 否 | TODO | 未支持 |
| bold / italic inline | 否 | TODO | 当前严格报错 |

## 建议下一步实现顺序

| 优先级 | 内容 | 原因 |
| --- | --- | --- |
| P0 | 文档先统一使用可访问 URL 图片 | 保证当前导入和预览稳定。 |
| P1 | 支持 heading attributes | 补齐截图里 heading system 的样式差异。 |
| P1 | 支持 list/checklist container attributes | 补齐 emphasis 列表样式。 |
| P1 | 支持 quote attribution | 补齐 style-lab 引用样式。 |
| P2 | 设计 media publish pipeline | 让 `docs-image/` 原始资产自动发布为可访问 URL。 |
| P3 | 新增 video/embed block | 处理 GIF 以外的非文本媒体。 |

