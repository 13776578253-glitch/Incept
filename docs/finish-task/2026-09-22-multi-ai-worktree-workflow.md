# Multi-AI Worktree Workflow

## Status

**Closed on 2026-09-23.** Delivered, committed as `fc68715 feat(scripts): add the multi-AI worktree workflow tooling and runbook`, and moved from `docs/current-task/` to `docs/finish-task/`.

The delivery is the tooling plus the bilingual runbook.

> **Archived note (2026-09-23).** The body below was written while the work was still uncommitted, so two statements are now out of date. They are corrected here rather than edited in place, because this record's original text is history:
>
> - It says "Implemented in the current working tree, **uncommitted**". It is committed (`fc68715`) and on `main`.
> - It describes the main checkout as sitting at `a927a12`. That was true when written; `main` has since moved to `fc68715`.
>
> The rest of the record — the tooling model, the verified refusal paths and the open verification items — still describes the delivered behaviour. The verification items that remain open today are: no AI round has yet been run inside `Incept-music`, all scripted verification used `--no-install`, and the `--db-schema` refusal branch has never been exercised against a real env file.

The main checkout now sits at `a927a12` (PR #3 merged `feat/music-Plugin`), and the real music worktree exists and is registered: `D:\Desktop\code\code\Incept-music` on branch `feat/music-Plugin`.

Two rounds of throwaway worktrees were created and reclaimed, every refusal path was triggered on purpose, and the tree was left with exactly one temporary worktree (`Incept-music`) plus the main checkout.

## Delivered

- `scripts/worktree.mjs` — subcommands `new` / `adopt` / `status` / `remove`
- `package.json` — `wt:new`, `wt:adopt`, `wt:status`, `wt:remove`
- `docs/runbooks/zh/multi-ai-worktrees.md`, `docs/runbooks/en/multi-ai-worktrees.md`, registered in `docs/INDEX.md`
- Per worktree, generated on creation: `.agents/worktree.json` (machine-readable branch/base/port/schema) and `.agents/worktree-rules.md` (role, prohibitions, start-up self-check). Both are gitignored, so they neither dirty the worktree nor block `git worktree remove`.

## Model Encoded In The Tooling

- One worktree ↔ one branch ↔ one AI. The managed part is the **directory** `<repo parent>\Incept-<name>`; the script only touches objects matching it.
- The **branch** defaults to `feature/<name>` and any other name can be given with `--branch <name>`; `wt:adopt` records whichever branch the worktree actually checks out and does not check a prefix. The recorded branch lives in `.agents/worktree.json`, and `wt:status` warns when it diverges from the checked-out branch.
- Identity check: `new` and `remove` run from the main worktree only. Running them inside a temporary worktree is refused (no nested creation, no self-removal).
- Base policy: an explicit `--base` must resolve or the command stops — it never falls back. Without `--base`, any branch whose name contains `<name>` makes the command fail with the candidate list; only a clean scan defaults to `origin/main`.
- Environment: `apps/web/.env.local` and `packages/db/.env` are copied from the main checkout; `--db-schema` rewrites `?schema=` in **both** copies using a strict pattern and stops with manual instructions when the URL cannot be recognized.
- Reclaim: the default path requires a clean tree **and** a branch merged into local `main`; if either fails, nothing is removed. `--force` forces the directory only. **The script never runs `git branch -D`** — discarding an unmerged branch stays a manual, separate decision.
- Ports: `3000 + managed worktree count + 1`; explicit `--port` overrides.

## Verified

- Base assertion: `git merge-base --is-ancestor origin/main feature/verify` passes; `git branch --contains` lists the branch.
- `--base <nonexistent>` fails with no fallback and creates nothing.
- `pnpm wt:new music` (related branches exist, no `--base`) fails and lists `feat/music-Plugin, origin/feat/music-Plugin`.
- Existing branch without `--existing-branch` is refused with both escape routes; `--existing-branch` reuses it and reports the relation to the base (1 commit ahead).
- `new` / `remove` from inside a temporary worktree are refused by the identity check.
- Untracked file present → reclaim refuses and removes nothing; unmerged branch → default reclaim refuses; `--force` removes the directory only and the branch survives, with no `git branch -D` in the log.
- Continuation path: a worktree created with `--base feat/music-Plugin` starts at exactly `1e10d7f`.
- `--db-schema wt_verify` rewrote both copies while the source env files in the main checkout stayed `schema=public`.
- Custom branch names: `--branch spike/tmp-check` produced a worktree on that branch with correct port and registry, and `pnpm wt:adopt music --base origin/main` recorded `feat/music-Plugin` without complaining about the missing `feature/` prefix.
- Reverse assertions: `main` never moved during verification, and every temporary worktree plus its branch was cleaned up.

Two defects were found by these runs and fixed: the identity check resolved the current directory from the script location instead of the process cwd, and port allocation both mis-compared the managed prefix on Windows (lowercased path vs uppercase prefix) and counted the new worktree because it ran after `git worktree add`. A third gap was closed on request: the branch name was hardcoded to `feature/<name>` until `--branch` and branch-detecting adoption were added.

## Naming Decision And Repository Facts

- The music line **keeps the older branch name**: `Incept-music` holds `feat/music-Plugin`. `feature/music` still points at the same commit (`1e10d7f`) and has not been deleted — that commit is an ancestor of main, so `git branch -d feature/music` is safe whenever it stops being useful.
- The base recorded for `Incept-music` is `origin/main` (`a927a12`), so its vs-base counts measure new work against the merged baseline; it currently reads `0 ahead, 3 behind`.
- `origin/main` already contains `1e10d7f` through PR #3, so a music worktree started from `origin/main` and one started from `feat/music-Plugin` would contain identical code.

## Remaining Verification

- `Incept-music` is registered but has never been through a full round: no AI task has been handed out yet. Its readiness is already in place though — `apps/web/.env.local`, `packages/db/.env`, `node_modules` and `packages/db/generated/client` all exist inside the worktree.
- All scripted verification used `--no-install`; the real dependency-setup path inside a worktree is still unexercised.
- The `--db-schema` refusal branch (unrecognizable or non-PostgreSQL URL) is not exercised against a real env file — only the successful rewrite path was.
- No repository-wide `typecheck` / `test` / `lint` covers root `scripts/*.mjs`; the script is exercised end-to-end instead. Run them before committing if the change is expected to touch shared checks.

## Next

1. Inside `D:\Desktop\code\code\Incept-music`: dependencies and the Prisma client are already in place, so a dev server can start directly with `pnpm --filter web dev -- --port 3001`.
2. Hand `.agents/worktree-rules.md` plus the task prompt to the feature AI; the rules file is regenerated any time with `pnpm wt:adopt music --base origin/main`.
3. After the first real round is accepted and merged, reclaim with `pnpm wt:remove music`, then move this record to `docs/finish-task/`.

The reviewed plan is at `~/.commandcode/plans/multi-ai-worktree-workflow.md`; the operational rules, risk list, and verified git failure modes live in the bilingual runbook.
