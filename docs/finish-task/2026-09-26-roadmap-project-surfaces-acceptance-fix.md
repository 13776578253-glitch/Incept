# Roadmap Project Surfaces — Acceptance Fix

## Scope

Follow-up to `a154a7b` after acceptance returned the project-surface delivery. This pass fixes the repository mapping assertion and records the implementation boundary and all newly introduced host touchpoints in the durable decision/backlog documents.

## Changes

- Updated `roadmap-repository.test.ts` to include `roadmapEnabled: true` and `atlasEnabled: true` in the expected `RoadmapProject`; searched the package and web tests for other whole-project equality assertions and found no additional matches.
- Extended B-28 with the per-project surface switches, the settings panel, public selectors/locked states, the exact `?locked=<surface>` meaning, and the outstanding Atlas persistence limitation.
- Named the new Settings and Atlas host files and the public route consumers in both roadmap integration-surface decision documents.
- Clarified that `?locked=<surface>` is only a navigation hint. The persisted project booleans are the state source; the query parameter does not grant or deny access.

## Verification

- `pnpm typecheck`: passed before this acceptance fix. Re-run after the docs/test-only edits.
- Tests and `pnpm --filter web build` previously compiled/started but failed when the Windows sandbox denied child-process creation (`spawn EPERM`). The reviewer independently reported the repository test suite with one failing assertion; this commit corrects that assertion. Re-run the package/root suite in an environment permitted to spawn test workers before merge.
- `git diff --check`: run before commit.

## Remaining Work

- Atlas entries remain in the static `apps/web/src/features/atlas/atlas-registry.ts`. This implementation supplies project selection and per-project surface enablement but does not create persistent project-scoped Atlas content or an Atlas content editor. Product/design follow-up is registered in `docs/BACKLOG.md` under B-28.
- Migration `20260926190000_add_roadmap_project_surfaces` remains undeployed from this worktree; deployment and seed execution require the main controller's authorized sequence.
