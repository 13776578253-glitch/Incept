# Docs 数据库草案（已归档）

> **本文件已于 2026-09-23 归档。**
>
> 内容已移至 [`docs/history/decisions/zh/docs-database-draft.md`](../../history/decisions/zh/docs-database-draft.md)。

归档原因：这是 `docs` 产品线最早的 v1 schema 草案，早于合集、访问控制与整个音乐子系统。它把 `access_role` 写成 `guest` / `member` / `pro`，且完全没有 `docs_collections*`、`access_*`、`docs_publication_events` 与 `music_*` 表。

随本文一起的 DBML 也已归档到 [2026-05-06-docs-database-draft.dbml](../../history/dbml/2026-05-06-docs-database-draft.dbml)。

当前有效的模型：ER 视图见 [2026-09-23-current-database-schema.dbml](../../history/dbml/2026-09-23-current-database-schema.dbml)，唯一真相是 `packages/db/prisma/schema.prisma`；仍然生效的数据层规则见 [db-layer-architecture-rules.md](./db-layer-architecture-rules.md)。
