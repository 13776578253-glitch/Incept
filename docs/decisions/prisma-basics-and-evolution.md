# Prisma Basics And Evolution

## Goal

This note explains three things in plain language:

1. what `schema.prisma` is
2. what `generated/client` is
3. how the database layer should evolve over time

It is written for the current repo setup:

- Next.js app in `apps/web`
- Prisma package in `packages/db`
- PostgreSQL running in Docker

---

## The Mental Model

You can understand the Prisma workflow as one pipeline:

```text
schema.prisma
  -> migrate
  -> database tables
  -> generate
  -> Prisma Client
  -> app code queries database
```

Each step has a different job.

---

## What `schema.prisma` Is

File:

- `packages/db/prisma/schema.prisma`

This file is the **database blueprint**.

It defines:

- models
- fields
- enums
- relations
- indexes
- unique constraints

In simple terms:

- a `model` is roughly a database table
- a field is roughly a column
- a relation describes how tables connect

Example idea:

- `DocsDocument` = global document table
- `DocsDocumentLocale` = localized content table

Prisma reads this file and uses it to do two important things:

1. generate migration files
2. generate Prisma Client code

So `schema.prisma` is the source of truth for structure.

---

## What `migrate` Does

Command:

```powershell
pnpm db:migrate -- --name some_change
```

This command compares your current `schema.prisma` with the current database state.

Then Prisma:

1. creates a migration folder
2. writes SQL into `migration.sql`
3. applies that SQL to your local database
4. regenerates the Prisma Client

Generated files go here:

- `packages/db/prisma/migrations/...`

So migration files are the **version history of your database structure**.

They should be committed to git.

---

## What `generated/client` Is

Folder:

- `packages/db/generated/client`

This folder is **generated code**, not hand-written business code.

It is created by:

```powershell
pnpm db:generate
```

or automatically during migration.

Its job is to give your app:

- typed query methods
- typed model names
- typed enums
- runtime code for talking to the database engine

In practice, this means your code can do things like:

```ts
prisma.docsDocument.findMany(...)
prisma.docsDocumentLocale.findFirst(...)
```

with type checking.

---

## What The Files In `generated/client` Are

You do not need to memorize every file, but it helps to know the categories.

### `index.d.ts`

This is the TypeScript type definition file.

It tells TypeScript:

- what models exist
- what query methods exist
- what enums exist

If you get autocomplete for Prisma, a lot of that comes from here.

### `index.js`

This is the main Node.js entry file for Prisma Client.

Your server-side code effectively uses this layer when it imports the client.

### `runtime/`

This folder contains Prisma's own runtime support code.

It helps Prisma:

- build query requests
- validate inputs
- format errors
- connect your code to the database engine

This is internal infrastructure for Prisma.

You normally do not edit it.

### `query_engine-windows.dll.node`

This is a native query engine binary for Windows.

It is one of the low-level pieces Prisma uses to actually execute database work.

### `query_engine_bg.wasm`

This is a WebAssembly version of the engine used for other runtime targets.

### `edge.js`, `wasm.js`, `index-browser.js`

These exist because Prisma supports more than one execution environment:

- normal Node server
- edge runtime
- browser-safe variants

For this project right now, the most important path is the normal Node server path.

---

## What You Should And Should Not Edit

You should edit:

- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/seed.ts`
- your db query helpers in `packages/db/src/...`

You should **not** manually edit:

- `packages/db/generated/client/*`
- migration SQL unless you have a very specific reason and understand the impact

Generated code should be treated as build output.

---

## The Difference Between `generate`, `migrate`, And `seed`

These three are easy to confuse.

### `db:generate`

This generates Prisma Client code from the schema.

It does **not** create tables.

It does **not** insert data.

### `db:migrate`

This changes the actual database structure.

It creates or updates:

- tables
- columns
- indexes
- constraints

It also stores the change as a versioned migration.

### `db:seed`

This inserts sample or initial data into the database.

It does **not** change table structure.

---

## How The App Uses Prisma

Right now the intended layering is:

```text
apps/web route or server function
  -> packages/db query helper
  -> Prisma Client
  -> PostgreSQL
```

Example:

1. `/[locale]/docs/[slug]` needs an article
2. route calls a server-side helper
3. helper uses Prisma to read document + locale row
4. helper maps DB data into UI-friendly data
5. React component renders the page

This keeps the UI cleaner and makes schema changes easier to absorb later.

---

## How To Add A New Field Later

Example: later you want to add `coverImageUrl`.

Recommended process:

1. add the field to `schema.prisma`
2. run:

```powershell
pnpm db:migrate -- --name add_cover_image
```

3. Prisma creates a new migration
4. local database updates
5. Prisma Client regenerates
6. update seed data if needed
7. update query helpers
8. update UI

This is the normal development cycle.

You do not redesign the whole database every time.

---

## How To Change Existing Structure Safely

If you need to change structure later, think in this order:

1. what is the product requirement
2. what field or relation is missing
3. whether old data needs a default or migration path
4. whether UI types need to change

Examples:

- add new optional field: usually easy
- rename field: more careful, because old code and old data are affected
- split one field into two tables: larger refactor, do it only when needed

The key rule is:

- change the schema deliberately
- let migration history record the change

---

## How To Keep The Database Layer Extensible

For this repo, a healthy rule set is:

### Keep v1 simple

- use a small number of tables
- keep body content in JSON
- avoid over-modeling too early

### Add fields before adding whole new systems

If a simple field solves the problem, prefer that first.

Example:

- add `featured` before building a separate homepage configuration system

### Normalize later only when the product really needs it

For example:

- `body_json` is fine in v1
- if editing, search, analytics, or references become more complex, normalize then

### Keep UI-facing data separate from raw DB rows

Query raw rows with Prisma, then map them into page models.

This helps because:

- DB shape can evolve
- UI shape can stay stable
- future auth and permission logic can be inserted more cleanly

---

## Recommended Everyday Workflow

When making database changes in this project:

1. edit `schema.prisma`
2. run migration
3. inspect the migration result
4. update seed if needed
5. update db query helpers
6. update app code
7. verify with Prisma Studio or app page rendering

Good supporting commands:

```powershell
pnpm db:generate
pnpm db:migrate -- --name your_change
pnpm db:seed
pnpm db:studio
```

---

## Current Project Direction

For the docs system, the next sensible evolution path is:

1. keep the current schema small
2. build read queries for docs home and docs article
3. replace mock data reads with database reads
4. verify route behavior
5. only then add create/edit flows

That sequence keeps risk low and gives you a real end-to-end system quickly.

---

## Bottom Line

You can remember Prisma with this short summary:

- `schema.prisma` defines structure
- migrations record structure changes
- `generated/client` gives your code a typed DB client
- `seed.ts` puts sample data into the tables
- app code should use query helpers, not raw generated internals

That is enough foundation to keep moving without getting buried in tooling details.
