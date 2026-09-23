# Incept

个人内容站点与 Docs 发布系统，使用 pnpm workspace 管理 Web 应用与 PostgreSQL 数据访问层。

## Workspace

- `apps/web`：Next.js 站点、Docs/Notes 阅读页、导入预览、Owner 与访问控制界面。
- `packages/db`：Prisma schema、migration、Docs 写入与查询、访问控制数据层。
- `docs`：开发者文档、运行手册、架构决策、任务历史与代码 backlog。

## Local Setup

1. 安装依赖：`pnpm install`
2. 按 [本地 PostgreSQL 运行手册](docs/runbooks/zh/local-postgres-docker-setup.md) 启动数据库。
3. 在未跟踪的 `apps/web/.env.local` 配置本地 secret、内容源目录与可选 GitHub 活动 Token。
4. 应用 migration 并生成 client：

```powershell
pnpm db:deploy
pnpm db:generate
```

5. 启动开发服务器：

```powershell
pnpm dev
```

## Common Commands

```powershell
pnpm dev
pnpm db:deploy
pnpm db:generate
pnpm docs:import --file <path> --dry-run
pnpm docs:check-markdown-like
pnpm docs:check-media
pnpm activity:check-github
pnpm auth:grant --help
```

Docs 导入会先生成 draft；正式写库必须在 Owner 预览页确认。完整写作、媒体与发布说明见 [Docs Markdown-like README](apps/web/src/features/docs/importer/docs-push/README.md)。

## Documentation

- [Docs Index](docs/INDEX.md)：文档目录与阅读入口。
- [Code Backlog](docs/BACKLOG.md)：源码 TODO 的唯一审查清单。
- [Next Stage](docs/NEXT.md)：当前活跃产品任务的短入口。
- [Docs 内容导入与合集批次操作手册](docs/runbooks/zh/docs-content-import.md)：写作、导入、发布的标准流程。
- [Docs 数据层规则](docs/decisions/zh/db-layer-architecture-rules.md)：分层边界与不可随手改动的约束。
- [Current Task](docs/current-task/)：近期任务上下文与里程碑记录。
