# Docs Prisma + PostgreSQL Workflow Draft

## Goal

This draft explains how to move the current `docs` product line from mock-only frontend rendering to a stable database-backed workflow using:

- Next.js
- Prisma
- PostgreSQL

It is written for the current repo state:

- monorepo structure
- only `apps/web` is running in v1
- `docs` is the first product line to ship
- `workspace` will come later

---

## Core Principle

For this project, treat the database as a **shared domain layer**, not as something buried inside `apps/web`.

That means:

- UI stays in `apps/web`
- database schema, migrations, seed, and query helpers live in `packages/db`
- `apps/web` imports read/write functions from the db package

This is the cleanest path for growth because later:

- `workspace` can reuse the same database package
- background jobs or admin tools can reuse the same queries
- schema and app logic stay easier to reason about

---

## Recommended Repo Shape

Suggested structure:

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

Suggested responsibility split:

- `packages/db/prisma/schema.prisma`
  - source of truth for tables and relations
- `packages/db/prisma/migrations/*`
  - versioned database changes
- `packages/db/prisma/seed.ts`
  - local/test seed data
- `packages/db/src/client.ts`
  - Prisma client singleton
- `packages/db/src/docs/queries.ts`
  - document read/write logic
- `apps/web/src/app/...`
  - route entry points only
- `apps/web/src/features/docs/...`
  - UI rendering only

---

## Why Prisma Fits This Project

Prisma is a good fit here because it gives you four things at once:

1. one schema file to define structure
2. generated typed client for app queries
3. migration history for schema evolution
4. a predictable local-to-production workflow

For your current stage, the biggest value is not “less SQL”.

The biggest value is:

- your schema changes are versioned
- your code gets type safety
- your local database can evolve step by step without becoming a mess

---

## The Four Files You Should Understand First

### 1. `schema.prisma`

This defines:

- tables
- fields
- enums
- relations
- indexes
- unique constraints

You can think of it as the typed blueprint of the database.

### 2. migration files

These are generated SQL snapshots that record each schema change over time.

Example:

- `20260506_init_docs`
- `20260510_add_seo_fields`
- `20260515_add_cover_image`

These are the real history of database evolution.

### 3. Prisma Client

This is generated from `schema.prisma`.

Your app uses it to query PostgreSQL in typed code, for example:

- get docs home list
- find article by slug and locale
- create draft article

### 4. seed script

This inserts initial test data.

For your project, the first seed should mirror:

- docs home entries
- one sample article
- one or two users/roles if needed

---

## Recommended Development Order

Do not start with create UI first.

The best order for this repo is:

1. finalize v1 schema for docs read flow
2. set up Prisma + PostgreSQL + migrations
3. seed current mock docs data
4. switch `/docs` and `/docs/[slug]` from mock reads to database reads
5. verify end-to-end read flow
6. only then add create/admin/edit flow

Reason:

- read flow is already designed in UI
- route model is already stable
- database integration risk stays small
- you can ship docs earlier

If you do create UI too early, you will be designing forms and mutations against a schema that is still moving.

That usually creates rework.

---

## Suggested V1 Database Scope

For the first real database milestone, keep scope narrow.

Build only:

- `users`
- `docs_documents`
- `docs_document_locales`

Read flows to support:

- docs home list
- docs article detail by `locale + slug`
- permission display based on `access_role`

Do not build yet:

- revision history
- rich editor backend
- tags
- search
- media library
- archive-specific extra tables

---

## How Frontend and Backend Connect In This Repo

You asked whether a Next.js project still needs explicit API interfaces.

Short answer:

- for server-rendered reads, not necessarily
- for browser-triggered writes, usually yes

Recommended split:

### Read path

For pages like:

- `/{locale}/docs`
- `/{locale}/docs/[slug]`

use server-side query functions directly.

That means:

- route/page or server component calls a server helper
- server helper calls `packages/db`
- no extra REST API layer is required for these reads

This keeps the first full-stack version simpler.

### Write path

For future actions like:

- create article
- update article
- publish article

use one of these:

- Next.js Server Actions
- Route Handlers (`app/api/...`)

For your project, Server Actions are likely enough in the early phase.

So the answer is:

- no large external API layer is needed right now
- but you still want clear server-side boundaries

---

## Migration Workflow

This is the part most people are unsure about at first, so here is the plain version.

### What a migration is

A migration is a versioned description of a schema change.

Examples:

- add a table
- rename a column
- make a field nullable
- add a unique index

When you change `schema.prisma`, Prisma can generate a migration file.

That file is committed into git.

Later:

- your machine runs it
- teammates run it
- production runs it

That is how everyone stays on the same schema version.

### Everyday dev loop

When you want to change the schema:

1. edit `schema.prisma`
2. run `prisma migrate dev --name your_change_name`
3. Prisma creates a migration SQL file
4. Prisma updates your local database
5. Prisma regenerates the client
6. update app code to use the new field/table
7. commit both schema and migration files

This is the normal iterative cycle.

### Important rule

Prefer `migrate dev`, not `db push`, for real project work.

Use `db push` only for throwaway prototype situations.

Reason:

- `migrate dev` keeps history
- `db push` mutates schema without durable migration history

For this repo, you want history.

---

## Recommended Command Model

Once `packages/db` exists, a good command model looks like this:

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

Suggested meaning:

- `db:generate`
  - regenerate Prisma Client
- `db:migrate`
  - create and apply a new local migration
- `db:deploy`
  - apply committed migrations in staging/production
- `db:seed`
  - refill local test data
- `db:studio`
  - visual inspect/edit tool for database rows

---

## Environment Variables

At minimum, you will want:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/incept"
```

Recommended approach:

- local dev uses a local PostgreSQL database
- later staging/production use their own `DATABASE_URL`

Keep the connection string in env files, not in source code.

---

## Local PostgreSQL Options

You have two practical choices.

### Option A: local installed PostgreSQL

Good if:

- you prefer native tools
- you already know the service setup

Tradeoff:

- slightly more manual

### Option B: Docker PostgreSQL

Good if:

- you want a more reproducible environment
- you may onboard teammates later

Tradeoff:

- adds Docker as another dependency

For this project, Docker is usually the smoother long-term choice, but either is fine.

---

## Seed Strategy

Your first seed should not be ambitious.

It should do only enough to support the current UI:

- 1 or 2 users
- 3 to 6 docs list entries
- 1 full sample article
- mixed access roles such as `guest`, `member`, `pro`

The goal is:

- replace mock reads with real reads
- keep the rendered UI almost unchanged

That is the cleanest bridge from frontend prototype to full-stack behavior.

---

## Mapping Database Data Back To UI

Do not let Prisma rows leak directly into UI components.

Instead:

1. query raw data in `packages/db`
2. map it to app-level view models
3. pass those models into `features/docs/...`

Why this matters:

- UI stays stable if DB shape changes
- JSON fields can be normalized later without breaking components
- future auth logic stays easier to insert

Example boundary:

- DB returns `docs_document_locales` + `docs_documents`
- mapper returns `DocsHomeEntry` or `DocsArticlePage`

This is especially useful because your current UI is already designed around specific mock shapes.

---

## How Schema Evolution Usually Happens

Here is the normal lifecycle once the project is live.

### Phase 1: simple content model

- title
- summary
- status
- body JSON
- sidebar JSON

### Phase 2: editorial additions

- SEO fields
- cover image
- author display
- featured flag

### Phase 3: workflow additions

- draft ownership
- publish scheduling
- audit fields

### Phase 4: scale additions

- tags
- related documents
- search index
- analytics

This is why it is better not to overdesign v1.

Set the core fields correctly, then evolve through migrations.

---

## What To Do When You Need A New Field Later

Example: you later decide docs cards need `cover_image_url`.

Recommended process:

1. add field to `schema.prisma`
2. run a migration
3. decide whether old rows need a default/backfill
4. update seed data
5. update mapper
6. update UI
7. commit migration with code

That is the healthy database iteration model.

You do not need to redesign the whole schema every time.

---

## Suggested First Full-Stack Milestone

The first meaningful milestone should be:

### Milestone 1

- PostgreSQL runs locally
- Prisma schema exists
- initial migration exists
- seed data exists
- `/docs` reads from database
- `/docs/[slug]` reads from database
- locked article state still works

If you reach this milestone, you have already moved from static UI prototype to real full-stack docs.

That is a strong checkpoint.

---

## Suggested Second Milestone

Only after Milestone 1 is stable:

### Milestone 2

- add create draft capability
- start with internal/admin-only create flow
- store `body_json` directly from a simple form or JSON editor
- do not build a complex block editor yet

This keeps the mutation path simple while the content model is still maturing.

---

## Recommended Next Step For This Repo

The most practical next move is:

1. create `packages/db`
2. add initial Prisma setup
3. turn the current DB draft into a real `schema.prisma`
4. create the first migration
5. seed current docs mock content
6. switch docs read routes to database-backed loaders

That is the smallest path to an end-to-end working system.

---

## Bottom Line

You do not need to understand the whole database world before starting.

For this project, just remember this mental model:

- `schema.prisma` defines structure
- migrations record structure changes
- seed provides test data
- Prisma Client lets Next.js read/write safely
- `packages/db` keeps the domain reusable
- build read flow first, create flow second

That is a very normal and healthy full-stack development path.
