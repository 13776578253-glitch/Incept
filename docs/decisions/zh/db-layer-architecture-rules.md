# DB 分层架构规则

## 目标

本文定义数据库开发的稳定架构边界，以及数据库数据与 UI 数据之间的匹配层。

它适用于当前的 `docs` 产品线，并应随着仓库增长持续复用。

## 分层职责

### 1. DB Layer

位置：

- `packages/db/prisma/*`
- `packages/db/src/client.ts`

职责：

- 负责 `schema.prisma`
- 负责 migrations
- 负责 seed 数据
- 负责 Prisma client 生命周期
- 定义面向数据库的查询 DTO

这一层是以下内容的唯一事实来源：

- 表结构
- 枚举结构
- 关系型数据形态
- 本地 seed 假设

### 2. Query Layer

位置：

- `packages/db/src/docs/queries.ts`
- `packages/db/src/docs/types.ts`

职责：

- 用显式 `select` 查询 Prisma
- 返回稳定的 DB DTO
- 对 JSON 字段做最小必要的结构校验
- 对格式错误的存储数据快速失败

这一层应当返回：

- 面向数据库的记录
- 绝不直接返回 UI 组件
- 绝不返回 React 专用模型

### 3. Mapper Layer

位置：

- `apps/web/src/server/docs/mappers.ts`

职责：

- 把 DB DTO 转成可供 UI 使用的页面模型
- 将 locale/document 行结构整理成 feature 级数据契约
- 在 DB 结构演进时保持 UI 稳定

这是以下两者之间的翻译边界：

- 数据库形态
- 页面渲染形态

### 4. Access / Loader Layer

位置：

- `apps/web/src/server/docs/access.ts`
- `apps/web/src/server/docs/loaders.ts`

职责：

- 调用 DB 查询函数
- 应用访问控制规则
- 组装供路由消费的最终页面数据
- 决定路由返回数据还是 `notFound`

这一层负责：

- access role 检查
- 面向路由的数据组装
- 仅服务端的编排逻辑

### 5. Route Layer

位置：

- `apps/web/src/app/[locale]/docs/*`

职责：

- 读取路由参数
- 调用 loaders
- 处理 `notFound`
- 把页面模型传给 features

这一层应保持轻量。

### 6. UI Layer

位置：

- `apps/web/src/features/docs/*`

职责：

- 渲染页面模型
- 负责视觉结构
- 负责交互呈现

这一层不应知道以下实现细节：

- Prisma
- 表名
- migrations
- DB DTO 内部结构

## 禁止的跨层行为

### DB Layer 不能做的事

- 从 `apps/web` 导入
- 导入 UI 页面模型
- 包含路由逻辑
- 包含与 UI 行为耦合的权限判断逻辑

### Query Layer 不能做的事

- 直接把 Prisma row payload 返回给 UI
- 生成面向 React 的展示文本或标签
- 执行路由导航逻辑

### Mapper Layer 不能做的事

- 直接跑 Prisma 查询
- 负责路由分支判断
- 负责数据库写入逻辑

### Route Layer 不能做的事

- 写原始 Prisma 查询
- 在路由里内联重塑 DB rows
- 复制本该由 loaders 负责的权限逻辑

### UI Layer 不能做的事

- 从 Prisma 导入
- 导入 DB DTO 类型
- 知道 `docs_documents` 或 `docs_document_locales`
- 对 migration 结构做假设

## 实操规则

1. 数据库结构变更从 `schema.prisma` 开始。
2. 每一次 schema 变更都必须配套 migration 更新。
3. Seed 变更应反映本地测试需求，而不是只为 UI 打补丁。
4. Query DTO 放在 `packages/db/src/docs/types.ts`。
5. UI 页面模型放在 `apps/web/src/features/docs/shared/types.ts`。
6. 新的 docs 路由必须消费 loaders，而不是直接跑 Prisma 查询。
7. `bodyJson`、`sidebarJson` 这类 JSON 字段在离开 `packages/db` 前，必须先在 query layer 完成校验。

## 当前 Docs 示例

对于当前 docs 读取流：

- Prisma 读取 `docs_documents` 和 `docs_document_locales`
- query layer 返回 DB DTO
- mapper layer 将其转换为 `DocsArticlePageModel` 或 `DocsHomePageModel`
- route layer 再把这些模型传给 docs features

这就是当前应被保持的基线模式。

