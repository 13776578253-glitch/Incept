# 多 AI 并行开发：Worktree 工作流

## 适用场景

同一个仓库里让多个 AI 同时开发不同功能，互不踩文件，由主控统一验收与合并。

```text
D:\Desktop\code\code\Incept           main               主控 / 验收台（唯一允许 merge、push）
D:\Desktop\code\code\Incept-music     feat/music-Plugin  功能 AI A 独占（延续旧命名）
D:\Desktop\code\code\Incept-login     feature/login      功能 AI B 独占（全新功能走默认命名）
```

一个 worktree ↔ 一条分支 ↔ 一个 AI，worktree 是消耗品，分支是要留下并合并的成果。

命名约定：**目录**固定 `Incept-<name>`；**分支**默认 `feature/<name>`，可用 `--branch <branch>` 指定其它名字（本仓库音乐线沿用 `feat/music-Plugin`）。`wt:adopt` 登记时以 worktree **实际签出**的分支为准，不校验前缀；分支名记录在 `.agents/worktree.json` 的 `branch` 字段，`wt:status` 会拿它和实际签出分支比对，不一致时给出警告。

## 一、角色与所有权

| 角色 | 可以做 | 不可以做 |
|---|---|---|
| 功能 AI | 改文件、跑检查、`git add` / `git commit` | push、merge、rebase、切分支、增删 worktree、在主 worktree 里工作 |
| 主控（人或主控 AI） | 检查、跑测试、看 diff、merge、push、回收 worktree | 在功能 AI 的 worktree 里替它改代码 |

**为什么要这么切分**：不是 AI 技术上做不到，而是职责分离。worktree 隔离的是工作目录，**不隔离 refs、对象库、hooks 与远端**——一次 `git push --force` 会穿透隔离影响所有 worktree，所以 push / merge 这类动作只留给主控。

## 二、AI 侧开工自检

功能 AI 进入 worktree 后第一件事，必须先执行并把结果贴出来：

```powershell
pwd
git branch --show-current
git worktree list
```

确认当前目录就是分配给它的 worktree、分支就是该 worktree 登记的 `Branch`（`.agents/worktree.json` 的 `branch` 字段）。若发现自己在仓库根目录（主 worktree），立即停止并报告。

每个 worktree 创建时会生成 `.agents/worktree-rules.md`（被 gitignore，不会弄脏工作区），里面记录了该 worktree 的分支、基点、端口、schema 与完整禁令；把它的路径连同任务一起交给 AI。

## 三、生命周期与门禁

| 状态 | 进入条件 | 退出动作 |
|---|---|---|
| 分配 | 主控选定基点；目录符合 `Incept-<name>`，分支由 `--branch` 指定（默认 `feature/<name>`） | `pnpm wt:new`（或 Step 0 两条 git 命令） |
| 就绪 | 两份 env 到位、`pnpm install` + `pnpm db:generate` 成功、端口与 schema 已定 | 把 prompt 交给功能 AI |
| 开发 | AI 只在自己目录里改代码 | AI 提交到本 worktree 的分支 |
| 交付 | **工作区干净**（未提交改动会挡住回收） | 主控验收 |
| 验收 | 见第六节三条硬指标 | 接受 / 打回 / 放弃 |
| 回收 | 分支已合并，或明确要丢弃 | `pnpm wt:remove <name>` |

## 四、基点策略

| 任务性质 | 基点 | 判据 |
|---|---|---|
| 全新功能 | `origin/main`（best-effort fetch 后） | 仓库里不存在与该名字相关的分支 |
| 延续已有功能 | **必须显式** `--base <分支>` | 例：`feature/music` ← `feat/music-Plugin` |

严格规则，任何情况都不猜测、不静默回退：

- 给了 `--base` → 必须能解析；解析失败立即停止（否则你以为从音乐分支开始，实际却从 `main` 起）
- 没给 `--base` → 先扫相关分支（名字含 `<name>`）：**存在就失败**并列出候选，要求显式给基点
- 只有确认无相关分支时，才默认 `origin/main`

延续已有功能时，**不要重命名旧分支**（`git branch -m` 会动既有引用）。两条安全路径：

A. 沿用旧分支名（本仓库音乐线采用这条）：

```powershell
git status --short --branch
git worktree list
pnpm wt:new music --base origin/main --branch feat/music-Plugin
```

B. 复制出一个新名字的分支，旧分支留作回退点：

```powershell
git branch feature/music feat/music-Plugin
git worktree add ..\Incept-music feature/music
pnpm wt:adopt music --base origin/main
```

本仓库当前状态：`Incept-music` 持有 `feat/music-Plugin`，`feature/music` 与它同点（`1e10d7f`）且该提交已并入 main，保留未删——确认不再需要时 `git branch -d feature/music` 是安全的（它已是 main 的祖先）。

`pnpm wt:adopt` 不校验分支前缀，登记的是 worktree 实际签出的分支；`--base` 建议用 `origin/main`（或 `main`），这样"领先/落后"衡量的是相对已合并基线的新增工作，而不是相对分支自身。

## 五、就绪清单

每个 worktree 开工前必须齐备（都不入 git，必须各自准备）：

1. `apps/web/.env.local` 与 `packages/db/.env`（两份必须指向同一 schema；`pnpm wt:new` 会自动从主 checkout 复制）
2. `pnpm install`
3. `pnpm db:generate`（Prisma client 输出在 `packages/db/generated/client`，被 gitignore）
4. 端口：主 checkout 用 3000，临时 worktree 用 3001、3002……
   `pnpm --filter web dev -- --port 3001`
5. 数据库 schema：默认共享 `public`；要隔离用 `--db-schema <name>`（会同时改写两份 env 的 `?schema=`）

## 六、验收

三条硬指标全部来自 git，不信 AI 自述：

1. 是否已提交：工作区是否干净
2. 相对基点领先几笔：`git log --oneline <base>..<branch>`
3. 能否无冲突合并：先试合再看

命令序列（`<branch>` 是该 worktree 的分支，`pnpm wt:status` 会直接打印）：

```powershell
# 在 worktree 内跑仓库既有检查
pnpm typecheck
pnpm test
pnpm lint

# 在主 checkout 看它自己的改动（三点只看该分支相对基点的 diff）
git diff <base>...<branch>

# 试合并（不满意可以整个目录删掉）
git checkout -b test/merge-<name> main
git merge --no-ff <branch>
```

判定三分支：

- **接受**：主控在主 checkout `git merge --no-ff <branch>`，保留合并点，事后能查出是哪个 AI 的成果
- **打回**：让 AI 回**同一个** worktree 继续改，不重建目录、不换分支
- **放弃**：走第七节回收

## 七、回收

顺序固定：**先删目录，再删分支**（分支被 worktree 占用时 git 拒绝删除）。

```powershell
pnpm wt:status
pnpm wt:remove music
```

两层保护职责不同，不要混为一谈：

| 命令 | 保护什么 | 拒绝条件 | 实测 |
|---|---|---|---|
| `git worktree remove` | 文件 | 有未提交改动 / 未跟踪文件 | `fatal: '<path>' contains modified or untracked files, use --force to delete it`（exit 128） |
| `git branch -d` | 成果 | 提交未合并 | `error: the branch 'x' is not fully merged` |

实测补充：只有被忽略的文件（`node_modules`）时 `worktree remove` **直接成功**；干净的 worktree 即使带着未合并提交也能删掉目录（提交仍在分支上）；`worktree remove` **不会**删除分支。

约定：`pnpm wt:remove` 默认要求"工作区干净 **且** 分支已并入 `main`"，任一不满足就**什么都不删**；`--force` 只强制删目录，**脚本永不执行 `git branch -D`**——要丢弃未合并的分支，由你手工执行：

```powershell
git branch -D feature/music
```

回收前先在主 checkout 执行 `git pull`：如果分支是通过 PR 合进远端的，本地 `main` 还没包含它，默认回收会被"未合并"挡住（这是保护而不是故障）。`pnpm wt:status` 会直接提示 `Merged into origin/main: yes — run "git pull" in the main checkout before reclaiming`。

删目录和删分支是两个独立决定，不应由一条参数同时授权。

## 八、隔离风险

- **`.env`**：复制出来的 `apps/web/.env.local`、`packages/db/.env` 含真实凭据（`DATABASE_URL`、`INCEPT_AUTH_ENCRYPTION_KEY`、`GITHUB_ACTIVITY_TOKEN`）。仅限本机开发使用：不要提交、不要交给外部 AI、不要贴进日志或工单。轮换密钥时（`pnpm auth:revoke-owner-sessions`）所有副本一起换。
- **数据库 schema**：默认共享 `5432/incept` 的 `public` schema → 同一时间只允许一个 worktree 跑 `pnpm db:deploy` / `db:migrate`。用 `--db-schema` 隔离后，每个 worktree 各自 `db:deploy` + `db:seed`；`migrate dev` 还需要 shadow db 权限。
- **端口**：抢不到 3000 时 Next 会自动换端口，结果你打开的是另一个实例。按第五节分配。
- **仓库外媒体目录**：`DOCS_CONTENT_ROOT` / `MUSIC_CONTENT_ROOT` 指向仓库外的绝对路径，所有 worktree 默认共享同一份，两个 AI 同时 `docs:import` / `music:import` / `music:manifest` 会互相覆盖。
- **worktree 内没有媒体产物**：`apps/web/public/_docs-media/`、`_music-media/` 被 gitignore，需要时用 `pnpm music:mock-audio` 生成，或按需从主 checkout 复制。
- **refs / 对象库 / hooks 共享**：`git push`、`git reset --hard`、删分支都会穿透隔离。

## 九、失败模式

| 现象 | 错误原文 | 处置 |
|---|---|---|
| 同一条分支开第二个 worktree | `fatal: 'x' is already used by worktree at '<path>'` | 一条分支一个 worktree；换分支名 |
| 删除被占用的分支 | `error: cannot delete branch 'x' used by worktree at '<path>'` | 先 `wt:remove` 目录，再删分支 |
| 回收时有未提交改动 | `fatal: '<path>' contains modified or untracked files` | 先提交（或 `--force` 丢弃） |
| 分支未合并 | `error: the branch 'x' is not fully merged` | 先合并，或手工 `git branch -D` |
| 脏工作区切分支 | `error: Your local changes ... would be overwritten by checkout ... Aborting` | 先提交再切；一个目录同一时刻只有一条分支 |
| 登记的 worktree 目录被手删 | `git worktree list` 仍显示 | `git worktree prune` 清残记录（不会动活着的目录） |
| 主 checkout 合并后，worktree 内容没变 | — | 正常：worktree 持有的是它自己的分支，需要同步就让它 `rebase` / `merge` 基点 |

## 常用命令

```powershell
pnpm wt:new login                                                    # 全新功能，基点 origin/main
pnpm wt:new music --base origin/main --branch feat/music-Plugin      # 延续已有功能并沿用旧分支名
pnpm wt:new login --db-schema wt_login                               # 隔离数据库 schema
pnpm wt:adopt music --base origin/main                               # 手工建过的纳入登记（分支按实际签出记录）
pnpm wt:status                                                       # 验收视图
pnpm wt:remove music                                                 # 安全回收
pnpm wt:remove music --force                                         # 只删目录，分支保留（未合并时）
pnpm wt:remove music --keep-branch                                   # 只删目录，分支不动
```
