# Docs DocumentKey 调查与设计

[2026-07-07] - Investigation / design draft

## 背景

当前 docs 已经完成了第一阶段内容生命周期：

```text
.docs.md -> import draft -> preview -> confirm import -> published
published -> docs:archive -> archived
```

现在进入下一阶段：解决中英文文章之间的关系。

核心问题：

```text
/en/docs/xxx
/zh/docs/yyy
```

这两篇文章是否是同一篇文档的不同语言版本？

当前系统无法判断。

## 当前现状

### 数据库结构

当前核心结构：

```text
DocsDocument
  id
  kind
  layoutMode
  accessRole
  locales[]

DocsDocumentLocale
  documentId
  locale
  slug
  title
  summary
  status
  bodyJson
```

当前唯一约束：

```prisma
@@unique([documentId, locale])
@@unique([locale, slug])
```

含义：

- 同一个 document 下，一个 locale 只能有一条内容。
- 同一个 locale 下，一个 slug 只能对应一篇文章。

但目前 `DocsDocument` 没有：

```text
documentKey
canonicalKey
translationGroup
```

所以系统只能知道：

```text
zh + only-test 是一篇文章
en + only-test 是另一篇文章
```

无法知道它们是不是同一篇文档的两个语言版本。

### 当前导入逻辑

当前 DB import 主要按：

```text
locale + slug
```

查找已有文章。

位置：

```text
packages/db/src/docs/import.ts
```

当前逻辑：

```text
findExistingLocaleTarget({ locale, slug })
```

如果找到：

```text
replace=false -> 报错
replace=true -> 覆盖该 locale 内容
```

如果没找到：

```text
创建新的 DocsDocument
创建新的 DocsDocumentLocale
```

这意味着：

```text
en/article-a
zh/article-a
```

如果分别导入，会创建两个不同的 `DocsDocument`，即使 slug 一样。

### 当前 Markdown-like frontmatter

当前 `.docs.md` 支持：

```md
---
locale: zh
slug: only-test
title: 中文标题
summary: 中文摘要
---
```

当前不支持：

```md
documentKey: some-stable-key
```

位置：

```text
apps/web/src/features/docs/importer/types.ts
apps/web/src/features/docs/importer/parsers/markdown-like/syntax.ts
```

## documentKey 的定义

`documentKey` 是同一篇文档跨语言版本的稳定身份。

它不是 URL。

它不是标题。

它不是 slug。

示例：

```md
---
documentKey: mmpi-overview
locale: en
slug: mmpi-overview
title: MMPI Overview
summary: An introduction to MMPI.
---
```

```md
---
documentKey: mmpi-overview
locale: zh
slug: mmpi-jian-jie
title: MMPI 简介
summary: 关于 MMPI 的中文介绍。
---
```

这两篇文章的 URL 可以不同：

```text
/en/docs/mmpi-overview
/zh/docs/mmpi-jian-jie
```

但它们属于同一个文档：

```text
documentKey = mmpi-overview
```

## 为什么不能直接用 slug

slug 是 locale 内部的 URL 标识。

它适合做：

```text
/zh/docs/only-test
```

但不适合做跨语言身份。

原因：

- 中文和英文 slug 可能不同。
- slug 可能为了 SEO 调整。
- slug 是路由层概念，不是内容身份。
- 同一篇文章可能需要更换 URL，但不应该失去翻译关系。

所以推荐分工：

| 字段 | 职责 |
| --- | --- |
| `documentKey` | 同一篇文档的稳定身份 |
| `locale` | 语言 |
| `slug` | 当前语言下的 URL |
| `title` | 当前语言下的展示标题 |

## 推荐数据库方案

第一阶段建议在 `DocsDocument` 上新增：

```prisma
documentKey String? @unique
```

原因：

- `DocsDocument` 是跨 locale 的文档实体。
- `DocsDocumentLocale` 是某个文档在某个语言下的内容。
- `documentKey` 放在 `DocsDocument` 上，语义最清楚。
- 先做可选字段，便于迁移旧数据。

推荐结构：

```prisma
model DocsDocument {
  id          Int      @id @default(autoincrement())
  documentKey String? @unique
  kind        DocKind  @default(article)
  layoutMode  DocLayoutMode @default(contentOnly)
  accessRole  DocAccessRole @default(guest)
  locales     DocsDocumentLocale[]

  @@index([kind])
  @@index([layoutMode])
  @@index([accessRole])
  @@map("docs_documents")
}
```

后续稳定后可以考虑改成必填：

```prisma
documentKey String @unique
```

但不建议第一阶段直接必填。

## 推荐导入逻辑

导入时增加 `documentKey` 后，查找顺序建议为：

```text
1. 如果 source.meta.documentKey 存在：
   - 先用 documentKey 查 DocsDocument
   - 找到则在该 document 下 upsert 当前 locale
   - 没找到则创建 DocsDocument(documentKey)

2. 如果 source.meta.documentKey 不存在：
   - 保持当前 locale + slug 逻辑
   - 创建或替换独立 document
```

这样可以兼容旧文章。

### 有 documentKey 的导入

```text
documentKey: mmpi-overview
locale: zh
slug: mmpi-jian-jie
```

如果 `DocsDocument(documentKey=mmpi-overview)` 已存在：

```text
在该 document 下创建/替换 zh locale
```

如果不存在：

```text
创建新的 DocsDocument(documentKey=mmpi-overview)
创建 zh locale
```

### replace 语义

`--replace` 仍然保留。

推荐规则：

| 情况 | replace=false | replace=true |
| --- | --- | --- |
| 同 documentKey + locale 已存在 | 报错 | 替换该 locale |
| 同 locale + slug 被其他 document 占用 | 报错 | 仍然报错，避免抢 URL |
| documentKey 不存在 | 创建 | 创建 |

注意：

即使使用 `documentKey`，`locale + slug` 仍然必须唯一。

## Markdown-like 修改点

需要加入 frontmatter 白名单：

```ts
documentKey
```

相关位置：

```text
apps/web/src/features/docs/importer/parsers/markdown-like/syntax.ts
```

需要加入 importer 类型：

```ts
type DocsImportArticleMeta = {
  documentKey?: string;
  ...
}
```

相关位置：

```text
apps/web/src/features/docs/importer/types.ts
packages/db/src/docs/import.ts
packages/db/src/docs/import-types.ts
```

示例：

```md
---
documentKey: first-real-single
locale: zh
slug: only-test
title: 正文，真正的正文
summary: 写到文章界面的东西？看看效果
---
```

## 旧数据迁移策略

第一阶段不强制旧数据都有 `documentKey`。

可选策略：

### 策略 A：新文章开始要求 documentKey

旧文章保持 `documentKey = null`。

优点：

- 风险最低。
- 不需要立即处理历史数据。

缺点：

- 覆盖率统计时要区分 unknown。

### 策略 B：给现有文章回填 documentKey

例如：

```text
documentKey = slug
```

优点：

- 所有文章都有 key。

缺点：

- 如果 zh slug 和 en slug 不同，仍然无法自动判断同一篇。
- 后续可能还要人工合并。

### 推荐

先采用策略 A。

新导入文章逐步使用 `documentKey`。

旧文章后续通过人工 review 再补。

## 语言切换设计

有了 `documentKey` 后，文章页可以知道同一 document 下有哪些 locale。

目标：

```text
当前页面: /zh/docs/mmpi-jian-jie
切换英文: /en/docs/mmpi-overview
```

需要查询：

```text
DocsDocument
  where documentKey = 当前 documentKey
  include locales where status = published
```

返回：

```ts
[
  { locale: 'zh', slug: 'mmpi-jian-jie', title: 'MMPI 简介' },
  { locale: 'en', slug: 'mmpi-overview', title: 'MMPI Overview' }
]
```

如果目标 locale 不存在：

第一阶段建议：

```text
跳转到目标语言 docs 首页
```

后续再考虑：

```text
显示“当前文章暂无中文/英文版本”
```

## 覆盖率统计设计

`documentKey` 可以支持 docs 覆盖率统计。

示例统计：

```text
total documentKeys: 20
both en + zh: 8
en only: 7
zh only: 5
missing zh: 7
missing en: 5
```

第一阶段可以做 CLI 或 studio 页面统计。

推荐先做 DB 查询函数：

```ts
getDocsLocaleCoverage()
```

返回：

```ts
{
  totalDocumentsWithKey: number;
  bothLocales: number;
  enOnly: number;
  zhOnly: number;
  missingEn: Array<{ documentKey: string; availableSlug: string }>;
  missingZh: Array<{ documentKey: string; availableSlug: string }>;
}
```

## 实施步骤建议

### Phase 1：数据库与类型

- Prisma schema 新增 `DocsDocument.documentKey String? @unique`
- 新增 migration
- 运行 `pnpm db:generate`
- 更新 DB import types
- 更新 web importer types

### Phase 2：Importer 接入

- `.docs.md` frontmatter 支持 `documentKey`
- validation 增加 documentKey 格式校验
- DB import 使用 documentKey 查找 DocsDocument
- 保持旧 `locale + slug` fallback

### Phase 3：验证导入

准备两篇文档：

```text
documentKey: document-key-test
locale: en
slug: document-key-test
```

```text
documentKey: document-key-test
locale: zh
slug: document-key-test-zh
```

验证：

- 两篇文章最终属于同一个 `DocsDocument`
- 有两条 `DocsDocumentLocale`
- `/en/docs/document-key-test` 可访问
- `/zh/docs/document-key-test-zh` 可访问

### Phase 4：语言切换与覆盖率

- 查询同 document 下可用 locale
- 页面层接入语言切换目标
- 增加覆盖率统计

## 暂不处理

第一阶段暂不处理：

- 自动翻译
- 自动生成 documentKey
- 自动合并旧文章
- 复杂 fallback 页面
- collection 的 collectionKey
- 全站 UI 文案覆盖率

## 当前风险

- 如果 documentKey 拼错，会创建新的 DocsDocument，导致中英文未绑定。
- 如果 locale + slug 已经被其他 document 占用，需要明确报错，不能静默覆盖。
- 如果旧文章没有 documentKey，语言切换无法覆盖这些文章。
- 如果 documentKey 直接必填，会影响现有导入样例和旧内容。

## 推荐下一步

先实现：

```text
DocsDocument.documentKey String? @unique
```

并让 `.docs.md` 可写：

```md
documentKey: first-real-single
```

第一阶段目标：

```text
同一个 documentKey 的 en/zh 文章进入同一个 DocsDocument
```

等这个稳定后，再做语言切换和覆盖率统计。

## Commit 建议

```text
docs: investigate docs document key design
```

