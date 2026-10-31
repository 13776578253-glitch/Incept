# Validation Evidence — 2026-10-31

This directory contains the raw command output used for the reliability baseline. All commands were run from `main` at the commit recorded in `git-rev.txt`.

| File | Command | Exit |
|---|---|---|
| `pnpm-test.log` | `pnpm test` | 0 |
| `pnpm-test-ops.log` | `pnpm test:ops` | 0 |
| `pnpm-typecheck.log` | `pnpm typecheck` | 0 |
| `pnpm-lint.log` | `pnpm lint` | 0 (warnings only) |
| `pnpm-build.log` | `pnpm --filter web build` | 0 |
| `production-image-verification.log` | Docker image/source/public asset verification | 0 |

`pnpm-test.log` covers the workspace suites: dashboard, sync-agent, web, roadmap, music, and sync-gateway. The web PostgreSQL/remote integration suites remain skipped because no isolated test database was configured; the skip is not counted as a pass.

The production verification log includes:

- image ID/digest `sha256:7a993a587b61cfcbc1f32ee931a857d502354b89aac65adb5ac842b76270bb7a`;
- source-file comparison against `e4875db` and `355987a`;
- 12/12 public Next asset SHA-256 matches;
- public health and usage endpoint responses.

The logs are UTF-16 because they were captured through PowerShell redirection; they are still raw command output and can be read with PowerShell or a UTF-16-aware editor.
