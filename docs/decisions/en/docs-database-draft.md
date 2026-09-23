# Docs Database Draft (Archived)

> **Archived on 2026-09-23.**
>
> Moved to [`docs/history/decisions/en/docs-database-draft.md`](../../history/decisions/en/docs-database-draft.md).

Reason: this is the original v1 schema draft for the `docs` product line, written before collections, access control and the music subsystem existed. It writes `access_role` as `guest` / `member` / `pro` and has no `docs_collections*`, `access_*`, `docs_publication_events` or `music_*` tables.

The DBML that accompanied this draft moved with it, to [2026-05-06-docs-database-draft.dbml](../../history/dbml/2026-05-06-docs-database-draft.dbml).

For the current model: the ER view is [2026-09-23-current-database-schema.dbml](../../history/dbml/2026-09-23-current-database-schema.dbml) and the source of truth is `packages/db/prisma/schema.prisma`. The data-layer rules that still apply are in [db-layer-architecture-rules.md](./db-layer-architecture-rules.md).
