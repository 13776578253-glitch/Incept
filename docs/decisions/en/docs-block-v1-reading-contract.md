# Docs Block V1 Reading Contract

## Decision

The docs system is now formally entering the Block V1 stage.

This stage is not primarily about create, snapshot logic, or rich media. The priority is to lock a stable reading structure, stable visual language, and a stable data contract for future work.

The approved baseline is:

- docs content stays `page -> sections[] -> blocks[]`
- section titles remain part of page structure, not blocks
- section bodies may use `heading` blocks for internal hierarchy
- paragraphs may carry lightweight inline content

## Current Block Scope

Current standalone blocks:

- `heading`
- `paragraph`
- `list`
- `checklist`
- `callout`
- `quote`
- `divider`
- `code`
- `image`

Current paragraph inline content:

- `text`
- `link`
- `delete`
- `mark`
- `inlineCode`

This gives the reading side enough coverage for:

- standard long-form explanation
- internal heading hierarchy
- ordered and unordered lists
- task / checklist surfaces
- note, tip, attention, and warning content
- quotations
- multiline code blocks
- inline links, revision traces, highlights, and inline code
- standalone images

## Why This Scope Is Intentionally Limited

At this stage, the highest priority is not “more formats,” but “a stable baseline that create and AI can reuse without constant churn.”

Expanding too many blocks too early would make:

- renderers unstable
- create contracts noisy
- seed / DB / mapper / UI drift together

So V1 locks a focused set of formats that already covers most real technical writing needs.

## Reading Structure Rules

### 1. Page

`page` owns article-level structure:

- slug
- routeType
- layoutMode
- title
- description
- sidebarGroups
- outline
- sections

It is the container for the whole article.

### 2. Section

`section` is the top-level reading group inside a page:

- section id
- section title
- section description
- section blocks

Section titles stay at the page-structure level and do not move into blocks.

### 3. Block

`block` is the smallest independent reading unit.

Each block owns one clear semantic role, such as:

- a paragraph
- a quote
- a callout
- a multiline code sample
- an image

## Paragraph Inline Rules

Only five inline paragraph types are currently approved:

- `text`
- `link`
- `delete`
- `mark`
- `inlineCode`

Their intended roles are:

- `link` for inline navigation
- `delete` for deprecated phrasing or revision traces
- `mark` for local highlight
- `inlineCode` for commands, fields, paths, and type names

These remain inline, not standalone blocks, because they should stay attached to sentence flow rather than becoming separate reading units.

## Image Boundary

`image` is explicitly a standalone block.

It does not belong in paragraph inline content because:

- images occupy independent layout space
- images often need captions
- images need block-level rhythm with surrounding prose

So image content and inline content live on two different rendering levels.

## Responsibility Rules

### block-system

Location:

- `apps/web/src/features/docs/block-system/`

Responsibilities:

- define schema
- define presets
- define catalog metadata
- define example data

It answers:

- which blocks are allowed
- which fields each block supports
- which variants exist
- how create and AI should understand those formats

### renderers

Location:

- `apps/web/src/features/docs/shared/renderers/`

Responsibilities:

- render blocks into actual docs UI

It answers:

- what those blocks look like in docs

### components

Location:

- `apps/web/src/features/docs/shared/components/`

Responsibilities:

- assemble whole article pages
- handle article / section / rail / sidebar structure

It no longer owns block schema definition.

## Style Lab Role

`/[locale]/docs/style-lab` is now the approved validation surface for the current block system.

Its role is to:

- validate block styles inside a shell close to real docs reading
- review variants, spacing, wrapping, and rhythm one by one
- serve as a visual reference surface for future create and AI workflows

It is not end-user content. It is a long-lived internal style laboratory.

## Explicit Non-Goals For This Stage

This phase does not yet cover:

- create interaction
- snapshot table design
- multi-user collaboration
- final syntax-highlighting implementation
- full rich-media block expansion
- complex interactive blocks

These remain valid future directions, but they are intentionally deferred so Block V1 can stabilize first.

## Impact On The Next Phase

From this point on, docs create should build directly on top of this Block V1 contract.

The next phase should focus on:

- create page structure
- how create consumes the block catalog
- how block payloads are generated, sorted, and edited

Unless this baseline is explicitly revised, large new block expansion should be avoided before create is grounded on the current contract.
