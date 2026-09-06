# Docs Collection Navigation Foundation

## Status

Implemented in the current working tree as the B-06 directory-import and batch-sync foundation. The database migrations are applied locally, CLI and TypeScript checks pass, and the directory scanner and preview flow have been exercised.

The collection article write path has not yet completed real-content acceptance. In particular, a real collection `--replace` run, full-batch rollback, cross-locale folder labels, and the interaction between collection article replacement and homepage ordering still need explicit verification. Do not treat collection article replacement as fully accepted yet.

## Model

`DocsCollectionItem` now supports two navigation node types:

- `article`: references an independent `DocsDocument`.
- `folder`: contains no article body and only groups child nodes.

`parentId` defines the tree and `position` defines sibling order. Existing collection articles remain top-level article nodes and keep their existing routes.

## Directory Input

Numbered directories and files are interpreted as navigation structure:

```text
01-overview.docs.md
02-identity/
  01-principal.docs.md
  02-session.docs.md
```

The scanner validates consecutive sibling numbers, ignores unnumbered asset directories, rejects unnumbered article files, and limits folder depth to three levels. `documentKey` remains the article identity.

`pnpm docs:import --dir <path> --dry-run` prints the inferred tree. A normal directory command writes a batch draft for Owner preview; it does not bypass confirmation.

The batch flow also reports `created`, `updated`, `unchanged`, `renamed`, and `removed` nodes. `--replace` skips unchanged articles, reconciles folder labels by stable parent/position identity, marks removed nodes inactive, and writes the batch through one Prisma transaction.

## Remaining Verification

- Apply `20260902100000_add_collection_item_active` with `pnpm db:deploy` after stopping processes that lock Prisma engines.
- Verify a real three-level collection with mixed folders and articles.
- Verify existing collections and collection home entry behavior.
- Verify multilingual collections with matching article keys and locale-specific folder labels.
- Verify a real `--replace` batch skips unchanged articles and does not create redundant publication events.
- Verify a failing article rolls back the whole batch.

## Publication Date Boundary

For an existing article locale, `--replace` keeps the database `publishedAt` value. This is the first-publication date used by Docs Home ordering. Replacement time is recorded separately by `DocsPublicationEvent` with type `replaced`, and is exposed as the article's last-edited time.

This behavior has been type-checked but still requires real database acceptance for collection articles. A replace must not move an existing standalone article or collection entry on Docs Home merely because its source frontmatter contains a newer `publishedAt`.
