> **本文件已于 2026-09-23 归档。** 仅作历史保留。这是一份**入门稿**，讲的是如何把 `docs` 产品线从纯 mock 前端渲染迁到数据库驱动，写成的年代 `packages/db` 还不存在。
>
> **已知过期内容，不要再当环境搭建指南用：**
>
> - 文中说「v1 只有 `apps/web` 在跑」「`workspace` 以后再说」。现在 `packages/db` 与 `packages/music-player-core` 都已存在，且 `packages/db` 是正式 workspace 包，公开四个入口（`.`、`./docs`、`./access`、`./music`）。
> - 「Recommended Repo Shape」把 mapper 放在 `packages/db/src/docs/mappers.ts`、把查询放在单个 `queries.ts`。实际布局是 `packages/db/src/docs/queries/{article,collection,home,shared}.ts`，mapper 层在 `apps/web/src/server/docs/mappers.ts`。
> - 「Recommended Next Step」（建 `packages/db`、写 `schema.prisma`、建第一个 migration）早已完成：现有 13 个 migration。
> - 其 seed 策略（「1 到 2 个用户」「3 到 6 条 docs 列表项」「1 篇完整示例文章」「混用 `guest`/`member`/`pro`」）描述的是一个已不存在的 seed。`packages/db/prisma/seed.ts` 现在只创建一个 `system` 用户。
> - 其写入路径建议（「早期用 Server Actions 就够了」）没有成为实际设计：Docs 的写入路径是 CLI + Owner Preview/Confirm，Music 的写入路径是 `/api/internal/music/*` 下受 owner 保护的 route handler。
>
> **仍然成立、值得保留的部分：** 把数据库当作**共享领域层**而不是塞进 `apps/web` 里；读写分离（服务端渲染的读直接调查询函数，浏览器触发的写需要显式路由）；以及真实项目优先用 `migrate dev` 而非 `db push`，因为 `db push` 不留迁移历史。
>
> **当前指引请看：** Prisma 心智模型见 [prisma-basics-and-evolution.md](../../../decisions/zh/prisma-basics-and-evolution.md)，分层规则见 [db-layer-architecture-rules.md](../../../decisions/zh/db-layer-architecture-rules.md)，环境搭建见 [local-postgres-docker-setup.md](../../../runbooks/zh/local-postgres-docker-setup.md)。
>
> 原文位置：`docs/decisions/zh/docs-prisma-postgres-workflow.md`。以下为原文，除本抬头外未作改动。

# Docs Prisma + PostgreSQL 工作流草案

## 目标

本文说明如何把当前 `docs` 产品线从仅依赖前端 mock 渲染，逐步迁移到基于数据库的稳定工作流，技术栈包括：

- Next.js
- Prisma
- PostgreSQL

本文基于当前仓库状态编写：

- monorepo 结构
- v1 阶段只有 `apps/web` 在运行
- `docs` 是第一条要落地的产品线
- `workspace` 会在后续加入

---

## 核心原则

在这个项目里，应把数据库视为**共享领域层**，而不是埋在 `apps/web` 里的内部实现。

也就是说：

- UI 保持在 `apps/web`
- 数据库 schema、migration、seed 和查询辅助逻辑放在 `packages/db`
- `apps/web` 从 db 包中导入读写函数

这是更适合长期扩展的路径，因为后续：

- `workspace` 可以复用同一个数据库包
- 后台任务或管理工具也可以复用相同查询
- schema 与应用逻辑会更容易理解和维护

---

## 推荐仓库形态

建议结构：

```text
apps/
  web/
    src/
      app/
      features/
      server/
        docs/
          queries/
          mappers/

packages/
  db/
    package.json
    prisma/
      schema.prisma
      migrations/
      seed.ts
    src/
      client.ts
      docs/
        queries.ts
        mappers.ts
      index.ts
```

建议职责划分：

- `packages/db/prisma/schema.prisma`
  - 表结构与关系的唯一事实来源
- `packages/db/prisma/migrations/*`
  - 带版本的数据库变更记录
- `packages/db/prisma/seed.ts`
  - 本地与测试用 seed 数据
- `packages/db/src/client.ts`
  - Prisma client 单例
- `packages/db/src/docs/queries.ts`
  - 文档读写逻辑
- `apps/web/src/app/...`
  - 仅负责路由入口
- `apps/web/src/features/docs/...`
  - 仅负责 UI 渲染

---

## 为什么 Prisma 适合这个项目

Prisma 在这里合适，是因为它一次性提供了四个关键能力：

1. 用一个 schema 文件定义结构
2. 为应用查询生成带类型的 client
3. 用 migration 历史记录 schema 演进
4. 提供可预测的本地到生产工作流

对你当前阶段来说，最大的价值不是“少写 SQL”。

真正的价值在于：

- schema 变更是有版本记录的
- 代码能获得类型安全
- 本地数据库可以按步骤演进，而不会越来越乱

---

## 你最该先理解的四类文件

### 1. `schema.prisma`

它定义：

- 表
- 字段
- 枚举
- 关系
- 索引
- 唯一约束

你可以把它理解为数据库的类型化蓝图。

### 2. migration 文件

这些是自动生成的 SQL 快照，用于记录每一次 schema 变化。

例如：

- `20260506_init_docs`
- `20260510_add_seo_fields`
- `20260515_add_cover_image`

这些文件才是数据库演进的真实历史。

### 3. Prisma Client

它由 `schema.prisma` 生成。

应用会通过它，以带类型的方式查询 PostgreSQL，例如：

- 获取 docs 首页列表
- 根据 slug 和 locale 查文章
- 创建草稿文章

### 4. seed 脚本

它负责插入初始测试数据。

对当前项目来说，第一版 seed 应该尽量贴近现有 UI mock：

- docs 首页条目
- 一篇示例文章
- 如有需要，再加一两个用户或角色

---

## 推荐开发顺序

不要一开始先做创建 UI。

对这个仓库来说，更好的顺序是：

1. 先定稿 docs 读取流的 v1 schema
2. 搭建 Prisma + PostgreSQL + migrations
3. 把当前 mock docs 数据写成 seed
4. 将 `/docs` 与 `/docs/[slug]` 从 mock 读取切换为数据库读取
5. 验证端到端读取流程
6. 之后再加入 create/admin/edit 流程

原因：

- 读取流的 UI 已经基本设计完成
- 路由模型已经比较稳定
- 数据库接入风险更可控
- 你可以更早把 docs 先交付出来

如果太早做 create UI，你会在仍在变化的 schema 上设计表单和 mutation。

这通常会带来返工。

---

## 建议的 V1 数据库范围

第一阶段真正落数据库时，范围要尽量收窄。

只做：

- `users`
- `docs_documents`
- `docs_document_locales`

支持的读取流：

- docs 首页列表
- 基于 `locale + slug` 的文章详情页
- 根据 `access_role` 展示权限状态

先不要做：

- 修订历史
- 富文本编辑器后端
- tags
- 搜索
- 媒体库
- archive 专用额外表

---

## 在这个仓库里前后端如何连接

你问过：Next.js 项目是否还需要显式 API 接口。

短答案：

- 对服务端渲染读取来说，不一定需要
- 对浏览器触发的写入来说，通常还是需要

建议拆分方式如下。

### 读取路径

对于这些页面：

- `/{locale}/docs`
- `/{locale}/docs/[slug]`

直接使用服务端查询函数即可。

也就是：

- route/page 或 server component 调用服务端 helper
- server helper 再调用 `packages/db`
- 这些读取不需要额外的 REST API 层

这样能让第一版全栈实现更简单。

### 写入路径

对于后续这些操作：

- 创建文章
- 更新文章
- 发布文章

可以使用其一：

- Next.js Server Actions
- Route Handlers（`app/api/...`）

对当前项目来说，早期阶段大概率用 Server Actions 就够了。

所以结论是：

- 现在不需要一个庞大的外部 API 层
- 但你仍然需要清晰的服务端边界

---

## Migration 工作流

这一部分往往最容易让人一开始不确定，下面用直白方式解释。

### 什么是 migration

migration 是对一次 schema 变更的版本化描述。

例如：

- 新增一张表
- 重命名一列
- 让某个字段可空
- 新增唯一索引

当你修改 `schema.prisma` 时，Prisma 可以生成一个 migration 文件。

这个文件会提交进 git。

之后：

- 你的机器会执行它
- 队友的机器会执行它
- 生产环境也会执行它

这就是所有环境保持同一 schema 版本的方式。

### 日常开发循环

当你想修改 schema 时：

1. 编辑 `schema.prisma`
2. 运行 `prisma migrate dev --name your_change_name`
3. Prisma 生成 migration SQL 文件
4. Prisma 更新你的本地数据库
5. Prisma 重新生成 client
6. 更新应用代码以使用新的字段或表
7. 将 schema 与 migration 文件一起提交

这就是正常的迭代循环。

### 重要规则

真实项目开发里，优先使用 `migrate dev`，不要依赖 `db push`。

`db push` 只适合一次性原型或临时验证场景。

原因：

- `migrate dev` 会保留历史
- `db push` 会直接改 schema，但没有可靠的 migration 历史

对这个仓库来说，你需要的是可追溯历史。

---

## 推荐命令模型

当 `packages/db` 建起来之后，比较好的命令模型大致如下：

```json
{
  "scripts": {
    "db:generate": "pnpm --filter @incept/db prisma generate",
    "db:migrate": "pnpm --filter @incept/db prisma migrate dev",
    "db:deploy": "pnpm --filter @incept/db prisma migrate deploy",
    "db:seed": "pnpm --filter @incept/db prisma db seed",
    "db:studio": "pnpm --filter @incept/db prisma studio"
  }
}
```

建议含义：

- `db:generate`
  - 重新生成 Prisma Client
- `db:migrate`
  - 创建并应用新的本地 migration
- `db:deploy`
  - 在 staging/production 应用已提交的 migrations
- `db:seed`
  - 重建本地测试数据
- `db:studio`
  - 可视化查看或编辑数据库行

---

## 环境变量

至少需要：

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/incept"
```

建议方式：

- 本地开发使用本地 PostgreSQL
- 后续 staging/production 使用各自的 `DATABASE_URL`

连接串应保存在 env 文件里，而不是写死在源码中。

---

## 本地 PostgreSQL 方案

你有两个实际可用的选择。

### 方案 A：本机安装 PostgreSQL

适合：

- 更喜欢原生工具
- 已经熟悉本地服务配置

代价：

- 手工步骤会稍多一些

### 方案 B：Docker PostgreSQL

适合：

- 想要更可复现的环境
- 后续可能还要给队友做 onboarding

代价：

- 额外引入 Docker 依赖

对这个项目来说，长期看 Docker 往往更顺手，但两种都可以。

---

## Seed 策略

第一版 seed 不要做得太大。

只要足够支撑当前 UI 即可：

- 1 到 2 个用户
- 3 到 6 条 docs 列表数据
- 1 篇完整示例文章
- 混合权限角色，例如 `guest`、`member`、`pro`

目标是：

- 用真实读取替换 mock 读取
- 让渲染出来的 UI 尽量保持不变

这是从前端原型平滑过渡到全栈行为的最好桥接方式。

---

## 如何把数据库数据映射回 UI

不要让 Prisma 查询出来的 row 直接泄漏进 UI 组件。

更好的做法是：

1. 在 `packages/db` 里查询原始数据
2. 把它映射成应用层 view model
3. 再把这些 model 传进 `features/docs/...`

原因：

- DB 结构变化时，UI 更稳定
- JSON 字段以后要规范化，也不容易影响组件
- 未来要插入鉴权逻辑时更容易扩展

边界示例：

- DB 返回 `docs_document_locales` + `docs_documents`
- mapper 返回 `DocsHomeEntry` 或 `DocsArticlePage`

这点尤其有用，因为你当前 UI 已经围绕特定的 mock shape 设计好了。

---

## Schema 演进通常如何发生

项目上线后，常见的演进路径如下。

### 阶段 1：简单内容模型

- title
- summary
- status
- body JSON
- sidebar JSON

### 阶段 2：编辑增强

- SEO 字段
- cover image
- author display
- featured flag

### 阶段 3：工作流增强

- 草稿归属
- 发布时间调度
- 审计字段

### 阶段 4：规模化增强

- tags
- related documents
- search index
- analytics

这也是为什么 v1 不该过度设计。

先把核心字段定对，再通过 migration 逐步演进。

---

## 以后需要新字段时怎么做

例如：后面你决定 docs 卡片需要 `cover_image_url`。

推荐流程：

1. 在 `schema.prisma` 中新增字段
2. 运行 migration
3. 决定老数据是否需要默认值或回填
4. 更新 seed 数据
5. 更新 mapper
6. 更新 UI
7. 连同 migration 一起提交代码

这就是健康的数据库迭代模型。

你不需要每次都重构整个 schema。

---

## 建议的第一个全栈里程碑

第一个真正有意义的里程碑应当是：

### 里程碑 1

- PostgreSQL 已在本地运行
- Prisma schema 已建立
- 初始 migration 已存在
- seed 数据已存在
- `/docs` 从数据库读取
- `/docs/[slug]` 从数据库读取
- 锁定文章状态仍然正常工作

如果达到这个里程碑，就说明你已经从静态 UI 原型进入了真实的全栈 docs 系统。

这是一个很强的检查点。

---

## 建议的第二个里程碑

只有在里程碑 1 稳定之后，再进入：

### 里程碑 2

- 增加创建草稿能力
- 先从 internal/admin-only 的创建流程开始
- 用简单表单或 JSON 编辑器直接存 `body_json`
- 先不要做复杂的 block editor

这样可以在内容模型尚未完全成熟时，保持 mutation 路径尽量简单。

---

## 对这个仓库最推荐的下一步

当前最实际的推进顺序是：

1. 创建 `packages/db`
2. 加入初始 Prisma 配置
3. 把当前 DB 草案整理成真正的 `schema.prisma`
4. 创建第一版 migration
5. seed 当前 docs mock 内容
6. 把 docs 读取路由切换为数据库 loader

这是把系统跑通的最小端到端路径。

---

## 总结

你不需要在开始前就把整个数据库体系全部搞懂。

对这个项目来说，只要记住下面这个心智模型：

- `schema.prisma` 定义结构
- migrations 记录结构变更
- seed 提供测试数据
- Prisma Client 让 Next.js 安全地读写
- `packages/db` 保持领域层可复用
- 先做读取流，再做创建流

这是一条非常正常也很健康的全栈开发路径。
