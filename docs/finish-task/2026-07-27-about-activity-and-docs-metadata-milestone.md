# About Activity And Docs Metadata Milestone

## Completed

This milestone turns the Owner-only About area into a real project record and adds derived metadata plus publication history to Docs.

- About content is backed by a private, unlisted Docs article (`documentKey: about`) rather than message JSON or hardcoded page copy.
- `DocsDocument.isListed` separates internal Docs-backed content from public Docs and Notes listings. About remains available only through its dedicated Owner-protected route.
- The application now uses an internal color-scheme provider instead of the `next-themes` runtime script path, avoiding the Next/Turbopack script-rendering warning.
- Docs and Notes message namespaces were reduced to the currently used copy, with Chinese and English keys kept aligned.
- Docs article headers now show a compact reading summary beside the back-to-list link:
  - Chinese articles: total Chinese characters and estimated reading minutes.
  - English articles: total words and estimated reading minutes.
  - The calculation includes visible prose, headings, lists, callouts, quotes, captions, title, and summary; it excludes fenced code blocks and link URLs.

## Activity Page

- `/[locale]/about/activity` remains Owner-only and has a Docs-style return link to About.
- Git activity is live rather than simulated:
  - `All GitHub` reads the authenticated GitHub account contribution calendar through GraphQL.
  - `Incept` reads commits from the configured repository default branch through the GitHub REST API.
  - Both sources group dates in `Asia/Shanghai` and use `All / current year / previous year` periods.
  - `All` means the trailing 52 weeks; explicit years mean calendar years.
  - GitHub responses are cached server-side for six hours. Missing configuration, API failures, rate limits, and account mismatches show an unavailable state without exposing secrets.
- Configure the local or deployment environment with:

```env
GITHUB_ACTIVITY_TOKEN=""
GITHUB_ACTIVITY_ACCOUNT="13776578253-glitch"
GITHUB_ACTIVITY_REPOSITORY="Incept"
```

- Writing activity now uses Docs publication data rather than preview arrays.
  - A daily contribution deduplicates by `DocsDocument` identity, so locale variants of one `documentKey` do not double count.
  - Repeated events for the same document on the same Shanghai date retain the largest writing-unit snapshot.
  - The warm contribution levels are fixed: no activity = 0, any article = 1, total writing units >= 1500 = 2, and >= 3000 = 3.
  - `writingUnits` is Chinese character count plus English word count. It is used for activity thresholds and is not a replacement for the locale-specific article-header display count.

## Publication History

- Migration `20260727090000_add_docs_publication_events` adds `DocsPublicationEvent`.
- Existing published documents were backfilled with one `published` event, selecting the Chinese locale where present to avoid bilingual duplicates.
- New document imports record `published` at the source `publishedAt` value.
- A real same-locale `replace` records `replaced` at confirmation time. Adding a new locale to an existing document does not create a duplicate publication event.
- New imports and replacements persist their `writingUnits` snapshot. Legacy backfilled events retain `0`; the activity query calculates their units from the current canonical body as a compatibility fallback because the historical JSON could not be safely counted in SQL.

## Database State

- `20260726090000_add_docs_document_listing` was applied previously for internal/unlisted Docs.
- `20260727090000_add_docs_publication_events` was applied locally and the Prisma client was regenerated.
- The current full schema snapshot is in `2026-07-27-current-database-schema.dbml`.

## Verified

- GitHub activity mock checks cover GraphQL calendars, repository commits, Shanghai date conversion, trailing-52-week ranges, and calendar-year ranges.
- Database read verification returned the migrated publication-event baseline and calculated writing-unit samples.
- `pnpm db:deploy`, `pnpm db:generate`, `pnpm --filter @incept/db exec tsc --noEmit`, `pnpm --filter web exec tsc --noEmit`, and `git diff --check` passed.
- ESLint remains unavailable because the repository has no ESLint 9 flat config (`eslint.config.*`); this is pre-existing and unrelated to this milestone.

## Deferred

- A Studio or About UI for browsing individual publication/replacement events.
- Historical body snapshots and full article-version rollback. Current events record timestamps and writing-unit snapshots only.
- Real writing activity filtering by article kind, tags, collection, or visibility.
- A safe cleanup policy for stale local Docs media mirrors.
