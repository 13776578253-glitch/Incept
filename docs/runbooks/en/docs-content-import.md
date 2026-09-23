# Docs Content Import And Collection Batch Manual

This manual explains how to import standalone Docs articles and folder-based article collections from a separate content directory. It applies to local development and local publication preview. Every command runs from the Incept repository root.

## 1. Import Model

The import chain has four steps:

```text
content directory -> CLI scan and parse -> Owner Preview -> Confirm -> PostgreSQL
```

Article source files and original images stay outside the Git repository. The importer converts Markdown-like files into the existing `DocsImportArticleSource`, then writes `DocsDocument`, locale rows, collection navigation nodes and publication events.

There are two CLI modes:

```powershell
# A single article
pnpm docs:import --file <path> [--replace] [--dry-run]

# One complete collection directory batch
pnpm docs:import --dir <collection-directory> [--replace] [--dry-run]
```

`--file` treats one article as the import unit; `--dir` treats one collection as the import unit. `--dir` does not merge articles into one large article — each `.docs.md` still creates or updates its own `DocsDocument`.

## 2. Configure The Content Root

Set an absolute path in the untracked `apps/web/.env.local`:

```env
DOCS_CONTENT_ROOT="D:\\Desktop\\docs-push"
```

That directory may live outside the repository, for example:

```text
D:\Desktop\docs-push\
├─ 2026-09-02\
│  └─ first-article.docs.md
└─ account-access\
   ├─ 01-overview.docs.md
   └─ 02-identity\
      ├─ 01-principal.docs.md
      └─ 02-session.docs.md
```

`--file` and `--dir` accept either a path relative to the content root or an absolute path:

```powershell
pnpm docs:import --file 2026-09-02/first-article.docs.md --dry-run
pnpm docs:import --dir account-access --dry-run
```

Markdown-like source files must live inside `DOCS_CONTENT_ROOT`. If the root is unconfigured, the source is outside the root, or the directory does not exist, the import fails before parsing.

## 3. Importing A Single Article

### 3.1 Write The File

Smallest standalone article:

```md
---
documentKey: first-article
locale: zh
routeType: singleArticle
slug: first-article
title: 第一篇文章
summary: 文章摘要。
kind: article
accessRole: guest
isListed: true
---

# 开始

这是文章正文。
```

`documentKey` is the cross-locale stable identity. Provide it for every new article, and keep it identical across the article's Chinese and English versions.

Body syntax follows Markdown-like v1. `#` creates a section, `##` through `####` create body headings. For images, code, lists, callouts and the rest, see the [docs-push README](../../../apps/web/src/features/docs/importer/docs-push/README.md) and the Markdown-like decision documents.

### 3.2 Dry Run

Run the read-only validation first:

```powershell
pnpm docs:import --file 2026-09-02/first-article.docs.md --dry-run
```

Check specifically:

- whether `Route type` is the expected value
- whether `Target route` is correct
- that `Errors` is `0`
- that the image operations report the right source path and final URL
- whether an existing slug or locale is being reused by mistake

`--dry-run` writes no draft, touches no database rows and copies no local images.

### 3.3 Create The Preview And Confirm Publication

Once validation passes, run:

```powershell
pnpm docs:import --file 2026-09-02/first-article.docs.md
```

The CLI prints a Preview URL. Open it in an Owner session, check the title, body, code highlighting and images, then click `Confirm import`.

Creating a draft is not publication. The article reaches the database only after the Owner confirms on the Preview page.

### 3.4 Update A Single Article

After editing the source file, dry-run first, then use `--replace` to create a replacement draft:

```powershell
pnpm docs:import --file 2026-09-02/first-article.docs.md --dry-run
pnpm docs:import --file 2026-09-02/first-article.docs.md --replace
```

Confirmation replaces the current locale's article content and writes one `DocsPublicationEvent` of type `replaced`. Without `--replace`, an existing locale cannot be overwritten.

## 4. Importing A Collection Directory

### 4.1 Directory Rules

Recommended structure:

```text
account-access\
├─ 01-overview.docs.md
├─ 02-identity\
│  ├─ 01-principal.docs.md
│  └─ 02-session.docs.md
├─ 03-revocation\
│  └─ 01-revoke.docs.md
└─ 04-empty-folder\
```

Rules:

- A `.docs.md` with a numeric prefix is an article node.
- A directory with a numeric prefix is an empty folder node, and may contain articles or further folders.
- The numeric prefix determines the sibling `position` and must be consecutive starting at `01`.
- Folder nesting is limited to three levels.
- Directories without a numeric prefix, such as `assets` and `media`, never enter the navigation tree.
- Empty folders are kept in the navigation tree.
- Folders hold no body content; articles remain independent documents.

### 4.2 Collection Identity

Every article in the collection fills in the same `collectionKey`:

```yaml
routeType: collectionArticle
collectionKey: account-access
collectionSlug: account-access
collectionTitle: 账户访问
```

The fields have different jobs:

| Field | Purpose |
| --- | --- |
| `collectionKey` | The stable collection identity in the database; it should not change with the title or URL. |
| `collectionSlug` | The collection URL for the current locale; it may differ between Chinese and English. |
| `collectionTitle` | The collection title for the current locale; it may differ between Chinese and English. |
| `documentKey` | The stable identity of one article inside the collection. |

For example, these two directory names are not collection identities:

```text
account-access\
account-access-new\
```

If articles in both directories use the same `collectionKey`, the importer resolves them to the same database collection. To create two distinct collections you must use different `collectionKey` values.

### 4.3 A Collection Article File

An example collection article:

```md
---
documentKey: principal
locale: zh
routeType: collectionArticle
slug: principal
title: Principal
summary: 访问身份的基础模型。
collectionKey: account-access
collectionSlug: account-access
collectionTitle: 账户访问
position: 1
accessRole: pro
---

# Principal

文章正文。
```

Inside a directory batch, the file name's numeric prefix is the authoritative source of ordering. For example:

```text
02-identity/01-principal.docs.md
```

The article ends up under the `identity` folder using that level's `position: 1`. So a directory batch must not rely on frontmatter `position` for ordering; the frontmatter value should agree with the file name, and the directory scan result is the batch's authoritative order.

### 4.4 Collection Dry Run

Run:

```powershell
pnpm docs:import --dir account-access --dry-run
```

Expected output includes:

```text
Docs collection directory scan
- Directory: D:\Desktop\docs-push\account-access
- Collection key: account-access
- Locale: zh
- Articles: 4
- 01 overview.docs.md (article)
- 02 identity (folder)
  - 01 principal.docs.md (article)
  - 02 session.docs.md (article)
- Errors: 0
- Warnings: 0

Batch changes
- created: overview (article)
- created: folder-root-02 (folder)
```

`--dry-run` only scans, parses, validates and computes the diff. It creates no draft and writes nothing to the database.

### 4.5 Create The Collection Preview And Publish

```powershell
pnpm docs:import --dir account-access
```

The command creates one batch draft and prints a Preview URL. In the page the Owner checks:

- the collection title and collection route
- the article list and article routes
- the folder/article nesting depth
- sibling order
- each article's body and media
- the change types in `Batch changes`

After confirmation, the collection's folders, articles, locale rows and publication events are written inside a single database transaction. If any article or folder write fails, the whole batch rolls back.

## 5. Collection Updates, Diff And Renames

After changing the collection, run:

```powershell
pnpm docs:import --dir account-access --dry-run
pnpm docs:import --dir account-access --replace
```

The batch diff may report these statuses:

| Status | Meaning |
| --- | --- |
| `created` | A new article or new folder. |
| `updated` | Body, metadata, parent node or position changed. |
| `unchanged` | The current database content matches the source exactly; the write is skipped. |
| `renamed` | A folder changed its name at the same parent and position. |
| `removed` | An old node that no longer exists in the source directory. |

### Folder Renames

A folder's stable identity is its parent node plus its sibling position, not its display name. For example:

```text
before: 02-identity\
after:  02-access-model\
```

As long as the parent and position are unchanged, the importer updates the existing folder's label and reports `renamed`; it does not create a second folder.

If the parent and the position both change, the system may read it as a move or as a new node replacing an old one. After changing the directory structure you must check the Preview; do not skip confirmation.

### Deleting Nodes

With `--replace`, old nodes that no longer exist in the source directory are marked inactive:

- they no longer appear in the collection navigation
- the article's `DocsDocument` is not physically deleted
- child folders and child articles are recursively deactivated
- publication history and article data are retained, so an accidental delete stays recoverable

So after deleting source files, do not only check the file system — confirm in the Preview that the `removed` list matches what you expect.

## 6. Images And Other Media In Collection Articles

Media directories must use names without a numeric prefix:

```text
account-access\
├─ assets\
│  └─ shared-architecture.png
├─ 01-overview.docs.md
└─ 02-identity\
   ├─ assets\
   │  └─ principal-flow.png
   ├─ 01-principal.docs.md
   └─ 02-session.docs.md
```

Article image paths are relative to the current `.docs.md` file:

```md
![Principal flow](./assets/principal-flow.png)
```

If the image sits in an `assets/` directory next to the article, a bare file name also works: the importer looks in the article directory and then in the sibling `assets/` directory.

```md
![Principal flow](principal-flow.png)
```

An explicit relative path wins; use `./assets/name.png` for new articles and treat bare file names as compatibility for existing ones.

A nested article references a collection-root shared image:

```md
![Shared architecture](../assets/shared-architecture.png)
```

The importer will:

1. verify the image still lives inside `DOCS_CONTENT_ROOT`
2. reject missing files, directories, non-image extensions and out-of-root paths
3. hash the image by content
4. produce a stable URL such as `/_docs-media/<hash>.png`
5. copy it into `apps/web/public/_docs-media/` on a normal import
6. keep exactly one mirror file per distinct content

Original images never enter Git. `public/_docs-media/` is a disposable local preview mirror and should be ignored by `.gitignore`. The database body stores the final site URL, never a local absolute path.

External images can be used directly:

```md
![External image](https://example.com/image.png)
```

An external URL is never copied into the local media directory.

## 7. Multilingual Collections

A `--dir` batch handles one locale at a time. Import Chinese and English separately, but use the same `collectionKey` and the same per-article `documentKey`:

```text
zh/account-access/01-overview.docs.md
en/account-access/01-overview.docs.md
```

The two sources may differ in:

- `collectionSlug`
- `collectionTitle`
- article `slug`
- article title, summary and body

They must stay identical in:

- `collectionKey`
- each article's `documentKey`
- the position of the same article
- the `accessRole` of the collection and of its articles

The database then holds one collection identity with one collection metadata row per locale, and the multi-locale rows sharing a `documentKey` remain one logical article, so writing contribution is not double-counted.

## 8. Automated Checks

Run the Markdown-like fixtures:

```powershell
pnpm docs:check-markdown-like
```

Run media validation:

```powershell
pnpm docs:check-media
```

Run the single-article and collection CLI regression:

```powershell
pnpm docs:check-import-cli
```

That check creates a temporary content root, exercises `--file` and `--dir --dry-run`, and deletes its temporary files afterwards. It never modifies real content.

After code or database changes, run:

```powershell
pnpm db:generate
pnpm db:deploy
pnpm --filter @incept/db exec tsc --noEmit
pnpm --filter web exec tsc --noEmit
git diff --check
```

If Prisma reports on Windows that `query_engine-windows.dll.node` is in use, stop the running Next, Node, Prisma or older CLI processes first, then run `pnpm db:generate` again.

## 9. Common Failures

### `DOCS_CONTENT_ROOT is required`

The CLI did not read the environment variable from `apps/web/.env.local`. Check the file name, the variable name and the absolute path, then reopen the terminal.

### `Errors: 0` but the Preview URL will not open

`--dry-run` writes no draft, so it produces no Preview URL. Run the command again without `--dry-run` and open the URL the CLI prints, in an Owner session.

### `collectionKey` mismatch

Check the `collectionKey` in every `.docs.md` inside the directory. One `--dir` batch must map to exactly one collection key.

### Non-consecutive or repeated numbering

Numeric prefixes in one directory must be consecutive starting at `01`:

```text
correct: 01-overview, 02-guides, 03-api
wrong:   01-overview, 03-api
wrong:   01-overview, 01-guides
```

### Image not found

Confirm the path is relative to the current article file and that the image lives inside `DOCS_CONTENT_ROOT`. In a collection, the `assets` directory must carry no numeric prefix, or it is interpreted as a navigation folder.

### Confirm fails

Go back to the source file, dry-run again, and use the newly generated draft. An old draft does not follow later source changes, and a draft containing validation errors cannot be confirmed.

## 10. Recommended Standard Flow

For day-to-day additions or edits, work in this order:

1. Create or edit the `.docs.md` and its `assets/` media inside `DOCS_CONTENT_ROOT`.
2. Run the matching `--file` or `--dir --dry-run`.
3. Check `Errors: 0`, the routes, the collection tree, the media operations and `Batch changes`.
4. For a new or updated article, drop `--dry-run` to generate the Owner Preview.
5. Check the rendered page in the browser.
6. Click `Confirm import` once it is right.
7. After publishing, open the live article and the collection home to confirm route, access, images and navigation.
8. After changing a collection directory, check `renamed`, `removed` and `unchanged` items specifically.

For long articles, the right-hand `On this page` rail keeps its title fixed and limits the outline list to about 40% of the viewport height; the list still scrolls with a wheel or trackpad, and a fade at the bottom indicates further entries. When reading enters a section outside the visible list, the outline scrolls smoothly to bring the active item back into view.

Do not edit the database body or navigation nodes directly to bypass the import flow. Source files, the CLI Preview and Confirm are the standard entry point for publishing content today.
