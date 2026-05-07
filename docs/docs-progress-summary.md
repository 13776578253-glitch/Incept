# Docs Progress Summary

## Current Stage

The project has moved from a docs UI prototype into the first real full-stack docs milestone.

Current status:

- PostgreSQL is running locally through Docker
- Prisma schema, migration, and seed are in place
- `packages/db` exists and now owns docs queries
- `apps/web` reads docs data through server loaders instead of route-level mock reads

## What Is Already Working Structurally

The docs route model is now aligned with the current product direction:

- `/{locale}/docs`
  - docs main entry
- `/{locale}/docs/reference`
  - compatibility alias
- `/{locale}/docs/[slug]`
  - canonical article detail route

The frontend now has a cleaner separation:

- `packages/db`
  - Prisma client
  - docs query layer
  - seed data
- `apps/web/src/server/docs`
  - loader and mapper layer
- `apps/web/src/features/docs`
  - UI rendering only

## Current Milestone Result

The main milestone achieved in this phase is:

- docs home and docs detail are no longer designed as mock-only pages
- both are now wired toward a shared database-backed read flow
- mock-specific types have been removed from the main docs component chain

This means the project is now in the right shape to continue into:

- validation and cleanup
- admin/create flows
- future publish/edit workflows

## Remaining Reality Check

This phase is close to complete, but should still be treated as a working integration pass until you manually verify:

- `/en/docs`
- `/en/docs/document-shells`
- `/en/docs/reference`
- `/zh/docs`
- `/zh/docs/document-shells`

After those checks pass, the current docs read architecture can be treated as the new baseline.
