[2026-05-09 01:10] - Update by AI完成改动:
- 将 docs 从“单文章 + section 左栏”升级为“单文章 / 集合”双发布对象模型。
- 新增集合文章路由 `/{locale}/docs/series/[collectionSlug]/[articleSlug]`，并将 `/reference` 改为重定向到 `document-shells` 集合首篇文章。
- 正式引入集合数据模型、首页混合集合/单文章条目模型，并把 `document-shells` 拆分为一个三篇文章的测试合集。

## 本轮核心改动

- Prisma schema 新增：
- `DocsCollection`
- `DocsCollectionLocale`
- `DocsCollectionItem`

- docs 查询层新增：
- `findPublishedDocsCollectionArticleBySlugs`
- `listPublishedDocsHomeEntries`

- docs web 层新增：
- 集合文章 loader
- `series` 路由入口
- 首页集合 / 单文章图区分
- 集合文章页左栏自动生成为“同集合内文章列表”

## 路由规则变化

- `/{locale}/docs/[slug]`
  - 只服务单文章
- `/{locale}/docs/series/[collectionSlug]/[articleSlug]`
  - 服务集合内文章
- `/{locale}/docs/reference`
  - 重定向到 `document-shells / shell-foundations`
- 旧 `/{locale}/docs/document-shells`
  - 不再作为正文路由保留

## Seed 变化

- `document-shells` 已不再是单篇文章
- 当前它是一个正式集合
- 首篇文章：
- `shell-foundations`
- 第二篇文章：
- `layout-and-navigation`
- 第三篇文章：
- `workflow-and-validation`

这三篇文章已具备足够 section 数量，适合继续测试：

- 集合侧栏跳转
- 右侧目录高亮
- 长页面滚动
- 多文章合集阅读体验

## 当前状态

- 本地数据库链路已跑通：
- `pnpm db:deploy`
- `pnpm db:generate`
- `pnpm db:seed`
- Prisma schema、migration、seed、查询层、web loader 目前已能在本地配合工作。
- `/[locale]` 路由恢复正常，`next-intl` 的 request config 已兼容当前安装版本。

## 本轮额外修复

- 修复了 `DocsCollection.createdBy` 缺少 `User.collections` 反向关系的问题。
- 修复了 `seed.ts` 中 `sidebarJson` 被推导为 `unknown` 导致 Prisma create input 报错的问题。
- 修复了 Windows 下 Prisma Client 重新生成时的文件占用排查路径。
- 修复了 `next-intl` 请求配置仍使用旧式 `locale` 读取方式，导致 `/zh`、`/en` 可能直接 404 的问题。

## 当前建议验证

- 打开 `/{locale}/docs`
- 打开 `/{locale}/docs/reference`
- 打开 `/{locale}/docs/series/document-shells/shell-foundations`
- 打开 `/{locale}/docs/series/document-shells/layout-and-navigation`
- 打开 `/{locale}/docs/series/document-shells/workflow-and-validation`
- 确认旧 `/{locale}/docs/document-shells` 不再作为正文路由存在

## 遗留问题

- 集合文章页虽然已经完成“左侧集合导航 / 右侧 section 目录”职责分离，但三栏宽度、左右留白、吸附位置和滚动节奏还需要继续微调。
- `1800px` 以下隐藏右侧目录、`1023px` 以下隐藏双侧栏的响应式阈值已接入，但仍需要实机继续验证中间尺寸的阅读体验是否稳定。
- docs 首页现在已经支持“集合 / 单文章”混合展示，但图标弱化程度、条目对齐、锁态文案与权限标识位置仍有继续打磨空间。
- `/{locale}/docs/archive` 目前仍是未来扩展位，尚未进入正式实现阶段。
- 旧路径切换为新 `series` 路由后，仍建议继续做一次从首页点击进入合集首篇文章、再通过左栏切换同合集文章的完整手动回归。

## 提交说明建议

- 这次提交适合作为“docs 路由模型从单文章升级到单文章 + 集合”的阶段性提交。
- 推荐 commit message：
- `feat: add docs collections, series routing, and collection-aware sidebar behavior`
