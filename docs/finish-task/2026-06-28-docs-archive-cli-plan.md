# Docs Archive CLI 待处理计划

[2026-06-28] - Pending plan

## 目标

新增文章归档能力，让 docs 系统具备基础内容生命周期：

```text
import -> preview -> confirm -> published
replace -> preview -> confirm -> updated
archive -> hidden from public docs
```

第一版只做软删除，不做物理删除。

## 计划命令

```powershell
pnpm docs:archive --locale zh --slug only-test
```

dry-run:

```powershell
pnpm docs:archive --locale zh --slug only-test --dry-run
```

## 核心行为

- 按 `locale + slug` 定位文章。
- 只更新 `docs_document_locales.status`。
- 将目标 locale 的文章状态从 `published` 改为 `archived`。
- 不删除 `DocsDocument`。
- 不删除 `DocsDocumentLocale`。
- 不删除正文 `bodyJson`。
- 不删除 collection item 关系。
- 不影响其他 locale。

示例：

```text
archive zh/only-test
```

只影响：

```text
/zh/docs/only-test
```

不影响：

```text
/en/docs/only-test
```

## 需要新增的能力

### DB API

新增：

```ts
archiveDocsArticleLocale({ locale, slug })
```

职责：

- 查找 `DocsDocumentLocale` 的唯一键 `locale + slug`。
- 找不到则返回明确错误。
- 找到则更新 `status: archived`。
- 返回归档结果。

建议返回：

```ts
{
  documentId: number;
  locale: 'en' | 'zh';
  slug: string;
  previousStatus: string;
  archived: boolean;
}
```

### CLI

新增：

```text
scripts/docs-archive.mjs
```

职责：

- 解析 `--locale`
- 解析 `--slug`
- 解析 `--dry-run`
- 调用 DB archive API
- 输出归档结果
- 出错时以非 0 状态退出

### package.json

新增根命令：

```json
{
  "docs:archive": "pnpm --filter @incept/db exec tsx ../../scripts/docs-archive.mjs"
}
```

### DB 导出

在：

```text
packages/db/src/docs/index.ts
```

导出：

```ts
archiveDocsArticleLocale
```

## 当前查询层判断

当前 docs 查询已经按 `status: published` 过滤。

涉及位置：

```text
packages/db/src/docs/queries/home.ts
packages/db/src/docs/queries/article.ts
packages/db/src/docs/queries/collection.ts
packages/db/src/docs/library.ts
```

因此归档后预期行为：

- `/zh/docs` 不展示 archived 文章。
- `/en/docs` 不展示 archived 文章。
- 直接访问 archived single article 返回 not found。
- 直接访问 archived collection article 返回 not found。
- studio/library 当前也只展示 published，所以 archived 文章暂时不会出现在 library。

## 验证计划

### dry-run

```powershell
pnpm docs:archive --locale zh --slug only-test --dry-run
```

预期：

- 不写数据库。
- 输出将要归档的文章信息。

### 正式归档

```powershell
pnpm docs:archive --locale zh --slug only-test
```

预期：

- status 更新为 `archived`。
- 再次执行不破坏数据。
- 已归档文章可提示 already archived。

### 页面验证

启动项目：

```powershell
pnpm dev
```

检查：

```text
http://localhost:3000/zh/docs
http://localhost:3000/zh/docs/only-test
```

预期：

- docs 首页不再展示该文章。
- 直接访问文章返回 not found。

### 类型检查

```powershell
pnpm --filter @incept/db exec tsc --noEmit
pnpm --filter web exec tsc --noEmit
```

## 暂不处理

- 不做物理删除。
- 不做恢复命令。
- 不做批量归档。
- 不做后台按钮。
- 不清理 collection item。
- 不处理 `documentKey`。
- 不处理全站 i18n 覆盖率。

## 后续建议

归档能力完成后，下一阶段再处理：

- `documentKey`
- 中英文文章绑定
- docs 语言切换
- 全站中文 / 英文 UI 文案覆盖率
- media publish pipeline

## Commit 建议

```text
docs: record docs archive cli plan
```

