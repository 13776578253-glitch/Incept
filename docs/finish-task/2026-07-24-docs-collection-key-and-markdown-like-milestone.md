# Docs Collection Key And Markdown-like Milestone

## Status

Completed and verified on 2026-07-24. Docs collections now have a stable cross-locale identity, and Markdown-like sources can import one collection article per file through the existing draft, preview, and confirmation flow.

## Collection Identity

`DocsCollection.collectionKey` is an optional unique database field, parallel to `DocsDocument.documentKey`.

- Existing unkeyed collections remain valid.
- A keyed source resolves its collection by `collectionKey` before considering the locale-specific collection slug.
- The same collection can have distinct Chinese and English slugs, titles, summaries, and eyebrows.
- A legacy unkeyed collection can be claimed when a keyed source matches its existing locale and slug.
- A keyed collection cannot later be updated by a source that omits its key.

The collection importer also prevents two unsafe cross-locale changes:

- Locale variants of the same `documentKey` cannot use different collection positions.
- A document already assigned to one collection cannot be silently moved to another collection.

## Markdown-like Collection Source

Collection articles remain one `.docs.md` file per article. The body uses exactly the same section and block syntax as a single article; only frontmatter changes.

```md
---
documentKey: access-control-session-model
locale: zh
routeType: collectionArticle
kind: article
accessRole: pro
slug: session-model
title: 会话与访问状态
summary: 说明身份授权后的会话生命周期。
collectionKey: access-control
collectionSlug: access-control-zh
collectionTitle: 无账户访问控制
collectionSummary: 个人博客的可撤销阅读授权设计。
collectionEyebrow: 系统设计
position: 2
---

# 会话状态

{paragraph variant=lead spacing=relaxed} 正文语法与 single article 相同。
```

Rules:

- `collectionKey`、`collectionSlug`、`collectionTitle` and `position` are required.
- `collectionKey` uses lowercase letters, numbers, and hyphen separators.
- `layoutMode` defaults to `sidebar`; an explicit value must also be `sidebar`.
- `kind: note` is not allowed for collection articles.
- All articles in a collection share one `accessRole`; translated variants share one `position`.

## Verification

Completed checks:

- Prisma migration `20260723100000_add_docs_collection_key` applied successfully.
- Prisma client regenerated after stopping the local development server to release its Windows engine DLL lock.
- `pnpm --filter @incept/db exec tsc --noEmit`
- `pnpm --filter web exec tsc --noEmit`
- `pnpm docs:check-markdown-like`
- Single and collection Markdown-like fixture `docs:import --dry-run` commands completed with zero errors.
- The existing TypeScript collection example dry-run completed with zero errors.
- A temporary database integration check confirmed one collection, two locale rows, and one collection item for matching Chinese and English `documentKey + collectionKey` sources; it also confirmed rejection of mismatched position, mismatched access role, missing key updates, and conflicting keys. All temporary database rows and scripts were removed.

## Deferred

- Refresh the full Markdown-like writing README, whose older frontmatter table predates `documentKey`, collectionKey, and the current access-role enum.
- Add real authored collection articles and review their preview/published sidebar experience.
- Media publish pipeline for copying or uploading source assets; current image URLs still require manually published assets.
