# Music Source And Import Pipeline

## Status

**Staged milestone.** The import-to-playback chain runs end to end on real data. The player itself is not feature-complete, and this round must not be described as a finished music feature.

**Committed as `1d77175`**, with the media store in `75f1ec4` and the table in `0df59c1`. The follow-up layer landed as `1c09f27`, which hardened the catalogue and added duration extraction at import; the preference channel (`01b3549`), the zh copy sweep (`393369c`) and the documentation (`8b43e46`) follow it. The branch `feat/music-Plugin` is eight commits ahead of its upstream and none of them is pushed.

## What this round delivered

| Phase | Scope | State |
| --- | --- | --- |
| 0 | Format, size cap, content root, deployment gates | Closed |
| 1 | `MusicTrack` model, migration, `prismaSchemaRevision` bump | Committed `0df59c1` |
| 2 | Content-addressed `media-store` under `public/_music-media` | Committed `75f1ec4` |
| 3 | `music:manifest` generator and `music:import` CLI | Functional acceptance passed |
| 3.5 | Core `tracksLoaded` runtime event | Acceptance passed |
| 4 | API route, catalogue hook, provider wiring | Chain verified; both P1 fixes passed manual review |

## Verified

- **Import idempotency.** A second run reports `0 created, 0 updated, 3 unchanged` and `0 to copy, 3 reused`. Content addressing means the mirror is never copied twice; `trackKey` means rows are never duplicated.
- **Failure recovery.** With an unreachable database the media is copied, the database write fails, the command exits non-zero, and the copied-file list is printed. Re-running after restoring the database reuses those files and leaves no duplicate rows.
- **Orphan detection.** `--validate` reports `orphanMirror`, `missingMirror`, `notImported`, `willDeactivate` and `staleAudioUrl`.
- **Import to playback on real data.** Manifest generation, import, database rows, API response and playback all run against real audio.
- **Core behaviour.** 73 tests, 0 failures, covering queue rules, playback modes, the `restartToken` restart semantics, the pause-before-ended ordering, and the catalogue transitions.
- **Boundaries.** `pnpm typecheck` is clean for `apps/web` and `@incept/music-player-core`.

## Not delivered

The following are **not implemented** and must not be described as available:

1. **Three playback controls have no entry point.** `nextRequested`, `previousRequested` and `seekRequested` exist in core with test coverage but nothing dispatches them. Registered as B-16. `repeatModeRequested` is no longer part of this item: it is dispatched from the persisted default-playback-mode preference, which is reachable from Settings → Plugin rather than from the player.
2. **No volume control.**
3. **No artwork.** The catalogue carries no image, and the orb and list rows render tonal circles.
4. **No transcoding.** FLAC and WAV are published as-is, so a single track can reach 100 MB. Recorded as deferred, not as a non-goal.
5. **Local delivery only.** The deployment platform is still undecided, so HTTP Range support is unverified. The object storage and CDN step is a release requirement, not an optimisation.
6. **No access control.** Music is public by decision. Files under `public/` cannot be gated, so this is a deliberate limit rather than an oversight.
7. **DOM-level paths are covered by `pnpm test`.** The web suite (Vitest + jsdom + Testing Library) covers the provider wiring, the effect ordering and the catalogue failure path, plus the adapter rules, the preference channel and the settings renderer; `pnpm test` aggregates web and core. Real playback, autoplay policy, pointer capture and geometry measurement remain browser-only, and the geometry hooks still have no tests (see B-18).

Closed since this list was first written: duration extraction runs during import and fills `durationSeconds`; the `--allow-empty` escape hatch is wired; `toCatalogEntries` rejects duplicate `trackKey`, non-positive durations, unparsable dates and unusable URLs; both P1 fixes passed manual review.

## Known trade-offs

- **Mirror reuse reads the whole file.** Verifying SHA-256 on reuse means every import reads the entire mirror. Correct, but it will be slow once the library is FLAC and WAV.
- **`findRepoRoot` is reused across features.** `server/music` imports it from `features/docs/importer/paths`. The helper is generic; it should move to a shared location once a third consumer appears.
- **Renaming a file makes it a new track.** Manifest entries are matched by `file`, and entries whose file disappeared are kept rather than pruned, because pruning would silently deactivate them on the next import.
- **No automatic publication dates.** File modification times were rejected as machine-dependent.

## Commit record

`feat: add the content-addressed music source and import pipeline` — landed as `1d77175`, subject unchanged. The body covers the media store, import CLI, manifest generator, the `tracksLoaded` core input, the public tracks API and the catalogue-driven player wiring, with the boundaries above stated in the commit note so the staged scope is unambiguous.
