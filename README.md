# Incept

轻量 `web-first` monorepo。

当前阶段只有一个活跃应用：

- `apps/web`: 前端主应用

当前仓库策略：

- 保留 `pnpm workspace`
- 保留 `apps/` 和 `packages/` 扩展位
- 先以单一 `web` 应用跑通最小主流程
- 暂不提前抽共享包和数据库包

架构说明见 [docs/architecture-v1.md](/D:/code/Incept/docs/architecture-v1.md)。

本地 PostgreSQL Docker 启动说明见 [docs/local-postgres-docker-setup.md](/d:/Desktop/code/code/Incept/docs/decisions/local-postgres-docker-setup.md)。

