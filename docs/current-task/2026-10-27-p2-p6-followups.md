# P2–P6 Follow-Ups: Watermark CLI, Tray Auto-Start, Disk Cleanup, Roadmap Check, Dependency Alignment

## Status

P2, P3, P4, P5 and P6 are complete. P5’s Owner visual acceptance was confirmed on 2026-10-27. Nothing in this round was committed, pushed or deployed; production still runs `20261027` (`973e714`).

## P2 — Ledger Watermark CLI Uses The Supplied Watermark Path

- `scripts/sync-config.mjs`: `validateAuthoritativeLedgerGate(env, watermarkFile)` now resolves and reads the explicit watermark file; the DB-adjacent path remains only the default.
- `scripts/ledger-watermark.mjs`: `check`, `generate` and `advance` now pass their `watermarkFile` argument into the gate.
- `deployment/ledger-watermark.md`: documents that all three actions honor the explicit path.
- `scripts/production-sync-config.test.mjs`: new regression creates a DB with a rejecting adjacent watermark plus a valid explicit watermark elsewhere; `generate`, `check` and `advance` pass on the explicit path, while the default check still fails on the adjacent floors.
- Verification: `node --test scripts/production-sync-config.test.mjs` → 9/9 passed; `pnpm test:ops` → 157 passed / 1 skipped.
- Not yet deployed. The next image will carry the fixed CLI; no migration is involved.

## P3 — Tray Login Auto-Start Reliability

- `apps/sync-tray/src/AgentClient.cs`: auto-start now writes **two** current-user triggers: the existing Startup-folder shortcut and the `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\InceptSync` value. Both pass `--no-show`. Disabling removes both. `IsAutoStartEnabled()` accepts either.
- `apps/sync-tray/src/TrayContext.cs` / `Program.cs`: parses `--no-show`; a duplicate instance exits without popping the status card. Startup also logs to `%LOCALAPPDATA%\Incept\sync-agent\tray.log`, catches unhandled UI exceptions, and waits up to 20s for Explorer’s shell window when launched at login.
- `apps/sync-tray/src/SettingsForm.cs`: after the toggle, the checkbox reflects the real `IsAutoStartEnabled()` state, including partial-success cases.
- `apps/sync-tray/tests/ReflectionTests.cs`: added the quoted auto-start command/`--no-show` test and the `Options.Parse("--no-show")` test.
- `apps/sync-tray/README.md`: documents both triggers, `--no-show`, `tray.log`, and the 51-test count.
- A per-user logon **scheduled task** was tested as an alternative and rejected: `schtasks /Create /SC ONLOGON` returns `Access is denied` without elevation, while the tray’s documented boundary is no administrator requirement.
- Verification: `tools/build.ps1` succeeded; `tools/test.ps1` → **51 passed / 0 failed**.
- Local application: the packaged exe is `dist\Incept Sync\InceptSync.exe`; the Startup shortcut and Run value both point there with `--no-show`; a second `--no-show` launch exited 0 and logged `already-running noShow=True`; the first tray stayed running and wrote `started` to `tray.log`.
- Packaging note: `tools/package.mjs` cannot delete the staging directory while the agent runs from it (`EPERM`). The zip was rebuilt in place from the existing staging directory after copying the new exe, README and Windows scripts.
- Remaining: a real Windows reboot has not been performed. The last boot evidence showed the agent starting about 38s after boot, but the tray process start time was later, which is why the dual trigger and startup log were added.

## P4 — Production Disk Cleanup

- Deleted `/srv/incept/incoming/incept-20261023.tar` (366 MB).
- Deleted Docker images:
  - `incept-v4-release:20261023`
  - `incept-v4-release:gate-20261022`
  - `incept-v4-release:20261020`
  - `incept-v4-auto-sync-fix:20261020-r1`
  - `incept-v4-auto-refresh:20261020`
- Kept the current and previous release images: `incept-v4-release:20261027` (`88aeaa4cc572`) and `incept-v4-release:20261025` (`55052cb2923e`). Running containers were not touched.
- Disk result: `32G/39G` used (81%, 7.7G available) → `28G/39G` used (72%, 11G available), about 5.3G reclaimed.
- Deliberately left for a later decision: `incept-sync-*` and `incept:*` historical images (about 9G) and the older `incoming` directories (`98b77ff`, `release-2-20261015-7bee9ad`, `release-2-fix-20261016-1a29a92`, `content-20261014`, about 1.3G). They are outside the “last two release generations” rule used here.

## P5 — Roadmap “+” Visual Acceptance

- Code/test side verified: `pnpm --filter @incept/roadmap test` → 7 files / **76 tests passed**; the board test asserts the create action sits immediately left of Import and is absent without the callback. `pnpm --filter web exec vitest run src/features/roadmap/__tests__/roadmap-page.test.tsx` → 8/8 passed.
- **Owner acceptance:** confirmed on 2026-10-27. The Owner checked the server-side toolbar “+” and accepted it.

## P6 — ESLint Config Alignment

- `apps/web/package.json`: `eslint-config-next` `16.4.0` → `16.4.3`; `pnpm install` refreshed `pnpm-lock.yaml` (registry retries, final install succeeded).
- `pnpm lint` → 0 errors, 9 pre-existing warnings (unused test/import variables and two `<img>` warnings; none introduced by this round).
- `pnpm --filter web list eslint-config-next --depth 0` → `eslint-config-next@16.4.3`.

## Verification Summary

| Check | Result |
| --- | --- |
| `pnpm test:ops` | 157 passed / 1 skipped |
| `pnpm --filter @incept/roadmap test` | 76 passed |
| `pnpm --filter web exec vitest run src/features/roadmap/__tests__/roadmap-page.test.tsx` | 8 passed |
| Tray `tools/test.ps1` | 51 passed / 0 failed |
| `pnpm typecheck` (full workspace) | passed |
| `pnpm lint` | 0 errors / 9 pre-existing warnings |
| `git diff --check` | clean |

## Remaining

1. P3: real reboot check; `tray.log` should show the startup source and any shell wait.
2. P2/P6: include in the next image/release; P2’s CLI fix and P6’s lint dependency are not in the running production image today.
3. P4: optional later cleanup of the historical `incept-sync-*` / `incept:*` images and old `incoming` directories.
