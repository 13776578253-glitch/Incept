# Docs Database Draft (Superseded)

> **Archived on 2026-09-23.** Kept for history only. This is the original v1 schema draft
> for the `docs` product line; it predates collections, access control and the music
> subsystem.
>
> **Known-stale content — do not copy from this file:**
>
> - It writes `access_role` as `guest` / `member` / `pro`. Migration
>   `20260720120000_add_access_control_foundation` replaced `member` with `pro` / `private`;
>   Docs content access is now `guest` / `pro` / `private`.
> - It has no `docs_collections` / `docs_collection_locales` / `docs_collection_items`
>   (2026-05-09, extended 2026-09-01/02), no `access_principals` / `access_grants` /
>   `access_sessions` (2026-07-20/21), no `docs_publication_events` (2026-07-27), and no
>   `music_tracks` / `music_libraries` / `music_library_items` (2026-09-16/17/21).
> - Its route list omits `/{locale}/docs/series/{collectionSlug}/{articleSlug}` and
>   `/{locale}/notes/{slug}`.
> - Its "Access Control" section recommends showing restricted entries "in blurred/locked
>   form". The shipped behaviour is the opposite: inaccessible entries are hidden from
>   listings and a direct hit returns 404.
>
> **For the current model use:**
> [2026-09-23-current-database-schema.dbml](../../dbml/2026-09-23-current-database-schema.dbml)
> for the ER view, and `packages/db/prisma/schema.prisma` as the source of truth. The rules
> that still govern the data layer are in
> [db-layer-architecture-rules.md](../../../decisions/en/db-layer-architecture-rules.md).
>
> **Still in force from this draft:** do not create separate tables for archive pages,
> reference pages or article pages — they are views over the same docs content model.
>
> Originally at `docs/decisions/en/docs-database-draft.md`. The text below is the original,
> unedited apart from this header.

## Goal

This draft defines a minimal but extensible database structure for the `docs` product line.

Current route model:

- `/{locale}/docs`
- `/{locale}/docs/archive` (reserved, not implemented yet)
- `/{locale}/docs/[slug]`

Current product assumptions:

- docs home is archive-first
- article layout is driven by article metadata
- locale is only represented by the leading route segment
- content needs to support both `sidebar` and `contentOnly`
- first phase should optimize for read flow, not editor complexity

## Recommended Placement

Recommended monorepo location for database code:

- `packages/db`

Suggested contents:

- schema definitions
- migrations
- seed scripts
- database client
- repository/query helpers

Reason:

- `apps/web` is the only runtime service now, but `workspace` will likely reuse the same database later
- database concerns should be isolated before the repo grows

---

## Core Design

Use **two core tables** for docs content:

1. `docs_documents`
2. `docs_document_locales`

This keeps:

- global document metadata in one place
- localized content in another place
- layout and access control stable
- block content flexible via JSON

Do **not** create separate tables for:

- archive pages
- reference pages
- article pages

Those are all views over the same docs content model.

---

## Table 1: `docs_documents`

Represents the global document entity, independent of locale.

Suggested fields:

| Field | Type | Notes |
|---|---|---|
| `id` | uuid / cuid / bigint | Primary key |
| `kind` | text / enum | Example: `article`, `reference`, `note` |
| `layout_mode` | text / enum | `sidebar` or `content_only` |
| `access_role` | text / enum | `guest`, `member`, `pro` |
| `created_by` | uuid / text nullable | Future author relation |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update time |

Notes:

- `layout_mode` belongs here because it is a document-level behavior flag
- `access_role` belongs here because access control is not locale-specific
- `kind` is optional for v1 but recommended because it separates content semantics from page layout

---

## Table 2: `docs_document_locales`

Represents the localized content for one document.

Suggested fields:

| Field | Type | Notes |
|---|---|---|
| `id` | uuid / cuid / bigint | Primary key |
| `document_id` | fk -> `docs_documents.id` | Parent document |
| `locale` | text / enum | `en`, `zh` |
| `slug` | text | Route slug for this locale |
| `eyebrow` | text nullable | Small label above title |
| `title` | text | Main title |
| `summary` | text nullable | Used in docs home/archive listing |
| `status` | text / enum | `draft`, `published`, maybe `archived` later |
| `published_at` | timestamp nullable | Publish time for ordering |
| `body_json` | json/jsonb | Main article content blocks |
| `sidebar_json` | json/jsonb nullable | Sidebar navigation groups |
| `seo_title` | text nullable | Optional SEO override |
| `seo_description` | text nullable | Optional SEO summary |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update time |

Constraints:

- unique(`document_id`, `locale`)
- unique(`locale`, `slug`)

Notes:

- `slug` should be readable and stable, not random
- slug is stored per locale, because localized paths may diverge later
- `published_at` is locale-specific so one language can publish before another

---

## JSON Fields

### `body_json`

Use a block structure close to the current frontend mock shape.

Suggested top-level shape:

```json
{
  "sections": [
    {
      "id": "overview",
      "title": "Why a reusable document shell matters",
      "description": "Optional section intro",
      "blocks": [
        {
          "id": "p1",
          "type": "paragraph",
          "text": "..."
        },
        {
          "id": "list-1",
          "type": "list",
          "items": ["...", "..."]
        },
        {
          "id": "callout-1",
          "type": "callout",
          "tone": "note",
          "title": "Design intent",
          "text": "..."
        }
      ]
    }
  ]
}
```

Recommended v1 block types:

- `paragraph`
- `list`
- `callout`

Future-safe additions:

- `image`
- `quote`
- `code`
- `video`

### `sidebar_json`

Only meaningful when `layout_mode = sidebar`.

Suggested shape:

```json
{
  "groups": [
    {
      "id": "getting-started",
      "label": "Getting started",
      "defaultOpen": true,
      "items": [
        {
          "id": "overview",
          "label": "Overview",
          "href": "/docs/overview"
        }
      ]
    }
  ]
}
```

Notes:

- for v1, JSON is better than normalizing into multiple tables
- if docs navigation becomes a real knowledge graph later, it can be split out then

---

## Home Page Query Model

`/{locale}/docs` should be derived from published localized content.

Suggested query logic:

- source from `docs_document_locales`
- join `docs_documents`
- filter:
  - `locale = current locale`
  - `status = 'published'`
- order by `published_at desc`
- group by year in application code

This means:

- docs home is a query result
- archive is not a separate content table

---

## Detail Page Query Model

`/{locale}/docs/[slug]`

Suggested query logic:

- source from `docs_document_locales`
- join `docs_documents`
- filter:
  - `locale = current locale`
  - `slug = route slug`
- return:
  - title/summary/body/sidebar
  - `layout_mode`
  - `access_role`

Then:

- if `layout_mode = sidebar`, render left sidebar + body + right outline
- if `layout_mode = content_only`, render body + right outline

---

## Access Control

Recommended v1 model:

- keep access control simple
- use `docs_documents.access_role`

Suggested values:

- `guest`
- `member`
- `pro`

Frontend behavior:

- docs home can show restricted entries in blurred/locked form
- detail route should deny access if viewer role is insufficient

This is enough for v1.

Do not add per-user ACL tables yet unless real requirements appear.

---

## Optional Future Tables

Do **not** build these in v1, but keep room for them:

### `users`

If auth becomes real:

- `id`
- `email`
- `name`
- `role`

### `docs_tags`

If docs need cross-cutting categorization:

- `id`
- `slug`
- `label`

### `docs_document_tags`

Join table:

- `document_id`
- `tag_id`

## Recommended v1 Scope

For the first database-backed phase, only implement:

- `docs_documents`
- `docs_document_locales`
- seed data for:
  - docs home entries
  - one real sample article
- read queries for:
  - docs home
  - docs article by slug

Do not implement yet:

- full editor/create UI
- revision system
- tags
- standalone `/docs/archive` page
- complex permission graph

---

## Suggested Next Step

After this draft is accepted:

1. create `packages/db`
2. write initial schema for the two tables
3. write seed data that mirrors current mock docs content
4. replace docs mock reads with database-backed read functions
5. only then start create/admin work

This keeps the first full-stack milestone small and testable.
