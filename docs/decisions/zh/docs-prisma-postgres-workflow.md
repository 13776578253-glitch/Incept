# Docs Prisma + PostgreSQL 工作流草案（已归档）

> **本文件已于 2026-09-23 归档。**
>
> 内容已移至 [`docs/history/decisions/zh/docs-prisma-postgres-workflow.md`](../../history/decisions/zh/docs-prisma-postgres-workflow.md)。

归档原因：这是一份**入门稿**，讲如何把 `docs` 从纯 mock 渲染迁到数据库驱动，写成的年代 `packages/db` 还不存在。它的仓库结构建议、下一步清单与 seed 策略都已完成或被取代，「早期用 Server Actions 就够了」的写入路径猜测也不是实际设计。

仍然值得保留的部分：把数据库当作共享领域层、读写分离、以及真实项目优先用 `migrate dev` 而非 `db push`。

当前指引：[prisma-basics-and-evolution.md](./prisma-basics-and-evolution.md)（Prisma 心智模型）、[db-layer-architecture-rules.md](./db-layer-architecture-rules.md)（分层规则）、[local-postgres-docker-setup.md](../../runbooks/zh/local-postgres-docker-setup.md)（环境搭建）。
