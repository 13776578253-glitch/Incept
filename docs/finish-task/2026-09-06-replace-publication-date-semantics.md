# Replace Publication Date Semantics

## Status

Implemented in the current working tree. This change is prepared for the next Git commit.

## Decision

`publishedAt` and the last-edit time have different meanings:

- `publishedAt` is the first publication time of a locale and controls Docs Home ordering.
- A standalone article `--replace` keeps its existing database `publishedAt`.
- A collection article `--replace` follows the same rule.
- A newly created article or newly added locale uses the `publishedAt` from its source.
- A replacement creates a `DocsPublicationEvent` with type `replaced`; its `occurredAt` records the actual replacement time.
- Article detail pages can use the latest publication event as the last-edit time.

Changing source frontmatter after publication must not move an existing article to the top of Docs Home. The importer's replace path rewrites the article content and metadata while preserving the original publication date.

## Verification

Passed:

- `pnpm --filter @incept/db exec tsc --noEmit`
- `git diff --check`

Still required before considering the collection path accepted:

- Run a real collection `--replace` and confirm unchanged articles are skipped.
- Confirm a changed collection article keeps its original `publishedAt` and receives one `replaced` event.
- Confirm a failed article rolls back the complete collection batch.
- Confirm Docs Home ordering remains based on first publication time.

Standalone article replacement is the established behavior. Collection article replacement remains explicitly unverified with real content.

## Archive Note

Archived to `finish-task/` on 2026-09-10. The change described above was committed as `45bc70c fix: preserve original publication date on replace`, so the "prepared for the next Git commit" status no longer applies. The remaining real-database acceptance for collection `--replace` is still open under B-06 and the 2026-09-01 collection navigation milestone.
