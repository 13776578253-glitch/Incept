# DB Layer Architecture Rules

## Goal

This document defines the stable architecture boundary for database development and the matching layer between database data and UI data.

It applies to the current `docs` product line and should be reused as the repo grows.

## Layer Responsibilities

### 1. DB Layer

Location:

- `packages/db/prisma/*`
- `packages/db/src/client.ts`

Responsibilities:

- own `schema.prisma`
- own migrations
- own seed data
- own Prisma client lifecycle
- define database-facing query DTOs

This layer is the source of truth for:

- table structure
- enum structure
- relational data shape
- local seed assumptions

### 2. Query Layer

Location:

- `packages/db/src/docs/queries.ts`
- `packages/db/src/docs/types.ts`

Responsibilities:

- query Prisma with explicit `select`
- return stable DB DTOs
- perform minimal structural validation on JSON fields
- fail fast on malformed stored data

This layer should return:

- database-oriented records
- never UI components
- never React-specific models

### 3. Mapper Layer

Location:

- `apps/web/src/server/docs/mappers.ts`

Responsibilities:

- convert DB DTOs into UI-ready page models
- reshape locale/document rows into feature-level data contracts
- keep UI stable when DB structure evolves

This is the translation boundary between:

- database shape
- page rendering shape

### 4. Access / Loader Layer

Location:

- `apps/web/src/server/docs/access.ts`
- `apps/web/src/server/docs/loaders.ts`

Responsibilities:

- call DB query functions
- apply access rules
- assemble final page data for route consumption
- decide whether a route returns data or `notFound`

This layer owns:

- access role checks
- route-facing data assembly
- server-only orchestration

### 5. Route Layer

Location:

- `apps/web/src/app/[locale]/docs/*`

Responsibilities:

- read route params
- call loaders
- handle `notFound`
- pass page models into features

This layer should stay thin.

### 6. UI Layer

Location:

- `apps/web/src/features/docs/*`

Responsibilities:

- render page models
- own visual structure
- own interaction presentation

This layer should know nothing about:

- Prisma
- table names
- migrations
- DB DTO internals

## Prohibited Cross-Layer Behavior

### DB Layer Must Not

- import from `apps/web`
- import UI page models
- contain route logic
- contain access decision logic tied to UI behavior

### Query Layer Must Not

- return Prisma row payloads directly to UI
- build React-facing strings or presentation labels
- perform route navigation logic

### Mapper Layer Must Not

- run Prisma queries directly
- own route branching
- own database mutation logic

### Route Layer Must Not

- write raw Prisma queries
- reshape DB rows inline
- duplicate access logic already owned by loaders

### UI Layer Must Not

- import from Prisma
- import DB DTO types
- know about `docs_documents` or `docs_document_locales`
- make assumptions about migration structure

## Practical Rules

1. Database structure changes begin in `schema.prisma`.
2. Every schema change must be paired with migration updates.
3. Seed changes should reflect local test needs, not UI-only hacks.
4. Query DTOs live in `packages/db/src/docs/types.ts`.
5. UI page models live in `apps/web/src/features/docs/shared/types.ts`.
6. New docs routes must consume loaders, not direct Prisma queries.
7. JSON fields such as `bodyJson` and `sidebarJson` must be validated in the query layer before leaving `packages/db`.

## Current Docs Example

For the current docs read flow:

- Prisma reads `docs_documents` and `docs_document_locales`
- query layer returns DB DTOs
- mapper layer converts them to `DocsArticlePageModel` or `DocsHomePageModel`
- route layer passes those models into docs features

This is the baseline pattern that should be preserved.
