# Git 整理第二阶段修正记录（2026-11-13）

本文件修正 `preserve/local-docs-2026-11-12:1f30dfb` 中记录的两处方案缺陷，并记录实际采用的正确路径。

## 缺陷一：直接合并保全分支会带入 Operations Console 原型

`preserve/local-docs-2026-11-12` 基于 `5b2a142`（2026-10-17，`feature/operations-console`）
创建。`5b2a142` **不在** `origin/main` 的历史中。

因此在 `origin/main` 上直接合并整个 `preserve` 分支，等于把该分支与主线之间的全部分叉一并合入：

```
git merge-base --is-ancestor 5b2a142 origin/main   # exit=1，不在主线
git diff --name-only origin/main..preserve/...     # 483 个文件
```

其中包含 17 个 Operations Console 原型文件（`apps/web/src/features/operations/*`、
`apps/web/src/app/[locale]/operations/page.tsx`、`site-header*.tsx` 等），
且相对主线呈现大量回退（统计为 `6683 insertions, 133883 deletions`）。
这会用 10 月的旧代码覆盖 11 月的主线实现。

**结论：保全分支不可整体合并，只可提取其文档提交。**

正确做法（已执行）：

```bash
git switch --detach origin/main
git switch -c integrate/2026-11-13-docs-and-hotfix
git cherry-pick -x 1265b58      # 仅文档提交，6 个文件
```

## 缺陷二：在 detached HEAD 上合并不会推进本地 main

`main` 被 `.worktrees/sync-safety` 检出，Git 禁止同一分支在两个 worktree 同时检出：

```
fatal: 'main' is already used by worktree at '.../.worktrees/sync-safety'
```

若只在主目录 `git switch --detach origin/main` 后合并，结果只存在于游离 HEAD，
本地 `main` 引用不会移动，`git log main` 仍显示旧提交。

此外 `main` 在 2026-11-13 01:26:13 已被一次外部
`pull --ff --recurse-submodules --progress -- origin` 快进到 `085c0ed`，
与 `origin/main` 同步，因此本次无需再处理落后问题。

正确做法（已执行）：

```bash
# 1) 在真正拥有 main 的 worktree 中快进，让分支引用前进
git -C .worktrees/sync-safety merge --ff-only integrate/2026-11-13-docs-and-hotfix

# 2) 让该 worktree 释放分支锁（分离到同一提交，不删除任何文件）
git -C .worktrees/sync-safety switch --detach 31bd9ce

# 3) 主工作区现在才能真正检出 main
git switch main
```

第 2 步使用 `switch --detach`，**不是** `worktree remove`，目录与内容原样保留，随时可
`git -C .worktrees/sync-safety switch main` 恢复。

## 生产热修复回归

`93ce520 fix(sync): use cgroup working set for memory admission`
仅改动两个文件，未触碰任何部署记录或生产 release 文件：

```
packages/dashboard/src/sync/capacity.ts                  | 44 +++++-
packages/dashboard/src/__tests__/sync-capacity.test.ts   | 138 ++++++++--
```

以 `--no-ff` 合并到集成分支，保留其为独立可辨识提交：

```bash
git merge --no-ff --no-edit fix/sync-memory-pressure \
  -m "merge(sync): integrate cgroup memory admission hotfix 93ce520"
```

`git merge-base --is-ancestor 93ce520 HEAD` → 0（已在主线）。
`fix/sync-memory-pressure` 分支本身**未删除、未修改**。

## 验证

| 检查 | 结果 |
| --- | --- |
| `git diff --stat origin/main..HEAD` | 仅 6 个文档文件 + `capacity.ts`/测试 |
| Operations Console 原型泄漏 | **0 个文件**（`git ls-tree HEAD -- apps/web/src/features/operations` 为空） |
| `docs/INDEX.md` 主线既有修改 | 保留（仅 dbml 引用行变更） |
| `docs/performance/` 双方内容 | 并存（`navigation-investigation.md` + 主线既有 8 个文件） |
| `93ce520` 在 HEAD 祖先链 | 是 |
| `pnpm --filter @incept/dashboard exec vitest run src/__tests__/sync-capacity.test.ts` | **18/18 通过** |
| `pnpm --filter @incept/dashboard typecheck` | **exit 0** |

## 当前拓扑

```
origin/main 085c0ed
        │
        ├── 93ce520  (fix/sync-memory-pressure, 保留分支)
        └── ceb324b  (docs cherry-pick)
                │
            31bd9ce  merge → main (工作区)、integrate/2026-11-13-docs-and-hotfix
```

`main` 领先 `origin/main` 3 个提交，尚未推送。

## 未执行（等待批准）

- 未删除任何分支，未移除任何 worktree，未清理 stash。
- `preserve/local-docs-2026-11-12` 保留（含 `1f30dfb` 记录原文），可归档。
- worktree 移除建议仍待批准，见下文「归档清单」。
