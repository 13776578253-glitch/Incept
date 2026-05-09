# Docs Collection Sidebar and Series Routing Decision

## Decision

The docs system now formally distinguishes between:

- standalone articles
- collections

Collection articles no longer reuse the old "single article + section sidebar" meaning.

The new rules are:

- the left sidebar lists sibling articles in the collection
- the right rail continues to track sections in the current article
- collection articles use `/{locale}/docs/series/[collectionSlug]/[articleSlug]`
- standalone articles continue using `/{locale}/docs/[slug]`

## Why this changes

In the old setup, both sidebars effectively pointed at sections inside the current article.

That created three problems:

- duplicated responsibility between left and right rails
- no clean way to represent multi-article collections
- no stable semantic model for a future create flow

So the left rail is being redefined as collection navigation, while the right rail stays a section outline for the active article.

## Home Rules

- docs home may list both collections and standalone articles
- a collection appears only once on docs home
- collections do not expand their inner articles on the home page
- clicking a collection enters its first article directly
- home uses icons only to distinguish collections from standalone articles

## Route Rules

- `/{locale}/docs/[slug]`
  - standalone articles only
- `/{locale}/docs/series/[collectionSlug]/[articleSlug]`
  - collection articles
- `/{locale}/docs/reference`
  - temporary compatibility entry that redirects to the first article in the `document-shells` collection
- old `/{locale}/docs/document-shells`
  - removed and not kept as a compatibility path

## Data Rules

- collections use formal database models, not temporary JSON-only relationships
- docs home collection entries come from collection locale rows
- collection article bodies still come from the existing docs document locale rows
- in v1, all articles inside one collection share the same collection-level `accessRole`

## Create Impact

The future create flow should first ask whether the user is creating:

- a collection
- a standalone article

If the user creates a collection:

- create the collection first
- then add ordered articles into it
- the left sidebar is generated from collection article order

If the user creates a standalone article:

- generate a standalone docs route directly
- do not show a left collection sidebar
