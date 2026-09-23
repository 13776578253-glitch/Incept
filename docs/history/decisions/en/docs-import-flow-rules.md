# Docs Import Flow Rules (Superseded)

> **Archived on 2026-09-23.** Kept for history only. This document describes the
> original **TypeScript `DocsImportArticleSource` import path** and the validator's
> error codes. The TypeScript source path still exists for advanced or programmatic
> imports, but it is no longer the normal writing format.
>
> **What replaced it:** `.docs.md` Markdown-like authoring with directory/batch
> collection import, an Owner preview page, and a transactional confirm. The current
> operator manual is [docs-content-import.md](../../../runbooks/en/docs-content-import.md);
> the authoritative error-code and field reference is
> `apps/web/src/features/docs/importer/validation.ts`.
>
> Two statements below are **known to be stale** and must not be relied on:
>
> 1. The "Current Risks And Open Questions" table says the confirm route "only has a TODO,
>    with no real administrator check yet". That was true when written. Owner server
>    authentication has since shipped: the confirm route validates a same-origin request
>    **and** an Owner session, and a draft containing validation errors cannot be confirmed.
> 2. The "not supported yet" list names batch import, Markdown import and collection
>    manifests as unsupported. Directory/batch collection import is now implemented (see
>    B-06 in `docs/BACKLOG.md`); what remains is real-content acceptance, not the feature.
>
> One rule here is still current and worth keeping in view: `--replace` matches on
> `locale + slug` only — never on title or id. Do not relax that.
>
> The original document exists only in Chinese; the English text below is a translation
> added on 2026-09-23 to close the bilingual gap. Originally at
> `docs/decisions/zh/docs-import-flow-rules.md`.

## Goal

This document defines the first-stage rules for the current docs import:

- which articles can be imported
- how to run an import
- how to validate before importing
- how to fix validation errors
- which data is written after a successful import

The import is an internal capability and does not enter public navigation.

## Current Entry Point

Command-line entry point:

```powershell
pnpm docs:import --file <path>
```

Optional flags:

```powershell
pnpm docs:import --file <path> --replace
pnpm docs:import --file <path> --dry-run
```

Current script location:

```text
scripts/docs-import.mjs
```

Import preview page:

```text
http://localhost:3000/en/docs/import-preview/{draftId}
```

## Article Types Currently Importable

| Type | routeType | Final route | Use case | Current status |
| --- | --- | --- | --- | --- |
| Standalone article | `singleArticle` | `/{locale}/docs/{slug}` | Independent articles, standalone explanation pages, ordinary docs entries | supported |
| Collection article | `collectionArticle` | `/{locale}/docs/series/{collectionSlug}/{slug}` | An ordered article belonging to a collection | supported |

Not supported yet:

- batch import of several articles
- importing a whole collection manifest directly
- importing into `draft` status
- importing into `archived` status
- importing straight from Markdown / MDX
- importing through an upload on a public page

## Import Source File Format

The import source is a TypeScript file.

It must export a `DocsImportArticleSource` object.

Two export styles are supported:

```ts
export default articleSource;
```

or:

```ts
export const articleSource = { ... };
```

The reading logic lives at:

```text
apps/web/src/features/docs/importer/source-loader.ts
```

Example files:

```text
apps/web/src/features/docs/importer/examples/standalone-import-sample.ts
apps/web/src/features/docs/importer/examples/document-shells-import-sample.ts
```

## Example Articles

### Standalone Article Example

File:

```text
apps/web/src/features/docs/importer/examples/standalone-import-sample.ts
```

Purpose:

- validate a `singleArticle` import
- validate that it appears on the docs home as a standalone article
- validate that its final route is `/en/docs/standalone-import-sample`

Core meta:

```ts
routeType: 'singleArticle'
layoutMode: 'contentOnly'
slug: 'standalone-import-sample'
```

### Collection Article Example

File:

```text
apps/web/src/features/docs/importer/examples/document-shells-import-sample.ts
```

Purpose:

- validate a `collectionArticle` import
- validate that the article joins the `document-shells` collection
- validate that its final route is `/en/docs/series/document-shells/importer-sample-shell`

Core meta:

```ts
routeType: 'collectionArticle'
collectionSlug: 'document-shells'
collectionTitle: 'Document shells'
position: 99
```

## Import Flow Table

| Step | File | Input | Output | Responsibility |
| --- | --- | --- | --- | --- |
| 1 | `scripts/docs-import.mjs` | `--file` path | draft information and preview URL | command-line entry point |
| 2 | `source-loader.ts` | local TS file path | `DocsImportArticleSource` | dynamically read the import source file |
| 3 | `validation.ts` | `DocsImportArticleSource` | `normalizedSource` + `issues` | validate and fill defaults |
| 4 | `create-draft.ts` | file path, replace flag | `DocsImportDraft` | create the import draft |
| 5 | `draft-store.ts` | `DocsImportDraft` | `.docs-import-drafts/{draftId}.json` | persist the draft |
| 6 | `import-preview` page | `draftId` | preview interface | human review |
| 7 | `confirm/route.ts` | `draftId` | database write and redirect to the live page | confirm the import |
| 8 | `packages/db/src/docs/import.ts` | normalized source | Prisma write result | perform the DB upsert |

## Required Fields

Every article must provide:

| Field | Notes | Error code |
| --- | --- | --- |
| `meta.locale` | Current language; `en` / `zh` supported | enum not strictly validated yet |
| `meta.routeType` | `singleArticle` or `collectionArticle` | no explicit missing-field check yet |
| `meta.slug` | Article slug | `missing_slug` |
| `meta.title` | Article title | `missing_title` |
| `meta.summary` | Article summary | `missing_summary` |
| `body.sections` | At least one section | `empty_sections` |

A `collectionArticle` must additionally provide:

| Field | Notes | Error code |
| --- | --- | --- |
| `meta.collectionSlug` | Collection slug | `missing_collection_slug` |
| `meta.collectionTitle` | Collection title | `missing_collection_title` |
| `meta.position` | Position inside the collection; must be an integer | `missing_position` |

## Default Value Rules

| Field | Default |
| --- | --- |
| `meta.kind` | `article` |
| `meta.accessRole` | `guest` |
| `meta.publishedAt` | current time |
| `meta.layoutMode` for `singleArticle` | `contentOnly` |
| `meta.layoutMode` for `collectionArticle` | `sidebar` |

## Prohibited Combinations

| Scenario | Rule | Error code |
| --- | --- | --- |
| `singleArticle` | Must not provide `collectionSlug` | `collection_slug_not_allowed` |
| `singleArticle` | Must not provide `position` | `position_not_allowed` |
| `collectionArticle` | Must not use the `contentOnly` layout | `content_only_collection` |
| any article | section ids must not repeat | `duplicate_section_id` |
| any article | block ids must not repeat | `duplicate_block_id` |
| any article | `publishedAt` must parse as a date | `invalid_published_at` |

## Warning Rules

An unknown field does not block the import, but produces a warning:

| Scenario | Error code | Handling |
| --- | --- | --- |
| An unallowed field appears in `meta` | `unknown_field` | The field is ignored; delete it or add it to the official schema |
| An unallowed field appears in `body` | `unknown_field` | The field is ignored; delete it or add it to the official schema |

## Fixing Validation Errors

| Error type | How to fix it |
| --- | --- |
| `missing_slug` | Put a non-empty string in `meta.slug` |
| `missing_title` | Put a non-empty title in `meta.title` |
| `missing_summary` | Put a non-empty summary in `meta.summary` |
| `empty_sections` | Provide at least one section in `body.sections` |
| `invalid_published_at` | Remove `publishedAt` so the system uses the current time, or use a valid date string |
| `collection_slug_not_allowed` | If this is a standalone article, remove `collectionSlug` |
| `position_not_allowed` | If this is a standalone article, remove `position` |
| `missing_collection_slug` | If this is a collection article, add `collectionSlug` |
| `missing_collection_title` | If this is a collection article, add `collectionTitle` |
| `missing_position` | If this is a collection article, add an integer `position` |
| `content_only_collection` | Use `sidebar` for a collection article, or remove `layoutMode` and let the system default it |
| `duplicate_section_id` | Change the `id` of the duplicated section |
| `duplicate_block_id` | Change the `id` of the duplicated block |
| `unknown_field` | Decide whether the field is needed; delete it if not, and extend the importer schema first if it is |

Then run the command again:

```powershell
pnpm docs:import --file <path>
```

## Database Write Rules

The DB write logic lives at:

```text
packages/db/src/docs/import.ts
```

### Standalone Article Write

A `singleArticle` writes:

- `docs_documents`
- `docs_document_locales`

Its unique target is:

```text
locale + slug
```

If the same `locale + slug` already exists:

- without `--replace`: the import fails
- with `--replace`: the old locale content is deleted and the locale row is recreated

### Collection Article Write

A `collectionArticle` writes or updates:

- `docs_collections`
- `docs_collection_locales`
- `docs_documents`
- `docs_document_locales`
- `docs_collection_items`

Collection lookup:

```text
locale + collectionSlug
```

Article lookup:

```text
locale + slug
```

Order lookup:

```text
collectionId + position
```

If the position inside the same collection is already taken by another article:

- the import fails
- `meta.position` has to change

If the same `locale + slug` already exists:

- without `--replace`: the import fails
- with `--replace`: the existing article locale content is replaced and the collection item relation is updated

## Behaviour After Success

Once the import is confirmed:

- `.docs-import-drafts/{draftId}.json` is deleted
- the browser is redirected to the live docs page
- the URL carries `?imported=1`

Standalone article redirect:

```text
/{locale}/docs/{slug}?imported=1
```

Collection article redirect:

```text
/{locale}/docs/series/{collectionSlug}/{slug}?imported=1
```

## Current Risks And Open Questions

| Item | Current state | Suggestion |
| --- | --- | --- |
| Authorization | the confirm route only has a TODO, with no real administrator check yet | authorization must be added before writing to the database |
| Block schema | the importer source depends on the current `DbDocsSection` and must stay aligned with block-system | add finer block-type validation before import |
| Locale | the type constrains it to `en` / `zh`, but runtime validation is missing | add runtime validation in `validation` |
| routeType | the type constraint exists, but an explicit missing-field check is missing at runtime | add runtime validation in `validation` |
| Draft storage | drafts are currently written to local files under `.docs-import-drafts` | could migrate to a DB draft table later |
| Batch import | currently one file, one article | add a separate manifest mode later |
| `--replace` | currently replaces by `locale + slug` | keep this rule in later documentation, so nobody assumes it replaces by title or id |

## Recommended First-Stage Workflow

1. Copy an example source file.
2. Edit `meta`.
3. Edit `body.sections`.
4. Run a dry run:

```powershell
pnpm docs:import --file <path> --dry-run
```

5. With no errors, create the draft:

```powershell
pnpm docs:import --file <path>
```

6. Open the preview URL that was printed.
7. In the page, check:

- whether the route is correct
- whether validation shows 0 errors
- whether the reading styles are correct
- whether the collection sidebar is correct
- whether the outline is correct

8. Click `Confirm import`.
9. Check the import result on the live docs page.
