# Docs Implemented Changes

## Infrastructure

The following database and environment work has been completed:

- added Docker-based local PostgreSQL setup
- added local environment templates for Docker, web, and db usage
- added Prisma package structure under `packages/db`
- created initial Prisma schema, migration, and seed flow
- connected `apps/web` to `@incept/db`

## Database Layer

The docs database layer now includes:

- Prisma client singleton
- docs-specific query module under `packages/db/src/docs`
- docs DTO types for query results
- seed data for canonical docs article and home listing entries

The data model currently supports:

- document-level metadata
- locale-specific content
- access-role-based visibility
- body JSON using `{ sections: [...] }`
- optional sidebar JSON for sidebar-mode documents

## Web Server Layer

The web app now includes a dedicated docs server layer:

- `apps/web/src/server/docs/access.ts`
- `apps/web/src/server/docs/mappers.ts`
- `apps/web/src/server/docs/loaders.ts`

This layer is responsible for:

- calling database queries
- checking access role
- mapping db DTOs into UI page models
- preparing docs home and docs article page data

## Route Integration

The docs routes were updated as follows:

- `/{locale}/docs/[slug]`
  - now reads from the docs loader
- `/{locale}/docs/reference`
  - now reuses the canonical article loader with slug `document-shells`
- `/{locale}/docs`
  - now reads grouped home data from the database

## UI Contract Cleanup

The docs UI layer no longer depends on mock-only page types in its main article chain.

New formal docs UI models were introduced for:

- article page
- home page
- home groups
- home items
- content blocks
- outline items
- sidebar groups

This means:

- db query results are mapped before reaching components
- route code no longer directly owns mock-specific rendering contracts
- the docs feature can evolve without coupling Prisma rows to UI
