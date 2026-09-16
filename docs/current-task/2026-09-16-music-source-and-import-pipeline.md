# Music Source And Import Pipeline

## Status

**Staged milestone.** The import-to-playback chain runs end to end on real data. The player itself is not feature-complete, and this round must not be described as a finished music feature.

Prepared for the next Git commit. Not pushed.

## What this round delivered

| Phase | Scope | State |
| --- | --- | --- |
| 0 | Format, size cap, content root, deployment gates | Closed |
| 1 | `MusicTrack` model, migration, `prismaSchemaRevision` bump | Committed `0df59c1` |
| 2 | Content-addressed `media-store` under `public/_music-media` | Committed `75f1ec4` |
| 3 | `music:manifest` generator and `music:import` CLI | Functional acceptance passed |
| 3.5 | Core `tracksLoaded` runtime event | Acceptance passed |
| 4 | API route, catalogue hook, provider wiring | Chain verified; two P1 fixes pending re-verification |

## Verified

- **Import idempotency.** A second run reports `0 created, 0 updated, 3 unchanged` and `0 to copy, 3 reused`. Content addressing means the mirror is never copied twice; `trackKey` means rows are never duplicated.
- **Failure recovery.** With an unreachable database the media is copied, the database write fails, the command exits non-zero, and the copied-file list is printed. Re-running after restoring the database reuses those files and leaves no duplicate rows.
- **Orphan detection.** `--validate` reports `orphanMirror`, `missingMirror`, `notImported`, `willDeactivate` and `staleAudioUrl`.
- **Import to playback on real data.** Manifest generation, import, database rows, API response and playback all run against real audio.
- **Core behaviour.** 73 tests, 0 failures, covering queue rules, playback modes, the `restartToken` restart semantics, the pause-before-ended ordering, and the catalogue transitions.
- **Boundaries.** `pnpm typecheck` is clean for `apps/web` and `@incept/music-player-core`.

## Not delivered

The following are **not implemented** and must not be described as available:

1. **Four playback controls have no UI.** `nextRequested`, `previousRequested`, `seekRequested` and `repeatModeRequested` exist in core with test coverage but nothing dispatches them. Registered as B-16.
2. **No volume control.**
3. **No duration extraction.** `durationSeconds` is always null; the player reads duration from the audio element.
4. **No artwork.** The catalogue carries no image, and the orb and list rows render tonal circles.
5. **No transcoding.** FLAC and WAV are published as-is, so a single track can reach 100 MB. Recorded as deferred, not as a non-goal.
6. **Local delivery only.** The deployment platform is still undecided, so HTTP Range support is unverified. The object storage and CDN step is a release requirement, not an optimisation.
7. **No access control.** Music is public by decision. Files under `public/` cannot be gated, so this is a deliberate limit rather than an oversight.
8. **Empty manifests are rejected by default,** and the `--allow-empty` escape hatch is not wired, so a deliberate full deactivation is currently impossible.
9. **Catalogue response validation is not hardened.** Duplicate `trackKey`, negative durations, malformed dates and off-site URLs are still accepted.
10. **Two P1 fixes await browser re-verification.** Selecting a track while paused must play the new source, and a catalogue refetch must not interrupt playback. Both are implemented; neither is confirmed in a browser.
11. **No automated tests for the catalogue path or the provider wiring.** `apps/web` has no test runner, so this logic can only be exercised in a browser today.

## Known trade-offs

- **Mirror reuse reads the whole file.** Verifying SHA-256 on reuse means every import reads the entire mirror. Correct, but it will be slow once the library is FLAC and WAV.
- **`findRepoRoot` is reused across features.** `server/music` imports it from `features/docs/importer/paths`. The helper is generic; it should move to a shared location once a third consumer appears.
- **Renaming a file makes it a new track.** Manifest entries are matched by `file`, and entries whose file disappeared are kept rather than pruned, because pruning would silently deactivate them on the next import.
- **No automatic publication dates.** File modification times were rejected as machine-dependent.

## Commit proposal

`feat: add the content-addressed music source and import pipeline`

Body: the media store, import CLI, manifest generator, the `tracksLoaded` core input, the public tracks API and the catalogue-driven player wiring, with the boundaries above stated in the commit note so the staged scope is unambiguous.
