# Docs Authoring: Markdown-like Rules (Superseded Plan)

> **Archived on 2026-09-23.** This is a planning draft, kept for history only.
> It was superseded by [docs-markdown-like-authoring-syntax.md](../../../decisions/zh/docs-markdown-like-authoring-syntax.md),
> which describes the parser that actually shipped, and by the authoring contract in
> `apps/web/src/features/docs/importer/docs-push/README.md`.
>
> Two things in this draft never shipped as written and must not be followed:
> its frontmatter uses `description` / `visibility`, whereas the implementation uses
> `summary` / `isListed`; and Phase 5 (`documentKey`) is not "later" work — `documentKey`
> is implemented and is the recommended identity for every new article.
>
> The original document exists only in Chinese; the English text below is a translation
> added on 2026-09-23 to close the bilingual gap. Originally at
> `docs/decisions/zh/docs-authoring-markdown-like-rules.md`.

## Goal

Establish an article input format that is easier to write than the current TypeScript / JSON-like import source.

This format's job is not to render pages directly, but to do this:

```text
Markdown-like source
  -> parser
  -> DocsImportArticleSource
  -> validation
  -> draft
  -> preview
  -> confirm import
```

In other words, Markdown-like is only the new "writing input layer"; the existing import chain is still reused downstream.

## Design Principles

| Principle | Explanation |
| --- | --- |
| Do not chase full Markdown | Support only the syntax docs articles need, so the parsing rules do not run away. |
| Explicit beats flexible | Every block should have a clear, stable, reportable way to write it. |
| Convert to the standard source first | The parser output must be a `DocsImportArticleSource`; it cannot bypass the existing validation. |
| Keep the advanced entry point | The current TypeScript source stays, as an advanced template and as the parser's output target. |
| Errors must be locatable | A parse error must state the line number, the block type and the reason. |
| Forbid dangerous content | The first version supports no raw HTML, script, iframe or event attributes. |

## Suggested Files

| File / Directory | Responsibility |
| --- | --- |
| `apps/web/src/features/docs/importer/parsers/markdown-like/index.ts` | Export the Markdown-like parser. |
| `apps/web/src/features/docs/importer/parsers/markdown-like/parse.ts` | Parse raw text into an intermediate structure. |
| `apps/web/src/features/docs/importer/parsers/markdown-like/to-source.ts` | Convert the intermediate structure into a `DocsImportArticleSource`. |
| `apps/web/src/features/docs/importer/parsers/markdown-like/errors.ts` | Define parse errors, line numbers and error types. |
| `apps/web/src/features/docs/importer/parsers/markdown-like/syntax.ts` | Centralise the supported syntax markers. |
| `apps/web/src/features/docs/importer/parsers/markdown-like/fixtures/` | Hold parser test articles. |
| `apps/web/src/features/docs/importer/parsers/index.ts` | Re-export the different parsers. |

## Document Metadata

An article uses frontmatter at the top of the file.

```md
---
kind: article
locale: en
slug: document-shells
title: Document Shells
description: A guide to document shell structure.
visibility: public
---
```

| Field | Required | Maps to | Notes |
| --- | --- | --- | --- |
| `kind` | yes | `kind` | The first version supports `article`; `collection` can be added later. |
| `locale` | yes | `meta.locale` | Articles are still imported one language at a time. |
| `slug` | yes | `meta.slug` | The page route slug. |
| `title` | yes | `meta.title` | The article title. |
| `description` | no | `meta.description` | The article summary. |
| `visibility` | no | `meta.visibility` | Suggested values `public` / `hidden`, to hide an article. |
| `documentKey` | not yet enabled | reserved | Later used to link the language versions of one article. |

## Block Syntax Rules

| Writing syntax | Maps to block | First-version status | Notes |
| --- | --- | --- | --- |
| `# Section Title` | section | supported | One level-one heading represents one section. |
| `## Heading` | `heading` | supported | Defaults to level 2. |
| `### Heading` | `heading` | supported | Defaults to level 3. |
| Plain paragraph | `paragraph` | supported | Consecutive non-empty text merges into one paragraph. |
| `- item` | `list` | supported | Unordered list by default. |
| `1. item` | `list` | supported | Ordered list. |
| `- [ ] task` / `- [x] task` | `checklist` | supported | Becomes a checklist block. |
| `> quote` | `quote` | supported | Consecutive quote lines merge. |
| ```` ```ts ```` | `code` | supported | The fence language maps to the code language. |
| `---` | `divider` | supported | Recognised only on a line of its own. |
| `![alt](src)` | `image` | supported | Requires `alt` and `src`. |
| `:::callout tone=info` | `callout` | suggested | An explicit container syntax avoids confusion with quote. |
| Tables | not supported | deferred | Complex tables are not mapped yet. |
| Raw HTML | forbidden | forbidden | Avoids security and rendering risk. |

## Inline Syntax Rules

| Writing syntax | Maps to inline | First-version status | Notes |
| --- | --- | --- | --- |
| Plain text | `text` | supported | The default inline node. |
| `[label](href)` | `link` | supported | `href` must be validated. |
| `` `code` `` | `inlineCode` | supported | Suited to short code fragments. |
| `==mark==` | `mark` | suggested | Corresponds to the existing mark inline. |
| `~~delete~~` | `delete` | suggested | Corresponds to strikethrough. |
| `**bold**` | not supported, or map to mark | undecided | Needs a decision on whether the block system should gain bold. |
| `_italic_` | not supported | undecided | Needs a decision on whether it is actually needed. |

## Suggested Callout Syntax

```md
:::callout tone=info variant=default title="Design note"
这里是 callout 内容。
:::
```

| Parameter | Required | Notes |
| --- | --- | --- |
| `tone` | no | Defaults to `info` and must come from the block presets. |
| `variant` | no | Defaults to `default` and must come from the block presets. |
| `title` | no | Optional title. |

For the first version, a callout should allow only plain paragraphs and inline content inside; it should not support nested complex blocks.

## Hidden Article Rules

Hidden articles must not be mixed into the same list-display logic as ordinary articles.

Suggested frontmatter:

```md
visibility: hidden
```

Explanation:

| visibility | Behaviour |
| --- | --- |
| `public` | May enter the docs list, collections and navigation indexes. |
| `hidden` | Does not enter any list; reachable only by direct link. |

If hidden articles later grow into their own module, this can be upgraded to a clearer `kind: privateArticle` or a separate import directory.

## Validation Rules

| Stage | What is validated |
| --- | --- |
| Parser stage | Whether frontmatter exists, whether syntax blocks are closed, whether unknown syntax is reported. |
| Source validation stage | Whether `DocsImportArticleSource` fields are complete, whether block types are legal, whether variant/tone come from the presets. |
| Preview stage | Whether it maps to `DocsArticlePageModel` and renders correctly. |
| Confirm stage | Slug conflicts, locale conflicts, the replace policy, and the database write result. |

## Error Handling

Error messages should stay as close to the writer's language as possible.

| Error type | Example message |
| --- | --- |
| Missing frontmatter | `第 1 行：缺少文章元信息 frontmatter。` |
| Unclosed container | `第 42 行：callout 没有使用 ::: 关闭。` |
| Unknown tone | `第 18 行：callout tone=warning 不在允许列表内。` |
| Image missing alt | `第 25 行：图片必须提供 alt 文本。` |
| Empty section | `第 10 行：section 至少需要一个内容块。` |

## First-Stage Scope

The first stage only solves "official articles are easier to write".

Prioritised support:

- frontmatter
- section
- heading
- paragraph
- list
- checklist
- quote
- callout
- code
- divider
- image
- link / inlineCode / mark / delete

Not supported yet:

- raw HTML
- tables
- block nested in block
- automatic multilingual `documentKey` linking
- automatic complex collection generation
- AI auto-repair of import errors

## Relationship To The Existing Templates

| Layer | Kept? | Notes |
| --- | --- | --- |
| Markdown-like source | new | For day-to-day writing and AI-assisted writing. |
| TypeScript `DocsImportArticleSource` template | kept | For advanced debugging, full style coverage and parser-output comparison. |
| Style lab example | kept | For block-system visual testing, not a day-to-day writing entry point. |
| Preview page | kept | Every import source must be previewed first. |

## Later Phases

| Phase | Goal |
| --- | --- |
| Phase 1 | Finish the Markdown-like parser so it can reliably produce a single article. |
| Phase 2 | Strengthen error location and block-level validation. |
| Phase 3 | Add separate listing/access rules for hidden articles. |
| Phase 4 | Add collection authoring syntax. |
| Phase 5 | Add `documentKey` to solve bilingual article linking. |
