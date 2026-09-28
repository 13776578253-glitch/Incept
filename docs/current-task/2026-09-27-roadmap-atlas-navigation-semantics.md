# Roadmap and Atlas Navigation Semantics

## Problem

The roadmap page showed two controls named “路线图”: the board switcher had one board, also named “路线图”, and the project-surface switcher had a “路线图” tab. The Atlas catalog also listed `/atlas/roadmap` as one of its maps, conflating the roadmap product surface with the project maps.

## Changes

- Removed the redundant per-board switcher from the roadmap page. Each project has one roadmap surface; project selection remains in the toolbar, while the Roadmap/Atlas surface navigation appears once.
- Removed Roadmap from the Atlas catalog. Atlas now lists the Architecture and Keywords maps; Roadmap remains its own project surface at `/atlas/roadmap`.
- Updated bilingual Atlas descriptions and the catalog count to describe two maps for one project.
- Added a regression test that keeps `/atlas/roadmap` out of the Atlas catalog.

The Atlas navigation tab links to `/[locale]/atlas?project=<projectKey>`, the project's map catalog. Selecting a card there opens its map route. The Roadmap tab links separately to `/[locale]/atlas/roadmap?project=<projectKey>`.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `git diff --check`
