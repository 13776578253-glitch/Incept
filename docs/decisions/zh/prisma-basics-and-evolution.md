# Prisma 基础与演进

## 目标

这份说明用直白语言解释三件事：

1. `schema.prisma` 是什么
2. `generated/client` 是什么
3. 数据库层应该如何随时间演进

它基于当前仓库形态编写：

- Next.js 应用位于 `apps/web`
- Prisma 包位于 `packages/db`
- PostgreSQL 运行在 Docker 中

---

## 心智模型

你可以把 Prisma 工作流理解为一条流水线：

```text
schema.prisma
  -> migrate
  -> database tables
  -> generate
  -> Prisma Client
  -> app code queries database
```

每一步都有不同职责。

---

## 什么是 `schema.prisma`

文件位置：

- `packages/db/prisma/schema.prisma`

这个文件就是**数据库蓝图**。

它定义：

- models
- fields
- enums
- relations
- indexes
- unique constraints

简单理解：

- 一个 `model` 大致对应一张数据库表
- 一个 field 大致对应一列
- relation 描述表之间如何连接

例如：

- `DocsDocument` = 全局文档表
- `DocsDocumentLocale` = 本地化内容表

Prisma 读取这个文件后，会做两件重要的事：

1. 生成 migration 文件
2. 生成 Prisma Client 代码

因此 `schema.prisma` 是结构层面的唯一事实来源。

---

## `migrate` 做了什么

命令：

```powershell
pnpm db:migrate -- --name some_change
```

这个命令会比较当前的 `schema.prisma` 与当前数据库状态。

然后 Prisma 会：

1. 创建一个 migration 文件夹
2. 把 SQL 写入 `migration.sql`
3. 将这段 SQL 应用到本地数据库
4. 重新生成 Prisma Client

生成的文件会放在：

- `packages/db/prisma/migrations/...`

所以 migration 文件就是**数据库结构的版本历史**。

它们应该被提交到 git。

---

## 什么是 `generated/client`

目录：

- `packages/db/generated/client`

这个目录是**生成代码**，不是手写业务代码。

它通过以下命令生成：

```powershell
pnpm db:generate
```

或者在 migration 过程中自动生成。

它的作用是给应用提供：

- 带类型的查询方法
- 带类型的 model 名称
- 带类型的枚举
- 与数据库引擎通信所需的运行时代码

实际效果就是你的代码可以这样写：

```ts
prisma.docsDocument.findMany(...)
prisma.docsDocumentLocale.findFirst(...)
```

并得到类型检查。

---

## `generated/client` 里的文件是什么

你不需要记住每个文件，但知道大类会很有帮助。

### `index.d.ts`

这是 TypeScript 类型定义文件。

它告诉 TypeScript：

- 有哪些 model
- 有哪些查询方法
- 有哪些枚举

如果你能获得 Prisma 自动补全，很多信息就是来自这里。

### `index.js`

这是 Prisma Client 的主 Node.js 入口文件。

你的服务端代码在导入 client 时，实际上就会走到这一层。

### `runtime/`

这个目录包含 Prisma 自己的运行时支持代码。

它帮助 Prisma：

- 构建查询请求
- 校验输入
- 格式化错误
- 把你的代码连接到数据库引擎

这是 Prisma 的内部基础设施。

通常不需要手动修改。

### `query_engine-windows.dll.node`

这是 Prisma 在 Windows 上使用的原生查询引擎二进制文件。

它是 Prisma 实际执行数据库工作的底层组成之一。

### `query_engine_bg.wasm`

这是面向其他运行时目标的 WebAssembly 版本引擎。

### `edge.js`、`wasm.js`、`index-browser.js`

这些文件存在，是因为 Prisma 支持不止一种执行环境：

- 普通 Node 服务端
- edge runtime
- 浏览器安全变体

对当前项目来说，最重要的还是普通 Node 服务端这条路径。

---

## 哪些该改，哪些不该改

你应该修改：

- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/seed.ts`
- `packages/db/src/...` 下的数据库查询辅助代码

你**不应该**手动修改：

- `packages/db/generated/client/*`
- migration SQL，除非你有非常明确的原因且理解影响

生成代码应被视为构建产物。

---

## `generate`、`migrate` 和 `seed` 的区别

这三个概念很容易混淆。

### `db:generate`

它根据 schema 生成 Prisma Client 代码。

它**不会**创建表。

它**不会**插入数据。

### `db:migrate`

它会修改真实数据库结构。

它会创建或更新：

- tables
- columns
- indexes
- constraints

同时还会把这些变化存成带版本的 migration。

### `db:seed`

它会往数据库插入示例数据或初始化数据。

它**不会**修改表结构。

---

## 应用如何使用 Prisma

当前预期的分层是：

```text
apps/web route or server function
  -> packages/db query helper
  -> Prisma Client
  -> PostgreSQL
```

示例：

1. `/[locale]/docs/[slug]` 需要一篇文章
2. route 调用服务端 helper
3. helper 用 Prisma 读取 document + locale row
4. helper 把 DB 数据映射成 UI 友好结构
5. React 组件渲染页面

这样可以让 UI 更干净，也让后续 schema 变化更容易被吸收。

---

## 以后如何新增字段

例如：之后你想新增 `coverImageUrl`。

推荐流程：

1. 把字段加进 `schema.prisma`
2. 运行：

```powershell
pnpm db:migrate -- --name add_cover_image
```

3. Prisma 生成新的 migration
4. 本地数据库更新
5. Prisma Client 重新生成
6. 如有需要，更新 seed 数据
7. 更新 query helpers
8. 更新 UI

这就是正常的开发循环。

你不需要每次都重设计整个数据库。

---

## 如何安全地修改既有结构

如果以后确实要改结构，建议按这个顺序思考：

1. 产品需求是什么
2. 缺的是哪个字段或关系
3. 老数据是否需要默认值或迁移路径
4. UI 类型是否也要同步调整

例子：

- 新增可选字段：通常比较简单
- 重命名字段：要更谨慎，因为旧代码和旧数据都会受影响
- 把一个字段拆成两张表：属于更大的重构，只在真正需要时再做

关键规则是：

- 有意识地修改 schema
- 让 migration 历史去记录变化

---

## 如何让数据库层保持可扩展

对这个仓库来说，一套健康规则是：

### 保持 v1 简单

- 表数量尽量少
- 正文内容先放在 JSON
- 不要过早过度建模

### 能加字段就先别上新系统

如果一个简单字段就能解决问题，优先选那个方案。

例如：

- 先加 `featured`，而不是立刻做独立首页配置系统

### 只有产品真的需要时再做规范化

例如：

- `body_json` 在 v1 是完全可接受的
- 如果编辑、搜索、分析或引用关系变复杂，再做规范化

### UI-facing data 要与原始 DB rows 分离

先用 Prisma 查询原始 rows，再把它们映射成页面模型。

这样做的好处：

- DB shape 可以演进
- UI shape 可以保持稳定
- 未来插入鉴权与权限逻辑会更干净

---

## 推荐的日常工作流

在这个项目里做数据库变更时：

1. 编辑 `schema.prisma`
2. 运行 migration
3. 检查 migration 结果
4. 如有需要，更新 seed
5. 更新 db query helpers
6. 更新应用代码
7. 用 Prisma Studio 或页面渲染结果做验证

好用的辅助命令：

```powershell
pnpm db:generate
pnpm db:migrate -- --name your_change
pnpm db:seed
pnpm db:studio
```

---

## 当前项目方向

对 docs 系统来说，接下来最合理的演进路径是：

1. 保持当前 schema 足够小
2. 先做 docs 首页和文章页的读取查询
3. 用数据库读取替换 mock 读取
4. 验证路由行为
5. 然后再增加 create/edit 流程

这个顺序能把风险压低，同时较快得到真实可用的端到端系统。

---

## 总结

你可以用下面这段简表来记住 Prisma：

- `schema.prisma` 定义结构
- migrations 记录结构变更
- `generated/client` 给代码提供带类型的数据库 client
- `seed.ts` 往表里放示例数据
- 应用代码应使用 query helpers，而不是直接依赖生成层内部实现

这些基础就足够支撑你继续推进，而不会被工具细节淹没。
