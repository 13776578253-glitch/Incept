# Docs 内容导入与合集批次操作手册

本文说明如何从独立内容目录导入单篇 Docs 文章和文件夹式文章合集。适用于开发环境和本地发布预览，命令均从 Incept 仓库根目录执行。

## 1. 导入模型

导入链路分为四步：

```text
内容目录 -> CLI 扫描与解析 -> Owner Preview -> Confirm -> PostgreSQL
```

文章源文件和原始图片不放进 Git 仓库。导入器将 Markdown-like 文件转换成现有 `DocsImportArticleSource`，再写入 `DocsDocument`、locale、合集导航节点和发布事件。

两种 CLI 模式如下：

```powershell
# 单篇文章
pnpm docs:import --file <path> [--replace] [--dry-run]

# 一个完整的合集目录批次
pnpm docs:import --dir <collection-directory> [--replace] [--dry-run]
```

`--file` 是一篇文章的导入单元；`--dir` 是一个合集的导入单元。`--dir` 不会把文章合并成一篇大文章，每个 `.docs.md` 仍会创建或更新独立的 `DocsDocument`。

## 2. 配置内容根目录

在未跟踪的 `apps/web/.env.local` 中配置绝对路径：

```env
DOCS_CONTENT_ROOT="D:\\Desktop\\docs-push"
```

该目录可以放在仓库外，例如：

```text
D:\Desktop\docs-push\
├─ 2026-09-02\
│  └─ first-article.docs.md
└─ account-access\
   ├─ 01-overview.docs.md
   └─ 02-identity\
      ├─ 01-principal.docs.md
      └─ 02-session.docs.md
```

`--file` 和 `--dir` 可以接收内容根目录下的相对路径，也可以接收绝对路径：

```powershell
pnpm docs:import --file 2026-09-02/first-article.docs.md --dry-run
pnpm docs:import --dir account-access --dry-run
```

Markdown-like 源文件必须位于 `DOCS_CONTENT_ROOT` 内。根目录未配置、源文件在根目录外或目录不存在时，导入会在解析前失败。

## 3. 单篇文章导入

### 3.1 编写文件

最小单篇文章：

```md
---
documentKey: first-article
locale: zh
routeType: singleArticle
slug: first-article
title: 第一篇文章
summary: 文章摘要。
kind: article
accessRole: guest
isListed: true
---

# 开始

这是文章正文。
```

`documentKey` 是跨语言稳定身份。新文章建议始终填写，并在同一文章的中英文版本中保持一致。

正文语法遵循 Markdown-like v1。`#` 创建 section，`##` 到 `####` 创建正文标题；图片、代码、列表、callout 等写法见 [docs-push README](../../../apps/web/src/features/docs/importer/docs-push/README.md) 和 Markdown-like 决策文档。

### 3.2 Dry-run

先执行只读校验：

```powershell
pnpm docs:import --file 2026-09-02/first-article.docs.md --dry-run
```

重点检查：

- `Route type` 是否为预期值。
- `Target route` 是否正确。
- `Errors` 必须为 `0`。
- 图片操作中的源路径和最终 URL 是否正确。
- 是否误用了已经存在的 slug 或 locale。

`--dry-run` 不写 draft、不写数据库、不复制本地图片。

### 3.3 创建 Preview 并确认发布

校验通过后执行：

```powershell
pnpm docs:import --file 2026-09-02/first-article.docs.md
```

CLI 会输出 Preview URL。使用 Owner session 打开该 URL，检查标题、正文、代码高亮和图片，然后点击 `Confirm import`。

创建 draft 不等于发布。只有 Owner 在 Preview 页面确认后，文章才会写入数据库。

### 3.4 更新单篇文章

修改源文件后，先 dry-run，再使用 `--replace` 创建替换 draft：

```powershell
pnpm docs:import --file 2026-09-02/first-article.docs.md --dry-run
pnpm docs:import --file 2026-09-02/first-article.docs.md --replace
```

确认后会替换当前 locale 的文章内容，并写入一条 `DocsPublicationEvent`，事件类型为 `replaced`。不加 `--replace` 时，已有 locale 不能被覆盖。

## 4. 合集目录导入

### 4.1 目录规则

推荐结构：

```text
account-access\
├─ 01-overview.docs.md
├─ 02-identity\
│  ├─ 01-principal.docs.md
│  └─ 02-session.docs.md
├─ 03-revocation\
│  └─ 01-revoke.docs.md
└─ 04-empty-folder\
```

规则：

- 带数字前缀的 `.docs.md` 是文章节点。
- 带数字前缀的目录是空 folder 节点，可以包含文章或子 folder。
- 数字前缀决定同级 `position`，必须从 `01` 开始连续编号。
- folder 最多嵌套三层。
- `assets`、`media` 等无数字前缀目录不会进入导航树。
- 空 folder 会保留在导航树中。
- folder 不保存正文，文章仍然是独立文档。

### 4.2 合集身份

每篇合集文章都要填写相同的 `collectionKey`：

```yaml
routeType: collectionArticle
collectionKey: account-access
collectionSlug: account-access
collectionTitle: 账户访问
```

字段职责不同：

| 字段 | 用途 |
| --- | --- |
| `collectionKey` | 数据库中的合集稳定身份，不应随标题或 URL 改变。 |
| `collectionSlug` | 当前 locale 的合集 URL，可以中英文不同。 |
| `collectionTitle` | 当前 locale 的合集标题，可以中英文不同。 |
| `documentKey` | 合集中单篇文章的稳定身份。 |

例如，下面两个目录名不是合集身份：

```text
account-access\
account-access-new\
```

如果两个目录内文章使用相同的 `collectionKey`，导入器会把它们定位到同一个数据库合集。要创建两个不同合集，必须使用不同的 `collectionKey`。

### 4.3 合集文章文件

一个合集文章示例：

```md
---
documentKey: principal
locale: zh
routeType: collectionArticle
slug: principal
title: Principal
summary: 访问身份的基础模型。
collectionKey: account-access
collectionSlug: account-access
collectionTitle: 账户访问
position: 1
accessRole: pro
---

# Principal

文章正文。
```

目录批次中，文件名数字前缀是最终排序来源。例如：

```text
02-identity/01-principal.docs.md
```

文章最终位于 `identity` folder 下，使用该层级中的 `position: 1`。因此目录批次不应同时依赖 frontmatter 的 position 排序；frontmatter 中的值应与文件名保持一致，目录扫描结果才是批次的权威顺序。

### 4.4 合集 dry-run

执行：

```powershell
pnpm docs:import --dir account-access --dry-run
```

预期输出包含：

```text
Docs collection directory scan
- Directory: D:\Desktop\docs-push\account-access
- Collection key: account-access
- Locale: zh
- Articles: 4
- 01 overview.docs.md (article)
- 02 identity (folder)
  - 01 principal.docs.md (article)
  - 02 session.docs.md (article)
- Errors: 0
- Warnings: 0

Batch changes
- created: overview (article)
- created: folder-root-02 (folder)
```

`--dry-run` 只扫描、解析、校验和计算 diff，不创建 draft，也不写数据库。

### 4.5 创建合集 Preview 和发布

```powershell
pnpm docs:import --dir account-access
```

命令会创建一个批次 draft 并输出 Preview URL。Owner 在页面中检查：

- 合集标题和合集 route。
- 文章列表和文章 route。
- folder/article 的嵌套层级。
- 同级顺序。
- 每篇文章正文与媒体。
- `Batch changes` 中的变化类型。

确认后，合集中的 folder、article、locale 和发布事件会在一个数据库事务中写入。任一文章或 folder 写入失败，整批回滚。

## 5. 合集更新、diff 与重命名

修改合集后执行：

```powershell
pnpm docs:import --dir account-access --dry-run
pnpm docs:import --dir account-access --replace
```

批次 diff 可能显示以下状态：

| 状态 | 含义 |
| --- | --- |
| `created` | 新文章或新 folder。 |
| `updated` | 正文、metadata、父节点或 position 发生变化。 |
| `unchanged` | 当前数据库内容与源文件完全一致，会跳过写入。 |
| `renamed` | folder 在相同父节点和 position 上名称发生变化。 |
| `removed` | 源目录中已经不存在的旧节点。 |

### Folder 重命名

folder 的稳定识别依据是父节点和同级 position，而不是显示名称。例如：

```text
旧：02-identity\
新：02-access-model\
```

只要父级和 position 不变，导入器会更新原 folder 的 label，并显示 `renamed`，不会额外创建第二个 folder。

如果同时改变了父级和 position，系统可能把它识别为移动或新旧节点变化。修改目录结构后必须检查 Preview，不要直接跳过确认。

### 删除节点

使用 `--replace` 时，源目录中不存在的旧节点会被标记为 inactive：

- 它们不再显示在合集导航中。
- 文章对应的 `DocsDocument` 不会被物理删除。
- 子 folder 和子文章会递归失效。
- 发布历史和文章数据仍保留，避免误删后无法恢复。

因此，删除源目录文件后不要只检查文件系统，还要在 Preview 中确认 `removed` 列表符合预期。

## 6. 合集文章中的图片和其他媒体

媒体目录必须使用无数字前缀名称：

```text
account-access\
├─ assets\
│  └─ shared-architecture.png
├─ 01-overview.docs.md
└─ 02-identity\
   ├─ assets\
   │  └─ principal-flow.png
   ├─ 01-principal.docs.md
   └─ 02-session.docs.md
```

文章图片路径相对于当前 `.docs.md` 文件：

```md
![Principal flow](./assets/principal-flow.png)
```

如果图片与文章同级放在 `assets/` 目录，也可以只写文件名，导入器会在文章目录和文章同级的 `assets/` 目录中依次查找：

```md
![Principal flow](principal-flow.png)
```

显式的相对路径优先；建议新文章使用 `./assets/name.png`，裸文件名主要用于兼容已有文章。

嵌套文章引用合集根目录共享图片：

```md
![Shared architecture](../assets/shared-architecture.png)
```

导入器会：

1. 校验图片仍在 `DOCS_CONTENT_ROOT` 内。
2. 拒绝缺失文件、目录、非图片扩展名和越界路径。
3. 根据图片内容计算 hash。
4. 生成稳定 URL，例如 `/_docs-media/<hash>.png`。
5. 正式导入时复制到 `apps/web/public/_docs-media/`。
6. 相同内容的图片只保留一个镜像文件。

原始图片不进入 Git；`public/_docs-media/` 是本地可删除的预览镜像，也应由 `.gitignore` 忽略。数据库正文保存最终网站 URL，不保存本机绝对路径。

外部图片可以直接使用：

```md
![External image](https://example.com/image.png)
```

外部 URL 不会被复制到本地媒体目录。

## 7. 多语言合集

当前 `--dir` 批次只处理一个 locale。中文和英文应分别导入，但使用相同的 `collectionKey` 与文章 `documentKey`：

```text
zh/account-access/01-overview.docs.md
en/account-access/01-overview.docs.md
```

两次 source 可以使用不同的：

- `collectionSlug`
- `collectionTitle`
- 文章 `slug`
- 文章标题、摘要和正文

但必须保持一致的：

- `collectionKey`
- 每篇文章的 `documentKey`
- 同篇文章的 position
- 合集和文章的 `accessRole`

这样数据库中只有一个合集身份，每个 locale 各有一条合集 metadata；同一个 `documentKey` 的多语言文章仍然是一个逻辑文章，不会重复计算写作贡献。

## 8. 自动化检查

运行 Markdown-like fixture：

```powershell
pnpm docs:check-markdown-like
```

运行媒体校验：

```powershell
pnpm docs:check-media
```

运行单篇和合集 CLI 回归：

```powershell
pnpm docs:check-import-cli
```

该检查会创建临时内容根目录，验证 `--file` 和 `--dir --dry-run`，结束后自动删除临时文件，不会修改正式内容。

代码和数据库修改后运行：

```powershell
pnpm db:generate
pnpm db:deploy
pnpm --filter @incept/db exec tsc --noEmit
pnpm --filter web exec tsc --noEmit
git diff --check
```

如果 Prisma 在 Windows 上报告 `query_engine-windows.dll.node` 被占用，先停止正在运行的 Next、Node、Prisma 或旧 CLI 进程，再重新执行 `pnpm db:generate`。

## 9. 常见错误

### `DOCS_CONTENT_ROOT is required`

说明 CLI 没有读取到 `apps/web/.env.local` 中的环境变量。确认文件名、变量名和绝对路径正确，然后重新打开命令终端。

### `Errors: 0` 但打不开 Preview URL

`--dry-run` 不会写 draft，因此不会生成 Preview URL。去掉 `--dry-run` 后再次执行，并使用 Owner session 打开 CLI 输出的 URL。

### `collectionKey` 不一致

检查目录内所有 `.docs.md` 的 `collectionKey`。一个 `--dir` 批次必须只对应一个合集 key。

### 编号不连续或重复

同一目录下的数字前缀必须从 `01` 开始连续：

```text
正确：01-overview、02-guides、03-api
错误：01-overview、03-api
错误：01-overview、01-guides
```

### 图片找不到

确认图片路径相对于当前文章文件，且图片位于 `DOCS_CONTENT_ROOT` 内。合集中的 `assets` 目录必须不带数字前缀，否则会被解释成导航 folder。

### Confirm 失败

先回到源文件重新执行 dry-run，并使用新生成的 draft。旧 draft 不会自动跟随源文件变化；存在 validation error 时 Confirm 会被拒绝。

## 10. 推荐标准流程

日常新增或修改内容时按以下顺序操作：

1. 在 `DOCS_CONTENT_ROOT` 中创建或修改 `.docs.md` 和 `assets/` 媒体。
2. 运行对应的 `--file` 或 `--dir --dry-run`。
3. 检查 `Errors: 0`、路由、合集树、媒体操作和 Batch changes。
4. 新建或更新时去掉 `--dry-run`，生成 Owner Preview。
5. 在浏览器中检查最终页面。
6. 确认无误后点击 `Confirm import`。
7. 发布后打开正式文章和合集首页，确认路由、权限、图片和导航。
8. 修改合集目录后，重点核对 `renamed`、`removed` 和 `unchanged` 项。

长文章的右侧 `On this page` 会保留固定标题，并将目录列表限制在视口约 40% 高度内；列表仍可使用滚轮或触控板滚动，底部渐变表示还有后续条目。阅读位置进入列表外的 section 时，目录会平滑滚动并使当前活动条目回到可见区域。

不要直接修改数据库中的正文或导航节点来绕过导入流程；源文件、CLI Preview 和 Confirm 才是当前内容发布的标准入口。
