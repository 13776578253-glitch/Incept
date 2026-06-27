# Docs Import Source Templates

This folder stores copyable import source templates for writing docs articles with AI assistance.

These files are importer input files, not final page models.

## Files

```text
docs-page-example-si.ts
```

Single article template.

Use it when the final route should be:

```text
/{locale}/docs/{slug}
```

```text
docs-page-example-co.ts
```

Collection article template.

Use it when the final route should be:

```text
/{locale}/docs/series/{collectionSlug}/{slug}
```

## Mapping Rule

Importer source:

```text
meta + body.sections
```

is mapped into:

```text
DocsArticlePageModel
```

Main mapping:

```text
meta.slug -> page.slug
meta.title -> page.title
meta.summary -> page.description
meta.eyebrow -> page.eyebrow
meta.layoutMode -> page.layoutMode
meta.routeType -> page.routeType
meta.collectionSlug -> page.collectionSlug
body.sections -> page.sections
body.sections[].id/title -> page.outline
collectionArticle meta -> page.sidebarGroups
```

Do not write `outline` or `sidebarGroups` manually in import source files.

## Usage

Dry run:

```powershell
pnpm docs:import --file apps/web/src/features/docs/importer/docs-push/example/docs-page-example-si.ts --dry-run
```

Create preview draft:

```powershell
pnpm docs:import --file apps/web/src/features/docs/importer/docs-push/example/docs-page-example-si.ts
```

Collection article:

```powershell
pnpm docs:import --file apps/web/src/features/docs/importer/docs-push/example/docs-page-example-co.ts
```

## Style Coverage

The templates intentionally mirror the main block coverage from style lab:

- heading
- paragraph
- paragraph inline text
- paragraph inline link
- paragraph inline mark
- paragraph inline delete
- paragraph inline code
- list
- checklist
- callout
- quote
- divider
- code
- image

Style lab remains the visual reference page.

These templates are the source format reference for articles that will be imported into the database.
