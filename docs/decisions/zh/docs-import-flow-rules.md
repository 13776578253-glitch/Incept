# Docs 导入流程规则

## 目标

本文定义当前 docs import 的第一阶段规则：

- 什么样的文章可以导入
- 如何执行导入
- 导入前如何校验
- 校验出错如何修改
- 导入成功后写入哪些数据

当前 import 属于内部能力，不进入前台导航。

## 当前入口

命令行入口：

```powershell
pnpm docs:import --file <path>
```

可选参数：

```powershell
pnpm docs:import --file <path> --replace
pnpm docs:import --file <path> --dry-run
```

当前脚本位置：

```text
scripts/docs-import.mjs
```

导入预览页面：

```text
http://localhost:3000/en/docs/import-preview/{draftId}
```

## 当前可导入的文章类型

| 类型 | routeType | 最终路由 | 适用场景 | 当前状态 |
| --- | --- | --- | --- | --- |
| 单文章 | `singleArticle` | `/{locale}/docs/{slug}` | 独立文章、独立说明页、普通 docs 条目 | 已支持 |
| 集合文章 | `collectionArticle` | `/{locale}/docs/series/{collectionSlug}/{slug}` | 属于某个 collection 的有序文章 | 已支持 |

暂不支持：

- 批量导入多篇文章
- 直接导入整个 collection manifest
- draft 状态导入
- archived 状态导入
- 从 Markdown / MDX 直接导入
- 从前台页面上传导入

## 导入源文件格式

导入源文件是一个 TypeScript 文件。

它必须导出一个 `DocsImportArticleSource` 对象。

支持两种导出方式：

```ts
export default articleSource;
```

或：

```ts
export const articleSource = { ... };
```

读取逻辑位置：

```text
apps/web/src/features/docs/importer/source-loader.ts
```

示例文件：

```text
apps/web/src/features/docs/importer/examples/standalone-import-sample.ts
apps/web/src/features/docs/importer/examples/document-shells-import-sample.ts
```

## 示例文章

### 单文章示例

文件：

```text
apps/web/src/features/docs/importer/examples/standalone-import-sample.ts
```

用途：

- 验证 `singleArticle` 导入。
- 验证导入后能以独立文章出现在 docs 首页。
- 验证最终路由为 `/en/docs/standalone-import-sample`。

核心 meta：

```ts
routeType: 'singleArticle'
layoutMode: 'contentOnly'
slug: 'standalone-import-sample'
```

### 集合文章示例

文件：

```text
apps/web/src/features/docs/importer/examples/document-shells-import-sample.ts
```

用途：

- 验证 `collectionArticle` 导入。
- 验证文章进入 `document-shells` collection。
- 验证最终路由为 `/en/docs/series/document-shells/importer-sample-shell`。

核心 meta：

```ts
routeType: 'collectionArticle'
collectionSlug: 'document-shells'
collectionTitle: 'Document shells'
position: 99
```

## 导入流程表

| 步骤 | 文件 | 输入 | 输出 | 职责 |
| --- | --- | --- | --- | --- |
| 1 | `scripts/docs-import.mjs` | `--file` 路径 | draft 信息和 preview URL | 命令行入口 |
| 2 | `source-loader.ts` | 本地 TS 文件路径 | `DocsImportArticleSource` | 动态读取导入源文件 |
| 3 | `validation.ts` | `DocsImportArticleSource` | `normalizedSource` + `issues` | 校验并补默认值 |
| 4 | `create-draft.ts` | 文件路径、replace 标记 | `DocsImportDraft` | 创建导入草稿 |
| 5 | `draft-store.ts` | `DocsImportDraft` | `.docs-import-drafts/{draftId}.json` | 保存草稿 |
| 6 | `import-preview` 页面 | `draftId` | 预览界面 | 人工 review |
| 7 | `confirm/route.ts` | `draftId` | 写入数据库并跳转正式页面 | 确认导入 |
| 8 | `packages/db/src/docs/import.ts` | normalized source | Prisma 写库结果 | 执行 DB upsert |

## 必填字段

所有文章都必须提供：

| 字段 | 说明 | 错误码 |
| --- | --- | --- |
| `meta.locale` | 当前语言，当前支持 `en` / `zh` | 当前未强校验枚举 |
| `meta.routeType` | `singleArticle` 或 `collectionArticle` | 当前未显式缺失校验 |
| `meta.slug` | 文章 slug | `missing_slug` |
| `meta.title` | 文章标题 | `missing_title` |
| `meta.summary` | 文章摘要 | `missing_summary` |
| `body.sections` | 至少一个 section | `empty_sections` |

`collectionArticle` 额外必须提供：

| 字段 | 说明 | 错误码 |
| --- | --- | --- |
| `meta.collectionSlug` | collection slug | `missing_collection_slug` |
| `meta.collectionTitle` | collection 标题 | `missing_collection_title` |
| `meta.position` | collection 内排序位置，必须是整数 | `missing_position` |

## 默认值规则

| 字段 | 默认值 |
| --- | --- |
| `meta.kind` | `article` |
| `meta.accessRole` | `guest` |
| `meta.publishedAt` | 当前时间 |
| `meta.layoutMode` for `singleArticle` | `contentOnly` |
| `meta.layoutMode` for `collectionArticle` | `sidebar` |

## 禁止规则

| 场景 | 规则 | 错误码 |
| --- | --- | --- |
| `singleArticle` | 不能提供 `collectionSlug` | `collection_slug_not_allowed` |
| `singleArticle` | 不能提供 `position` | `position_not_allowed` |
| `collectionArticle` | 不能使用 `contentOnly` layout | `content_only_collection` |
| 任意文章 | section id 不能重复 | `duplicate_section_id` |
| 任意文章 | block id 不能重复 | `duplicate_block_id` |
| 任意文章 | `publishedAt` 必须可解析为日期 | `invalid_published_at` |

## Warning 规则

未知字段不会阻止导入，但会产生 warning：

| 场景 | 错误码 | 处理方式 |
| --- | --- | --- |
| `meta` 出现未允许字段 | `unknown_field` | 字段会被忽略，建议删除或加入正式 schema |
| `body` 出现未允许字段 | `unknown_field` | 字段会被忽略，建议删除或加入正式 schema |

## 校验出错如何修改

| 错误类型 | 修改方式 |
| --- | --- |
| `missing_slug` | 在 `meta.slug` 填入非空字符串 |
| `missing_title` | 在 `meta.title` 填入非空标题 |
| `missing_summary` | 在 `meta.summary` 填入非空摘要 |
| `empty_sections` | 在 `body.sections` 中至少提供一个 section |
| `invalid_published_at` | 删除 `publishedAt` 让系统使用当前时间，或改成合法日期字符串 |
| `collection_slug_not_allowed` | 如果是单文章，删除 `collectionSlug` |
| `position_not_allowed` | 如果是单文章，删除 `position` |
| `missing_collection_slug` | 如果是集合文章，补 `collectionSlug` |
| `missing_collection_title` | 如果是集合文章，补 `collectionTitle` |
| `missing_position` | 如果是集合文章，补整数 `position` |
| `content_only_collection` | 集合文章使用 `sidebar`，或删除 `layoutMode` 让系统默认处理 |
| `duplicate_section_id` | 修改重复 section 的 `id` |
| `duplicate_block_id` | 修改重复 block 的 `id` |
| `unknown_field` | 确认字段是否需要；不需要就删除，需要则先扩展 importer schema |

修改后重新运行：

```powershell
pnpm docs:import --file <path>
```

## 写库规则

DB 写入逻辑位置：

```text
packages/db/src/docs/import.ts
```

### 单文章写入

`singleArticle` 会写入：

- `docs_documents`
- `docs_document_locales`

唯一目标：

```text
locale + slug
```

如果同一 `locale + slug` 已存在：

- 没有 `--replace`：导入失败
- 带 `--replace`：删除该 locale 旧内容并重新创建 locale 行

### 集合文章写入

`collectionArticle` 会写入或更新：

- `docs_collections`
- `docs_collection_locales`
- `docs_documents`
- `docs_document_locales`
- `docs_collection_items`

collection 定位：

```text
locale + collectionSlug
```

文章定位：

```text
locale + slug
```

排序定位：

```text
collectionId + position
```

如果同一 collection 中 position 已被其他文章占用：

- 导入失败
- 需要修改 `meta.position`

如果同一 `locale + slug` 已存在：

- 没有 `--replace`：导入失败
- 带 `--replace`：替换已有文章 locale 内容，并更新 collection item 关系

## 成功后的行为

确认导入成功后：

- 删除 `.docs-import-drafts/{draftId}.json`
- 跳转到正式 docs 页面
- URL 带 `?imported=1`

单文章跳转：

```text
/{locale}/docs/{slug}?imported=1
```

集合文章跳转：

```text
/{locale}/docs/series/{collectionSlug}/{slug}?imported=1
```

## 当前风险和待明确项

| 项目 | 当前状态 | 建议 |
| --- | --- | --- |
| 权限 | confirm route 只有 TODO，还没有真实管理员校验 | 写库前必须补权限 |
| block schema | importer source 依赖当前 `DbDocsSection`，需要持续对齐 block-system | 导入前应增加 block 类型细校验 |
| locale | 当前类型约束为 `en` / `zh`，运行时缺少显式校验 | validation 中补运行时校验 |
| routeType | 当前类型约束存在，运行时缺少显式缺失校验 | validation 中补运行时校验 |
| draft 存储 | 当前写入 `.docs-import-drafts` 本地文件 | 后续可迁移到 DB draft 表 |
| 批量导入 | 当前只支持单文件单文章 | 后续另设 manifest 模式 |
| `--replace` | 当前按 `locale + slug` 替换 | 后续文档中保持这个规则，避免误以为按 title 或 id 替换 |

## 第一阶段推荐使用流程

1. 复制一个示例 source 文件。
2. 修改 `meta`。
3. 修改 `body.sections`。
4. 运行 dry run：

```powershell
pnpm docs:import --file <path> --dry-run
```

5. 没有 error 后生成 draft：

```powershell
pnpm docs:import --file <path>
```

6. 打开输出的 preview URL。
7. 在页面中检查：

- route 是否正确
- validation 是否为 0 error
- 阅读样式是否正确
- collection sidebar 是否正确
- outline 是否正确

8. 点击 `Confirm import`。
9. 在正式 docs 页面检查导入结果。
