# Docs Verification And Tag Contract Placeholder

## Status

Implemented in the working tree. Prepared for the next Git commit.

## Scope

This task records the verification pass over `docs/NEXT.md` and `docs/BACKLOG.md` against the working tree, plus the follow-up changes it produced:

- Verified every active NEXT item (B-01, B-04, B-05, B-06) and the BACKLOG surfaces against the actual source.
- Registered five source TODOs found during verification as B-10 through B-14.
- Added an unused `tags?: string[]` contract placeholder to the web page models and the db record types as B-15. No data model, query, or renderer consumes it, and the Docs home tag chip still falls back to `eyebrow`.
- Corrected stale BACKLOG line numbers and split the History Candidates table into verified-already-converted entries and remaining entries.
- Archived `2026-09-06-replace-publication-date-semantics.md` and `2026-09-09-frontend-ui-refactor-and-about-avatar.md` from `current-task/` to `finish-task/`.

## Verification findings

- B-01 still matches: `apps/web/src/features/home/index.tsx:19` is a TODO and the whole `features/home` module renders mock data with no database access.
- B-04 line reference was stale; the checklist TODOs are at `document/state.ts:63-64`.
- B-05 was still valid but its source marker is now a `history:` note; `table` is unimplemented across the block union, the renderers, and the importer.
- B-06 is implemented in code with no real-content acceptance evidence in the repository. The two collection migrations are already tracked by git.
- `prismaSchemaRevision` had not been bumped for the 2026-09-01 and 2026-09-02 schema changes.
- Both archived current-task documents described work that was already committed: `45bc70c` and `0edc55d` (merged through PR #1, `1e6be8c`).

## Main files

- `packages/db/src/client.ts`
- `packages/db/src/docs/import.ts`
- `packages/db/src/docs/types.ts`
- `apps/web/src/features/docs/importer/collection-directory.ts`
- `apps/web/src/features/docs/importer/validation.ts`
- `apps/web/src/features/docs/shared/types.ts`
- `docs/BACKLOG.md`
- `docs/finish-task/2026-09-06-replace-publication-date-semantics.md`
- `docs/finish-task/2026-09-09-frontend-ui-refactor-and-about-avatar.md`

## Constraints

- No existing comment was modified; the verification only added new TODO comments and the contract placeholder fields.
- No tag data model was introduced; the `docs_tags` and `docs_document_tags` draft remains unimplemented by decision.
- `NEXT.md` was left unchanged because its four active items still match the source.

## Follow-up checks

- Decide the tag direction: display-layer refinement, a minimal data model, or keeping the contract placeholder only.
- Close B-06 real-content acceptance before converting its source TODO markers to `history:` notes.
- Bump `prismaSchemaRevision` when the collection navigation models are accepted.

## Commit proposal

`chore(docs): verify next backlog and register tag contract placeholder`

[2026-09-10 19:24] - Update by AI完成改动:
- 修改了 `docs/BACKLOG.md`，修正 B-04/B-05/B-06 的失效行号与来源，拆分 History Candidates 为「已验证转换」与「剩余」，并新增 B-10 至 B-15 的代码级 TODO 登记。
- 修改了 `packages/db/src/client.ts`、`packages/db/src/docs/import.ts`、`apps/web/src/features/docs/importer/{collection-directory,validation}.ts`，按验收结论新增 5 条 TODO 注释，未改动任何既有注释。
- 修改了 `apps/web/src/features/docs/shared/types.ts` 与 `packages/db/src/docs/types.ts`，新增可选 `tags?: string[]` 契约占位（B-15），渲染层暂不消费，未引入标签数据模型。
- 修改了 `current-task/` 与 `finish-task/`，将两份已提交的过期任务文档（对应提交 `45bc70c`、`0edc55d`）归档并追加 Archive Note。
- 遗留问题: B-04 多行/嵌套 checklist 语法未定；B-05 `table` 创作契约未设计；B-06 真实 `--replace`、整批回滚、跨 locale folder label 仍未做真实数据库验收；标签方向待确认。
- Commit 建议: `chore(docs): verify next backlog and register tag contract placeholder`
