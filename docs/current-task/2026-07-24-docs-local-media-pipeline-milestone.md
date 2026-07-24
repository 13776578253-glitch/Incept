# Docs Local Media Pipeline Milestone

## Status

Completed and verified on 2026-07-24. Markdown-like Docs articles can now resolve local relative images from an external content directory and publish deterministic local preview mirrors without committing article media to Git.

## Content Source Boundary

Real authored `.docs.md` files and their original media live outside the repository. The local, untracked `apps/web/.env.local` config provides one absolute root:

```env
DOCS_CONTENT_ROOT="D:/Desktop/docs-push"
```

- Markdown-like `--file` values may be absolute paths inside this root, or paths relative to this root.
- TypeScript import examples keep their previous repository-relative behavior.
- A Markdown-like article and every local referenced image must resolve inside `DOCS_CONTENT_ROOT`.
- The parser and AST remain file-system independent; media resolution runs after conversion to `DocsImportArticleSource`.

## Authoring And Publish Flow

Articles reference local images relative to their own directory:

```md
![Architecture diagram](./assets/architecture.png "Optional caption")
```

During import, the media resolver validates the path, image extension, file existence, regular-file status, 10 MB maximum size, and real path containment. It accepts `avif`, `gif`, `jpeg`, `jpg`, `png`, and `webp`.

- `http://` and `https://` images remain external URLs.
- Existing site-relative URLs such as `/images/...` remain unchanged for backward compatibility.
- Local assets are SHA-256 hashed and converted in-memory to `/_docs-media/<hash>.<ext>`.
- The original Markdown file is never rewritten.
- Identical content is deduplicated to one generated mirror URL.

`--dry-run` validates and prints planned `publish` or `reuse` operations without copying files, writing a draft, or writing the database. A normal CLI import copies valid assets to the ignored `apps/web/public/_docs-media/` directory before creating the preview draft. All references are validated before any mirror is written, so a failed article import does not partially publish its other images.

The local mirror directory is intentionally not a content source and is Git ignored. A future R2/S3/OSS adapter can replace only the publishing implementation while preserving the authoring syntax and database URLs.

## Verified Article Migration

`account-access-architecture.docs.md` was moved to the external content root with its four images under `2026-07-24/assets/`, converted to relative image references, imported with `--replace`, and confirmed published.

The database now stores all four image blocks as `/_docs-media/<hash>.png`; no Docs database row references `/images/docs/account-access-architecture/...`.

The only remaining old references are in an ignored historical source copy under `apps/web/src/features/docs/importer/docs-push/`. It is not part of the active import flow. The old `apps/web/public/images/docs/account-access-architecture/` image files can be deleted after that historical copy is removed or archived, preventing accidental reuse of obsolete paths.

## Verification

Completed checks:

- `pnpm docs:check-media`
- `pnpm docs:check-markdown-like`
- `pnpm --filter @incept/db exec tsc --noEmit`
- `pnpm --filter web exec tsc --noEmit`
- Real content-root-relative article dry-run completed with zero errors and four planned media operations.
- Read-only database verification confirmed the published article uses only generated `/_docs-media/` URLs.

## Deferred

- Add a safe media cleanup CLI that deletes only generated files no longer referenced by any published or draft article.
- Replace the local mirror adapter with production object storage and CDN delivery before deployment.
- Decide whether to archive or delete ignored historical Docs source copies now that external content directories are authoritative.
