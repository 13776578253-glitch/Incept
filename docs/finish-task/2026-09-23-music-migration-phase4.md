# 2026-09-23 Music 模块化迁移 Phase 4 实施记录（CLI 迁入，修订版）

## Status

**Phase 4（修订版）实施完成并验收 C1–C6 全过。** 与 Phase 5 合并提交待放行。修订版输入对账成立：原「同轮防断链」风险已被 Phase 3 消除；真正的债是 CLI 硬编码包内字面路径（A3 违例）——本轮以 exports 自引用归零。

[2026-09-23 21:30] - Update by AI完成改动:
- 修改了 CLI 的归属（三入口迁入 `packages/music/src/cli/`，`cli/args.ts`/`cli/env.ts` 抽共享骨架），实现了用法文案与参数逐字保留（`--root/--dry-run/--manifest/--validate/--allow-empty/--apply/--help` 含 printUsage 全文）、新增 `--env-file`/`--mirror` plumbing（默认不再自读 .env.local，R6 语义由根转发显式传入）、`scripts/music-*.mjs` 变纯转发（基准 db→music）、包内 CLI 全走 exports 自引用（C3）、镜像布局唯一定义 `scripts/music-paths.mjs`（C6，D.1 甲）、删除 `resolveWebMusicPaths`（D.2）、`music-mock-audio.mjs` 留 scripts ✓、新增 CLI smoke 测试 6 例（C5）。
- 遗留问题: 无新增；Phase 6–8 待批准（观察项：媒体面端口化一致性留 Phase 6/7 评估）。
- Commit 建议: [feat]: music 迁移 Phase 4+5 CLI 迁入与 API 路由收编（合并提交）

## 裁定（D 系列，已定案）

- **D.1 = 甲**：CLI 取 `--mirror <abs>`，由根转发脚本给出。为满足 C6「仓库内一处定义」，布局常量收敛为 `scripts/music-paths.mjs` 的 `musicMirrorDirectory(projectRoot)`（+`.d.mts` 供 apps/web 装配解析），两支转发脚本与 `assembly.webMusicMirrorDirectory` 共用——仓库内 `apps/web/public/_music-media` 字面量仅存 1 处。
- **D.2 = 删除 `resolveWebMusicPaths`**：甲之下无消费者；死代码按 R8 清除（Web 装配现仅存 `webMusicMirrorDirectory` + `authorizeOwner` + 路由绑定）。
- **D.3 = 采纳**：`./cli` 入口不导出（exec-only），根脚本直接 exec；功能面经 `./application`（编排 6 函数）与 `./adapters`（扫描/清单文件）暴露。

## 前置动作结果

- **R11 探针通过**：`pnpm --filter @incept/music exec tsx --eval "import('@incept/music/domain')"` → `R11-OK function`——tsx 将 exports 的 types/default 双字段正确解析到 .ts 源。最大预判雷点消除。
- **C1 基线对照达成（基线缺口已按修订版补做）**：
  - 方法：临时 clone（scratchpad 内，避开 worktree 命令禁令）检出 `origin/main @ a927a12`（rules 定义的基线），复制 `.env.local` 与 Prisma 生成物（schema 两侧相同）后跑旧 CLI。
  - 输入同一性：两次运行读取**同一个输入清单文件** `<内容根>/music.json`，对照期间该文件未发生变化（SHA-256 = `BD4838F2114BDB24A8DC9C4E45B7EE22C46C37401BBD3A2565D681CE6CD0A209`）。该 hash 是**输入清单文件的指纹**（`--dry-run` 不写盘，不存在产物清单 hash），用于证明两次对照为同输入比较。
  - 输出：`music:manifest --dry-run` 与 `music:import --dry-run` 对照——**行级 diff = 0**、EOL 规范化后逐字节相等（raw `-eq` 的假阴性来自两条捕获管线的行尾差异）。
  - **兼证 R-KEYS**：真实内容根（D:\Desktop\music-push，4 音频文件）上与 origin/main 时代输出一致 = POSIX-only 换实现的端到端零行为变更证据（55 例语料之外最强证据），无边界文件名分歧。

## 实现要点

- **参数骨架**：`cli/args.ts` 抽 `--env-file/--mirror` 解析与 `exitWithUsage`/`failUnknownArgument` 出口骨架；各入口 parseArgs/printUsage 原文保留（`--help` 文案零改动，plumbing 标志不进 usage 以守 C4）。
- **env 语义**：`cli/env.ts` 的 `loadEnvironment(envFile)` 保留 ENOENT 容忍；无默认路径（决策 13：路径知识留根脚本）。
- **出口消费**：import/cleanup → `@incept/music/application`（planMusicImport/publishMusicImportMedia/commitMusicImport/validateMusicMirror/inspectMusicMirrorCleanup/applyMusicMirrorCleanup）；manifest → `@incept/music/domain`（buildMusicManifest）+ `@incept/music/adapters`（collectMusicAudioFiles/readMusicManifestFile/writeMusicManifestFile/getMusicManifestPath/MUSIC_AUDIO_EXTENSIONS）。
- **转发脚本**：`spawnSync` 执行 `pnpm --filter @incept/music exec tsx src/cli/<entry>.ts --env-file … [--mirror …] …args`，stdio inherit、退出码透传；引号安全处理（`""` 转义）。
- **JS→TS 移植点**（2 处，输出逐字不变）：`plan.libraries` 的 mode 相关性以 `(plan.libraries ?? []).length` 等价化；assembly 相对路径修正为 5 级（`../../../../../scripts/music-paths.mjs`）。

## 验收对照（修订版 C1–C6）

- ✓ **C1**：真实内容根 dry-run 与 origin/main 基线一致（行级 0 diff；两次运行间输入清单 `music.json` 的 SHA-256 未变，证明同输入比较），输出与计划摘要已留档 scratchpad（baseline-/new- manifest/import 各 2 份 + manifest-hash.txt）。
- ✓ **C2**：music scripts 动态 import `apps/web/src` = 0（转发脚本不再 import，仅 exec 包内入口）。
- ✓ **C3**：`scripts/music-*.mjs` 与包内 CLI 中 `packages/music/src/` 字面路径 = **0**（grep），全走 exports 自引用。
- ✓ **C4**：命令名与参数体验不变（`pnpm music:manifest/import/cleanup` + 原参数面；--help 文案逐字；smoke 断言 usage 行存在）。
- ✓ **C5**：`pnpm typecheck` 四包全绿；`pnpm test` **276/276**（core 73 + music 108 含 6 smoke + web 95）。
- ✓ **C6**：镜像路径定义全仓唯一（grep `'apps', 'web', 'public', '_music-media'` = 1 处）。

## 检查与结果（本机执行）

- R11 探针：`R11-OK`。typecheck：四包全绿。test：276/276（smoke：3 入口 × --help 退出 0 / 未知参数退出 1）。
- 基线对照：manifest/import 行级 diff 0；清单 hash `BD4838F2…A209` 一致。

## 未完成项

- 无新增。**Phase 4+5 已就绪，按指示合并为单 commit，放行即提交。**
- Phase 6–8 待批准（附带观察：媒体面（adapters 直引）是否随 Phase 6/7 一并端口化，届时评估）。
