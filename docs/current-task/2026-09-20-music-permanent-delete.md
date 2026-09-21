# Music: Permanent Delete Behind A Right-Click

## Status

Implemented and verified on 2026-09-20. Not committed at the time of writing; the proposed commit is `feat(web): delete music tracks and libraries for good`.

## Scope

The admin panel could only deactivate, so anything mis-uploaded stayed in the list forever and kept its media. A row now carries a right-click menu whose single item erases for good:

- `DELETE /api/internal/music/tracks/[trackKey]` drops the row and its memberships, then removes the mirror file **only when no other row (deactivated ones included) still references the same `audioUrl`** — the store is content-addressed, so one file can back several rows.
- `DELETE /api/internal/music/libraries/[key]` accepts only a library with no members that is not the last active one; every other case is refused by the rule in `planMusicLibraryDelete` and the menu shows the reason.
- Both routes keep the owner + same-origin gate and answer 404 to everyone else.
- The menu is two-step on purpose: the first click only reveals the confirmation ("删除后无法恢复…"), the second sends the request. It is content-sized (`min-w-[8.5rem] max-w-[15rem]`, compact paddings) rather than a fixed width, and Escape, an outside press or a scroll closes it.
- Responsibilities stay split the way the rest of the feature is: the pure rule and the executors live in `packages/db/src/music/manage.ts`, and the file removal is the route layer's job through `removeMusicMediaByUrl`, which refuses anything outside the mirror directory.

## Verification

| Check | Evidence |
| --- | --- |
| Unit suites | `pnpm test` — core 73, web 122; `pnpm typecheck` clean |
| Rules | `music-manage.test.ts` covers the library guard: an empty library may go, a library with members is refused, the last active library is refused, and a deactivated empty library may go |
| UI | The panel suite drives a real right-click (`fireEvent.contextMenu`) and asserts that the first click sends nothing, the confirmation issues `DELETE`, and the row disappears — once for a track and once for an empty library |
| Browser | With the owner session, right-clicking a track row opened the menu (title + `永久删除`), the confirmation showed the consequence text, and the row vanished after it — for all three mock tracks |
| Data | After the pass: 4 track rows (all real, all active, each in the library the owner had them in) and a mirror holding exactly their 4 mp3s. The three mock WAVs (`be6e3c80…`, `d7868b7e…`, `2e4c1166…`) are gone, so the file-removal path ran end to end |

## Known limits

- No trash and no undo: the delete is final, which is exactly why it sits behind a two-step menu.
- No bulk delete, and no "clean the unreferenced mirror files" entry point with a dry run — that stays open in B-21.
- A deleted track's `trackKey` is free again, and an import from a content root that still holds the file would recreate the row.
