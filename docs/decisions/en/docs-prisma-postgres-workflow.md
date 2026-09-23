# Docs Prisma + PostgreSQL Workflow (Archived)

> **Archived on 2026-09-23.**
>
> Moved to [`docs/history/decisions/en/docs-prisma-postgres-workflow.md`](../../history/decisions/en/docs-prisma-postgres-workflow.md).

Reason: this is an **onboarding draft** explaining how to move `docs` from mock-only rendering to a database-backed workflow, written when `packages/db` did not exist yet. Its repo shape, recommended next steps and seed strategy are all complete or superseded, and its "Server Actions are likely enough" write-path guess is not the shipped design.

What is still worth keeping: the database-as-shared-domain-layer principle, the read/write split, and "prefer `migrate dev` over `db push`".

For current guidance: [prisma-basics-and-evolution.md](./prisma-basics-and-evolution.md) for the Prisma mental model, [db-layer-architecture-rules.md](./db-layer-architecture-rules.md) for layering, and [local-postgres-docker-setup.md](../../runbooks/en/local-postgres-docker-setup.md) for setup.
