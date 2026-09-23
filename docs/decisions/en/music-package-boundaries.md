# Music Package Boundaries

## Status

Accepted on 2026-09-22. These 16 decisions fix the boundaries of the `@incept/music` extraction; the migration phases are specified in `docs/current-task/2026-09-23-music-package-migration-plan-v2.md`. Implementation commit references are appended here per phase.

## Context

The music feature ships as roughly 6,400 lines of implementation plus 3,400 lines of tests, spread across six places in `apps/web` (features, server, api, settings, layout mounts, scattered preferences) plus `packages/db/src/music` and the root `scripts/music-*.mjs`. The feature is complete and stable, which makes now the right time to extract it into a standard module. The goal is `packages/music` (`@incept/music`) as an in-process feature package carrying its own domain / application / ports / adapters / react / next / cli layers, while the host keeps only mount registration, route stubs, an `authorizeOwner` adapter and path assembly. No service split, no database split, zero behaviour change.

## Decision

The sixteen decisions, in the order they were settled:

1. **Package framework is a layer gradient.** domain / application / ports may not import React, Next or Node built-ins; react may import React; next may import `next` / `next/server`; cli and adapters may use Node.
2. **`@incept/music-player-core` stays its own package.** The music domain depends on it; its zero-dependency mechanical boundary and its tests stay as they are.
3. **Boundaries are enforced by** package `exports`, layered tsconfigs, pnpm isolation and a per-package `typecheck`. Lint / import-boundary infrastructure is a separate task.
4. **The data layer belongs to the package.** The package defines `MusicRepository` and owns the business rules plus a `PrismaMusicRepository` adapter; `@incept/db` permanently keeps the schema, the migrations and the Prisma client. This migration generates no Prisma migration.
5. **Media and filesystem implementations move into the package; paths are injected.** `contentRoot` and `mirrorDirectory` are supplied by host / CLI assembly, and the `findRepoRoot` cross-feature dependency is removed.
6. **The auth port is one gate:** `authorizeOwner(request): Promise<boolean>`. Music never learns the session model, role names or the same-origin policy; the public catalogue route stays ungated.
7. **Preferences and browser storage move to the react layer with unchanged keys.** The provider, the hook and both localStorage key constants ship with the package; the values stay `incept-music-player-preferences` and `incept-music-player:v1:floating-ui`.
8. **Settings extension is a minimal `SettingsSectionContribution`:** id, label, visibility, order, an optional owner-gated server loader, and a whole-panel React component. No row-control or renderer registration system.
9. **Global mounting is a typed mount manifest** with three contribution kinds: ordered provider wrappers (two wrap depths: provider chain and root layout), floating overlays, and named layout slots.
10. **The API URL contract** is an exported `musicEndpoints` constant plus path stubs: the web app places re-export stubs at the agreed App Router paths, and scattered in-component URLs disappear.
11. **Styles and layering contract:** component styles ship with the package; global layering variables (z-index, navbar height, safe area) are owned and assigned by the host, and the package declares the variable list it needs (including runtime `getComputedStyle` reads).
12. **Tests migrate with their code** (Vitest inside the package for React / route / fs tests; core keeps `node:test`); fixtures must not depend back on the host.
13. **CLI implementations move into the package; root scripts only forward.** The CLI takes explicit configuration or `--env-file`, and never dynamically imports web source again.
14. **Build and style scanning are part of the migration,** not optional polish: `transpilePackages`, the Tailwind v4 `@source` scan and the root typecheck chain are migration inputs.
15. **Migration strategy:** the minimal module mechanism first, with music as the first complete migration sample; phases advance and are accepted one by one.
16. **Migration depth is an in-process package plus ports plus mount stubs.** The shared PostgreSQL database, the Prisma schema and the deployment process do not change; no service split.

Three clarifications that supersede earlier drafts:

- **Data layer:** the early draft's "move schema/migrations into the music package in step two" is cancelled. `@incept/db` permanently owns schema, migrations and client.
- **Auth:** the port is the single gate function `authorizeOwner`; it exposes no viewer, role or same-origin detail.
- **Settings:** the earlier "6+1 slot primitives" shrink to the minimal `SettingsSectionContribution`; the account section is not migrated now.

## Rejected alternatives

| Option | Why not |
| --- | --- |
| A standalone music service with its own port and deployment | Decision 16: the deployment process stays one process; the cost is not justified by the current load. |
| Moving the Prisma schema and migrations into the music package | Decision 4: the database is shared, and `@incept/db` is its permanent home; splitting it would create two migration histories. |
| A full settings plugin framework (row controls, custom renderers, section renderer overrides) | Decision 8: the only real consumer needs one whole-panel section; the framework would be speculation. |
| Migrating the account section in the same pass | Out of scope; it migrates later on the same primitives. |
| A `music-check-*` style compatibility layer inside the package | Kept as root script aliases for now; cleanup is registered as a frozen-state leftover. |
| Keeping `findRepoRoot` path discovery inside the package | Decision 5: paths are assembly concerns; a package that resolves repo roots breaks pnpm isolation. |

## Consequences

- Behaviour is frozen by contract: endpoints, upload / dedup / NCM handling, import dry-run output and player interactions must not change across the migration.
- Music grows only through ports / adapters / the registration surface (mount manifest and `SettingsSectionContribution`); host-side edits stay limited to stubs, assembly and registration entries.
- Host clients pass `authorizeOwner` in at assembly time; nothing in the package may read sessions or roles.
- The two localStorage keys and the CSS variable contract (`--z-feature-floating`, `--navbar-height`, including the runtime read in `use-floating-position`) are part of the compatibility surface and must survive the migration unchanged — except the z-index variable rename, which happens once in Phase 7 with every reference updated.
- The service-side loader closures of settings contributions live in a server-only registration (`src/mount/server.ts`) so server-only code never enters the client bundle graph.
- Boundaries are enforced by `exports` plus layered tsconfigs plus pnpm isolation plus per-package typecheck; a lint-level import-boundary rule remains a separate task.
- Implementation commit references, one line per phase, are appended to this document as the phases land.

## Implementation commits

From 2026-09-23 on, work is delivered as one commit per round; the phase notes below name the round that landed them, and `git log` holds the commit.

- **Phase 0 — decision records and baseline (2026-09-23 round).** This decision record pair, the revised migration plan v2 (with the Phase 0 baseline appendix), the `@incept/db` typecheck script and its root chain wiring (risk R2 stayed clear) landed together in that round's single commit.
- **Phase 1 — minimal module mechanism (2026-09-23 round, same commit).** `apps/web/src/mount` (manifest types, an empty static registry with reserved-id guards, the server-only loader registry, 9 tests) plus the root layout, provider chain, locale layout and settings page wiring. The registry stays empty until Phase 7.
- **Phase 2 — package skeleton and data layer (2026-09-23 round).** `packages/music` lands with the six-layer exports and the layered boundary tsconfigs; the pure/execution split of manage/upload, the catalog shapes and selection constants in domain, the `MusicRepository` port (11 use-case methods), the git-mv of 10 files plus 3 tests, the atomic 18-import rewrite (10 production + 6 test files), the `./music` export removal from `@incept/db`, and the transpilePackages/workspace-dependency wiring all land in that round's single commit. Open ruling: `keys.ts`'s `node:path` versus the domain no-Node gradient (bridged in place with zero behaviour change).
