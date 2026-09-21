# NetEase `.ncm` Uploads Are Decrypted Silently

## Status

Implemented and verified on 2026-09-20. Committed as `0d2f532` (`feat(web): music gets its own settings section, row deletion and ncm uploads`).

> **Superseded on 2026-09-21 by `e48ab21`.** The validation described below now runs before the file is published, a `.ncm` that decrypts to an unreadable shell publishes nothing, and `DELETE` answers `{ trackKey }` instead of `mediaRemoved`. The body records the version that shipped in `0d2f532`.

## Scope

Songs downloaded from NetEase arrive as encrypted `.ncm` containers, so the owner had to run a separate converter before uploading. `POST /api/internal/music/tracks` now takes `.ncm` directly:

- The body is read into memory (same 128 MB cap), decrypted to the original mp3/flac, and stored through the content-addressed mirror under the **decrypted** format's hash — the mirror never holds encrypted bytes, and a song already in the library is reused rather than duplicated.
- The container's own metadata wins over the audio tags: the title comes from `musicName` and the artist from `artist` joined with `, `. That is what gives a NetEase download a real artist; the tag reader still supplies the duration, and a damaged metadata block falls back to the tags and then the file name.
- `.ncm` joins the accepted extensions in the file picker and the copy; nothing else in the UI changes — no switch, no separate flow.
- The decoder is `apps/web/src/server/music/ncm-decode.ts`, ported from the owner's `ncm-converter` library (`C:\CloudMusic\VipSongsDownload\ncm-converter`): the same container layout (`CTENFDAM` magic, the two fixed AES-128 key wrappings, the precomputed RC4 box) and the same error codes, reduced to what an upload needs — no file system access.

## Decisions

- **Port, do not depend on a path.** The converter lives outside the repository and its package is installed from a local directory; the decoder is ~200 lines of `node:crypto`, so the algorithm was ported into the server module with the origin noted, keeping the repo self-contained and typed.
- **The stored artifact is always plain audio.** Container bytes never reach the mirror or the player, so the playback path and the manifest/CLI path see exactly what an mp3 upload would have produced.
- **NetEase metadata beats the tags.** The tags of a converted NetEase file carry the performers glued onto the title and no artist at all; the container carries both separately. The panel keeps its read-only stance (B-22): recognition improves at the import boundary.
- **The audio path stays streaming.** Only `.ncm` is buffered, because the container cannot be decrypted piecewise; everything else still streams to disk while hashing.

## Verification

| Check | Evidence |
| --- | --- |
| Unit suites | `pnpm test` — core 73, web 128 across 15 files (6 new decoder cases); `pnpm typecheck` clean |
| Decoder | `ncm-decode.test.ts` builds containers in-process (the same encoding steps the converter's fixture script uses) and covers mp3 + flac payloads, metadata extraction, a bare MPEG frame sync, `NOT_NCM`, and both truncation paths |
| Real file, end to end | `curl` POST of `Pianoboy高至豪 - 第105天.ncm` (8.8 MB) with the owner cookie → `201`, `title: 第105天`, `artist: Pianoboy高至豪`, `durationSeconds: 218`, `mediaStatus: reuse` — the decrypted bytes were byte-identical to the mirror file the earlier manual conversion had produced |
| Cleanup | The three verification rows were removed through `DELETE /api/internal/music/tracks/[trackKey]`; each answered `200` (at the time with `mediaRemoved: false`, because the shared mirror file is still referenced by the original track). The database is back to its four rows and the mirror to its four mp3s |

## Known limits

- The embedded cover image is parsed but dropped: the schema has no cover field and the player does not render one.
- Decryption is synchronous CPU work on the request thread (~tens of ms for 10 MB); a `worker_threads` hand-off is the escape hatch if uploads ever get large or concurrent.
- Only NetEase's container is understood. Other stores' formats would be a separate decoder.
- A `.ncm` whose payload is neither mp3 nor flac is refused with a message; it is never stored.
