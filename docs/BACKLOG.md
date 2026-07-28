# Code Backlog

This is the reviewable backlog for explicit source-code TODOs. It intentionally does not duplicate historical task documents or broad product ideas that have no current code marker.

## Working Rules

- Do not delete a TODO merely because it is old.
- A completed or superseded TODO is rewritten in place as `history: <what replaced it>` when its source file is cleaned.
- Multiple TODOs describing one capability are consolidated into one canonical backlog item, then the duplicate source comments are converted to history notes.
- `Active` means a concrete next feature. `Deferred` means an intentional future direction. `Review` means the containing surface may be removed or merged before its TODO should be decided.

## Active

### B-01 Home Uses Mock Content

- Source: `apps/web/src/features/home/index.tsx:19`
- Status: Active product work.
- Replace the mock hero, `/test` links, mock cards, and mock image assets with real published content or a deliberately minimal landing page.
- This is a separate Home milestone; do not partially wire one mock card to production data.

### B-03 Markdown-like Heading And Section Model

- Source: `document/blocks/index.ts`
- Status: Active Docs-navigation work.
- Current behavior is already stable: `#` starts a section, while `##` through `####` become body heading blocks.
- Add a nested `On this page` outline derived from heading blocks, while preserving section IDs, block IDs, article-writing syntax, and the current section-level outline behavior for existing articles.

### B-04 Markdown-like Checklist Expansion

- Source: `document/state.ts:64-65`
- Status: Active parser-design work.
- Decide multiline checklist item syntax and whether nested checklist items are supported. Do not change IDs independently of the parser grammar.

### B-05 Structured Content Extensions

- Source: `block-system/schema/docs-block-types.ts:1`
- Status: Active only after the authoring contract is designed.
- Image support is complete. The remaining concrete candidate is `table`; embeds, video, timeline, and interactive blocks remain separate proposals rather than implicit additions.

## Deferred

### B-06 Multi-Article Markdown-like Source

- Sources: `document/state.ts:7`, `document/ids.ts:3`
- Status: Deferred.
- Current contract is one source file to one article import. Revisit only with a manifest or collection batch-import design; do not expand IDs pre-emptively.

### B-07 Additional Code Palettes

- Source: `features/docs/code-highlighting/palette.ts:5`
- Status: Deferred.
- Current `vscode`, `github`, and `vitesse` palettes plus the eye-comfort override are sufficient. Add palettes only with a named UX need and matching light/dark Shiki themes.

## Review Before Any Code Decision

### B-09 Retained Style Lab And Block Catalog

- Sources: `block-system/catalog/`, `block-system/examples/`, `[locale]/docs/style-lab`
- Status: Retained Owner-only test surface.
- Keep the source and route out of public navigation. Do not delete this original test layer during cleanup.
- Only convert its completed real-media and syntax-highlighting TODOs to in-place `history:` notes; any future expansion needs a concrete regression-testing purpose.

## History Candidates

These comments appear to describe work already completed. Do not edit them until the corresponding cleanup task is approved; then replace the original TODO text in place with the stated `history:` note.

| Source | Planned in-place history note | Evidence |
| --- | --- | --- |
| `features/docs/block-system/examples/docs-code-example-utils.ts:1-40` | `history: Shiki highlighting and language coverage were implemented; this helper remains a small code-string utility.` | Highlighter is no longer a future plan. |
| `features/docs/block-system/schema/docs-block-types.ts:1` image portion | `history: image blocks and local media publishing are implemented.` | Real Markdown-like image import was verified. |
| `features/docs/block-system/catalog/docs-block-catalog.ts:37` real-media portion | `history: real image import and preview validation now use the external content-root media pipeline.` | Placeholder catalog images are no longer the only validation path. |
| `document/state.ts:5-6` | `history: # creates a section and ## through #### already parse as body heading blocks.` | Existing parser behavior already covers the original TODO. |
| `document/state.ts:7` and `document/ids.ts:3` duplicate wording | `history: duplicated multi-article-source TODO consolidated under B-06.` | One deferred import-model item remains. |
| `server/docs/mappers.ts` annual descriptions | `history: Docs Home no longer renders per-year descriptions; the obsolete static description map was removed.` | The simplified Docs Home does not consume `group.description`. |
| `server/docs/mappers.ts` mapper consolidation | `history: Single-article and collection mappers remain separate because their route and sidebar contracts differ.` | The current split matches distinct route and sidebar contracts. |
| `packages/db/src/docs/types.ts:6` | `history: The current block union matches the implemented renderer and importer contract.` | The generic TODO had no actionable acceptance condition. |

## Execution Order

1. Review this backlog and confirm the proposed classifications.
2. Process one backlog item or one review surface at a time.
3. For approved history candidates, update the TODO at its original source location; do not create a second history list elsewhere.
4. Only after source TODO cleanup is stable, move on to dead-code removal, directory simplification, and current-task archival.
