# Docs Module Architecture

## Goal

This document defines the current stable architecture for the `docs` module.

It captures the route model, content rules, and data rules that should remain consistent unless a new decision explicitly changes them.

## Current Route Model

The docs surface is currently split into:

- `/{locale}/docs`
  - main docs entry
- `/{locale}/docs/[slug]`
  - canonical article detail route
- `/{locale}/docs/reference`
  - compatibility alias to one canonical article
- `/{locale}/docs/archive`
  - reserved for future expansion, not implemented yet

## Canonical Slug Rule

Current canonical sample article slug:

- `document-shells`

Rules:

- `/reference` is only an alias
- the canonical data source is the slug route
- slug values should be readable and stable
- slug values are stored per locale row

## Locale Rule

Locale behavior:

- locale exists only in the leading route segment
- current supported locales are `en` and `zh`
- data lookup is based on `locale + slug`
- the slug itself should not carry locale suffixes

## Layout Mode Rule

The document page shape is controlled by `layoutMode`.

Current values:

- `sidebar`
- `contentOnly`

Rules:

- `layoutMode` is a document property
- `layoutMode` belongs to the document metadata layer, not the route
- the same route pattern can render either layout

Rendering behavior:

- `sidebar`
  - left sidebar + main body + right outline
- `contentOnly`
  - main body + right outline

## Access Role Rule

Access control is currently modeled by document-level access roles.

Current values:

- `guest`
- `member`
- `pro`

Rules:

- home page may show inaccessible entries in locked state
- detail route denies access when viewer role is insufficient
- current viewer role is still mocked for development

## Body JSON Rule

Current `bodyJson` top-level structure:

```json
{
  "sections": [
    {
      "id": "overview",
      "title": "Section title",
      "blocks": [
        {
          "id": "p1",
          "type": "paragraph",
          "text": "..."
        }
      ]
    }
  ]
}
```

Rules:

- database stores an object, not a bare array
- query layer validates this shape
- UI receives already-mapped page models, not raw JSON

Current supported block types:

- `paragraph`
- `list`
- `callout`

## Sidebar JSON Rule

Current `sidebarJson` top-level structure:

```json
{
  "groups": [
    {
      "id": "foundations",
      "label": "Foundations",
      "defaultOpen": true,
      "items": [
        {
          "id": "overview",
          "label": "Overview",
          "href": "/docs/document-shells"
        }
      ]
    }
  ]
}
```

Rules:

- only meaningful for `layoutMode = sidebar`
- query layer validates the `groups` array
- UI receives already-mapped sidebar groups

## Stable Architectural Boundary

The module is intentionally split like this:

- `packages/db`
  - DB schema, query DTOs, Prisma queries
- `apps/web/src/server/docs`
  - access checks, mapping, loader assembly
- `apps/web/src/features/docs`
  - page rendering
- `apps/web/src/app/[locale]/docs`
  - thin route entrypoints

This boundary should be preserved as the docs module expands into create/edit/publish flows.
