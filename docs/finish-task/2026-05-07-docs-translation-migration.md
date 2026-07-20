[2026-05-07 17:40] - Update by AI完成改动:
- 阅读并清点了 `docs` 目录现状，确认稳定人读文档主要集中在 `decisions/`、`modules/docs/`，其中 `local-postgres-docker-setup.md` 更适合归类到 `runbooks/`。
- 按新双语规则新增迁移文档到 `docs/decisions/en|zh/`、`docs/runbooks/en|zh/`、`docs/modules/docs/en|zh/`，保留旧文件原位不动，采用渐进迁移。
- 已完成以下稳定文档的英中文对应版本：
- `docs-prisma-postgres-workflow.md`
- `docs-database-draft.md`
- `db-layer-architecture-rules.md`
- `prisma-basics-and-evolution.md`
- `local-postgres-docker-setup.md`
- `docs-architecture.md`

遗留问题:
- `docs/INDEX.md` 目前仍是单语根索引，尚未补充平行中文版本或根级双语导航策略。
- 旧目录下的原始稳定文档还没有建立显式“已迁移到新路径”的索引关系。
- `docs/decisions/docs-database-draft.dbml` 还是旧位置文件，尚未纳入双语迁移策略。

Commit 建议: docs: translate and migrate stable docs into bilingual structure
