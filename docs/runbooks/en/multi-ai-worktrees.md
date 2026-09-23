# Multiple AI Agents in Parallel: Worktree Workflow

## When to use this

Run several AI agents on different features in the same repository without them touching each other's files, with one controlling side doing acceptance and merging.

```text
D:\Desktop\code\code\Incept           main               controller / acceptance desk (the only place that merges and pushes)
D:\Desktop\code\code\Incept-music     feat/music-Plugin  dedicated to feature AI A (keeps the older name)
D:\Desktop\code\code\Incept-login     feature/login      dedicated to feature AI B (new work uses the default naming)
```

One worktree ↔ one branch ↔ one AI. The worktree is disposable; the branch is the artifact that gets reviewed and merged.

Naming: the **directory** is always `Incept-<name>`; the **branch** defaults to `feature/<name>` and any other name can be given with `--branch <branch>` (this repository keeps `feat/music-Plugin` for the music line). `wt:adopt` records the branch the worktree **actually checks out** and does not enforce a prefix; the branch is stored in `.agents/worktree.json` under `branch`, and `wt:status` compares it with the checked-out branch, warning on a mismatch.

## 1. Roles and ownership

| Role | May do | Must not do |
|---|---|---|
| Feature AI | edit files, run checks, `git add` / `git commit` | push, merge, rebase, switch branches, add or remove worktrees, work inside the main worktree |
| Controller (human or controlling AI) | inspect, run tests, read diffs, merge, push, reclaim worktrees | edit code on the feature AI's behalf inside its worktree |

**Why the split**: not because an AI technically cannot, but because responsibilities are separated. A worktree isolates the working directory; it does **not** isolate refs, the object store, hooks, or the remote. A single `git push --force` reaches across every worktree, so push and merge stay with the controller.

## 2. Feature AI start-up self-check

Before touching anything, the feature AI runs this and reports the output:

```powershell
pwd
git branch --show-current
git worktree list
```

Confirm the directory is the assigned worktree and the branch is the `Branch` recorded for it (the `branch` field of `.agents/worktree.json`). If it is standing in the repository root (the main worktree), it must stop and report.

Each worktree gets a generated `.agents/worktree-rules.md` (gitignored, so it never dirties the working tree) recording its branch, base, port, schema, and the full list of prohibitions. Hand that path to the AI together with the task.

## 3. Lifecycle and gates

| State | Entry condition | Exit action |
|---|---|---|
| Assign | controller picks the base; the directory follows `Incept-<name>` and the branch is given by `--branch` (default `feature/<name>`) | `pnpm wt:new` (or the two git commands in section 4) |
| Ready | both env files present, `pnpm install` + `pnpm db:generate` pass, port and schema decided | hand the prompt to the feature AI |
| Develop | the AI edits only inside its own directory | the AI commits to this worktree's branch |
| Deliver | **working tree clean** (uncommitted changes block reclaim) | controller acceptance |
| Accept | the three hard signals in section 6 | accept / send back / abandon |
| Reclaim | branch merged, or a deliberate discard | `pnpm wt:remove <name>` |

## 4. Base strategy

| Task kind | Base | Test |
|---|---|---|
| Brand-new feature | `origin/main` (after a best-effort fetch) | no branch related to that name exists |
| Continuation of existing work | **explicit** `--base <branch>` required | e.g. `feature/music` ← `feat/music-Plugin` |

Strict rules — never guess, never fall back silently:

- `--base` given → it must resolve; if it does not, the command stops (otherwise you believe it started from the music branch while it actually started from `main`)
- no `--base` → related branches are scanned first (names containing `<name>`); **if any exist the command fails** and lists them, demanding an explicit base
- only when no related branch exists does it default to `origin/main`

For a continuation, **do not rename the old branch** (`git branch -m` moves an existing ref). Two safe paths:

A. Keep the older branch name (this is what the music line in this repository does):

```powershell
git status --short --branch
git worktree list
pnpm wt:new music --base origin/main --branch feat/music-Plugin
```

B. Copy it to a new name and keep the old branch as a rollback point:

```powershell
git branch feature/music feat/music-Plugin
git worktree add ..\Incept-music feature/music
pnpm wt:adopt music --base origin/main
```

Current repository state: `Incept-music` holds `feat/music-Plugin`, `feature/music` points at the same commit (`1e10d7f`) and that commit is already merged into main, so `feature/music` is kept and not deleted — deleting it later with `git branch -d feature/music` is safe (it is an ancestor of main).

`pnpm wt:adopt` does not check a branch prefix: it records the branch the worktree actually checks out. Prefer `--base origin/main` (or `main`) so that "ahead / behind" measures new work against the merged baseline rather than against the branch itself.

## 5. Readiness checklist

Everything below is gitignored and must exist per worktree:

1. `apps/web/.env.local` and `packages/db/.env` (both must point at the same schema; `pnpm wt:new` copies them from the main checkout)
2. `pnpm install`
3. `pnpm db:generate` (the Prisma client is emitted to `packages/db/generated/client`, which is gitignored)
4. Ports: 3000 for the main checkout, 3001, 3002, … for temporary worktrees
   `pnpm --filter web dev -- --port 3001`
5. Database schema: shared `public` by default; isolate with `--db-schema <name>` (rewrites `?schema=` in both env files)

## 6. Acceptance

Three hard signals, all from git — never from the AI's own summary:

1. Committed or not: is the working tree clean
2. How far ahead of the base: `git log --oneline <base>..<branch>`
3. Mergeable without conflict: attempt the merge

Command sequence (`<branch>` is the worktree's branch; `pnpm wt:status` prints it):

```powershell
# inside the worktree — the repository's own checks
pnpm typecheck
pnpm test
pnpm lint

# in the main checkout — only that branch's own changes (three-dot diff against its base)
git diff <base>...<branch>

# try the merge (delete the whole directory if you do not like the result)
git checkout -b test/merge-<name> main
git merge --no-ff <branch>
```

Three outcomes:

- **Accept**: the controller runs `git merge --no-ff <branch>` in the main checkout, keeping a merge point that shows which AI produced it
- **Send back**: the AI continues in the **same** worktree — no rebuild, no branch switch
- **Abandon**: reclaim, per section 7

## 7. Reclaim

Fixed order: **remove the directory first, delete the branch second** (git refuses to delete a branch a worktree holds).

```powershell
pnpm wt:status
pnpm wt:remove music
```

Two guards with different jobs:

| Command | Protects | Refuses when | Observed |
|---|---|---|---|
| `git worktree remove` | files | uncommitted changes / untracked files | `fatal: '<path>' contains modified or untracked files, use --force to delete it` (exit 128) |
| `git branch -d` | results | commits not merged | `error: the branch 'x' is not fully merged` |

Observed extras: a worktree whose only extra content is ignored files (`node_modules`) removes **cleanly, without `--force`**; a clean worktree holding unmerged commits removes fine (the commits stay on the branch); `worktree remove` **never** deletes the branch.

Convention: `pnpm wt:remove` requires the working tree to be clean **and** the branch to be merged into `main`; if either fails, **nothing is removed**. `--force` forces the directory only, and **the script never runs `git branch -D`** — discarding an unmerged branch is your call, by hand:

```powershell
git branch -D feature/music
```

Run `git pull` in the main checkout before reclaiming: when a branch was merged through a PR, the local `main` does not contain it yet and the default reclaim is refused as "not merged" (that is the guard working, not a fault). `pnpm wt:status` says so explicitly: `Merged into origin/main: yes — run "git pull" in the main checkout before reclaiming`.

Removing a directory and discarding a branch are two different decisions; one flag must not authorize both.

## 8. Isolation risks

- **`.env`**: the copied `apps/web/.env.local` and `packages/db/.env` hold real credentials (`DATABASE_URL`, `OWNER_ACCESS_SECRET`, `GITHUB_ACTIVITY_TOKEN`). Local development only: never commit them, never hand them to an external AI, never paste them into logs or tickets. When rotating (`pnpm auth:revoke-owner-sessions`) rotate every copy.
- **Database schema**: `5432/incept` with the shared `public` schema by default → only one worktree may run `pnpm db:deploy` / `db:migrate` at a time. With `--db-schema`, each worktree runs its own `db:deploy` + `db:seed`; `migrate dev` additionally needs shadow-database rights.
- **Ports**: when 3000 is taken, Next silently picks another one and you end up staring at the wrong instance. Allocate per section 5.
- **Out-of-repo media directories**: `DOCS_CONTENT_ROOT` / `MUSIC_CONTENT_ROOT` are absolute paths outside the repo, shared by every worktree; two AIs running `docs:import` / `music:import` / `music:manifest` simultaneously overwrite each other.
- **Media output is absent in worktrees**: `apps/web/public/_docs-media/`, `_music-media/` are gitignored; regenerate mock audio with `pnpm music:mock-audio` or copy from the main checkout when needed.
- **refs / object store / hooks are shared**: `git push`, `git reset --hard`, and branch deletion reach across the isolation boundary.

## 9. Failure modes

| Symptom | Exact error | Handling |
|---|---|---|
| Second worktree on the same branch | `fatal: 'x' is already used by worktree at '<path>'` | one branch per worktree; pick another branch |
| Deleting a branch a worktree holds | `error: cannot delete branch 'x' used by worktree at '<path>'` | `wt:remove` the directory first |
| Reclaim with uncommitted changes | `fatal: '<path>' contains modified or untracked files` | commit first (or `--force` to discard) |
| Branch not merged | `error: the branch 'x' is not fully merged` | merge first, or `git branch -D` by hand |
| Switching branches in a dirty worktree | `error: Your local changes ... would be overwritten by checkout ... Aborting` | commit before switching; a directory holds one branch at a time |
| Registered worktree directory deleted by hand | `git worktree list` still lists it | `git worktree prune` drops the stale record (live directories are untouched) |
| Main checkout merged, worktree content unchanged | — | Expected: the worktree holds its own branch; rebase or merge the base into it when you want it updated |

## Common commands

```powershell
pnpm wt:new login                                                    # brand-new feature, base origin/main
pnpm wt:new music --base origin/main --branch feat/music-Plugin      # continuation, keeping the older branch name
pnpm wt:new login --db-schema wt_login                               # isolated database schema
pnpm wt:adopt music --base origin/main                               # register a hand-made worktree (branch taken as-is)
pnpm wt:status                                                       # acceptance view
pnpm wt:remove music                                                 # safe reclaim
pnpm wt:remove music --force                                         # directory only, branch kept (unmerged)
pnpm wt:remove music --keep-branch                                   # directory only, branch untouched
```
