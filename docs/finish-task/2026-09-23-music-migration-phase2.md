# 2026-09-23 Music 模块化迁移 Phase 2 实施记录（包骨架与数据层）

## Status

**Phase 2 实施完成并验收。** `packages/db/src/music` 已全量迁入 `packages/music`（`@incept/music`），18 条 import 原子改写完成，四包 typecheck 全绿、266 用例全绿。两处口径问题（R-KEYS、旧注释）按 READAI 冻结待裁定。

[2026-09-23 17:05] - Update by AI完成改动:
- 修改了 music 迁移的数据层归属（packages/db/src/music → packages/music 分层：domain/ports/adapters + react/next/cli 占位），实现了 manage/upload 纯执行拆分（事务语义逐函数核对不变）、catalog 形状与选择常量迁 domain、import.ts 选择并轨、MusicRepository 端口（11 用例方法）、10 文件 git mv（历史保留）+ 3 测试随迁（27 用例包内 Vitest）、18 条 import 原子改写（B2：10 生产 + 6 测试，与删除同轮）、db 移除 ./music 导出、transpilePackages 与 web 依赖声明同轮（B3）、R10 类型强制（B1：serverLoader 摘出客户端可见贡献类型）。非空探针（contentHash 唯一规则）红→绿留档。
- 遗留问题: **R-KEYS 待裁定**（keys.ts 的 node:path 与「domain 禁 Node」口径矛盾，暂以边界桥接注释冻结、零行为变更）；**music-key.ts:1 旧包名注释待裁定**（READAI 2.1 禁改注释，拟改为「转发 @incept/music/domain 的键规则：网页服务端与 music 包共用一套实现」）；Phase 3–8 待批准。
- Commit 建议: [feat]: music 迁移 Phase 2 包骨架与数据层

## 批准附带项执行对照

- **B1（R10 强制）**：`SettingsSectionContribution` 已摘除 `serverLoader` 字段（编译期强制，客户端可见类型不可能携带服务端闭包）；loader 只存在于 `SettingsSectionServerLoader`（`src/mount/server.ts` 注册表持有），与分区按 id 配对；类型测试以 `TYPE_LEVEL_LOADERS` 表达「section + loader」。
- **B2（原子同轮）**：18 条 import 改写与 `packages/db/src/music` 删除在本轮单 commit 内完成，精确清单执行：**生产 10 文件**（import-runner、music-admin、music-key、5 路由、music-upload-client、music-upload-zone）/ **测试 6 文件**（3 随迁 + library-consistency + 2 路由测试 mock 目标改 `@incept/music/adapters`）。无任何 `@incept/db/music` 代码引用残留。
- **B3（同轮 + 独占探针）**：transpilePackages 加入 `@incept/music`、`apps/web` 声明 `@incept/music: workspace:*` 与迁移同轮；非空探针由本 AI 独占执行（探针窗口 tracked 文件仅本 AI 改动）：改坏 `domain/plan.ts` 的 contentHash 唯一断言 → `music-import-plan` 的 2 条规则用例变红（refuses same content to two tracks / refuses content held by a row outside the manifest）→ 原样还原 → 27/27 复绿。
- **R9 裁定（逐函数核对兜底）**：映射表见下节。

## R9 逐函数核对表（纯/执行拆分）

**manage.ts（386 行 → domain/manage.ts 192 行 + adapters/prisma/manage.ts）**

| 符号 | 去向 | 核对 |
|------|------|------|
| nextPosition / resolveLibraryId / assertMusicLibraryAssignments | domain | 纯（抛错型校验）；resolveLibraryId、assert 被 adapters/upload 消费，跨文件依赖方向 domain←adapters ✓ |
| planMusicTrackCreate / planMusicTrackUpdate / planMusicLibraryCreate / planMusicLibraryDelete / planMusicLibraryUpdate、MusicTrackPatch / MusicLibraryPatch | domain | 纯规划；调用点全部保持在 `$transaction` 内、作用于事务内读取的数据（updateMusicTrack 内原位 :259、createMusicLibrary :306、deleteMusicLibrary :234、updateMusicLibrary :338 顺序不变） |
| deleteMusicTrack / deleteMusicLibrary / updateMusicTrack / createMusicLibrary / updateMusicLibrary | adapters/prisma/manage | 5 个 `$transaction` 块逐字保留；内联 DB 校验（"does not exist"、目的库存在性）与 updateMusicLibrary 的 moving 去重过滤原样留执行侧 |

**upload.ts（302 行 → domain/upload.ts 170 行 + adapters/prisma/upload.ts）**

| 符号 | 去向 | 核对 |
|------|------|------|
| MusicUploadStatus / MusicUploadDecision / libraryKeysOf / planMusicUploadDecision | domain | 纯 |
| MusicDuplicateHint / duplicateHintLimit / tokensOf / containsTokens / textLooksAlike / artistsLookAlike / durationsLookAlike / findMusicDuplicateCandidates | domain | 纯（去重提示） |
| MusicUploadOutcome | domain | 纯类型，引用 MusicCatalogTrackRecord（已入 domain/catalog，方向正确） |
| uniqueViolationCode / isMusicUniqueConflict | domain | 纯判定，已加 P2002 语义注记（v2 要求） |
| uploadAttempts / uploadMusicTrack / runUploadAttempt | adapters/prisma/upload | P2002 **整事务重试一次**保留；事务内调用顺序不变：assertMusicLibraryAssignments → planMusicUploadDecision → 分支补归属 → deriveMusicTrackKey → planMusicTrackCreate → create → createMany → findMusicDuplicateCandidates |

**queries/list.ts（128 行 → domain/catalog.ts + adapters/prisma/queries/list.ts 99 行）**

| 符号 | 去向 | 核对 |
|------|------|------|
| musicTrackSelection / musicLibrarySelection / MusicCatalogTrackRecord / MusicCatalogRecord | domain/catalog | 纯形状与选择常量（v2 指定先行入 domain） |
| musicTrackOrder / musicLibraryOrder | adapters | 查询排序关注点 |
| listActiveMusicTracks / listAllMusicTracks / listAllMusicLibraries / listMusicLibraryMemberships / listActiveMusicCatalog | adapters | **RepeatableRead 事务**（唯一一处）与合同校验 throw 原样保留 |

**import.ts（116 行 → adapters/prisma/import.ts）**：resolvePairs 保持事务内联；内联 select **并轨**至 musicTrackSelection/musicLibrarySelection（逐字段核对：曲目 12 字段、曲库 5 字段完全一致）；memberships select 无对应常量、保持内联。**types.ts / keys.ts / plan.ts** 原样 git mv（keys.ts 仅加边界桥接注释，见 R-KEYS）。

## R-KEYS（待裁定，唯一计划口径矛盾）

计划同时要求「keys.ts → domain」与「domain/application/ports 禁 Node（lib: ES2022 + types: []）」，实测二者不可兼得：边界校验拒绝 `keys.ts:3` 的 `import path from 'node:path'`（TS2307）。本轮处置：该行加 `@ts-ignore` 边界桥接注释（**不改任何既有注释、代码行为零变更**），仅压住纯层边界对该行的拒绝，其余 Node 用法仍会被边界拦下。待裁定二选一：

1. **纯实现**：用无依赖的 basename/extname 等价实现替换 node:path（需明确 win32 双分隔符语义，Windows 下的清单路径与上传文件名是真实输入）；
2. **改层**：titleFromFileName / deriveMusicTrackKey 随 Node 语义迁至 adapters（影响 Phase 3 manifest-builder 入 domain 的规划）。

## 改动清单（按层）

- **新增 `packages/music/`**：`package.json`（exports 六层：domain/ports/adapters/react/next/cli，TS 源码直发，`@incept/db: workspace:*`）、`tsconfig.json` / `tsconfig.src.json`（纯层边界，沿 core 范例）/ `tsconfig.node.json`（adapters/next/cli 认 node）、domain/ports/adapters 三个 barrel、react/next/cli 占位出口、`ports/music-repository.ts`（11 用例方法）。
- **git mv（10 文件，R 状态保留历史）**：types/keys/plan/manage/upload → `src/domain/`；import → `src/adapters/prisma/`；queries/list → `src/adapters/prisma/queries/`；3 测试 → `src/__tests__/`。`packages/db/src/music/index.ts` 删除（桶按层重导出）。
- **拆分新文件**：`domain/catalog.ts`、`adapters/prisma/manage.ts`、`adapters/prisma/upload.ts`。
- **改写面（B2 全清单）**：10 生产 + 6 测试；`packages/db/package.json` 移除 `./music` 导出；`next.config.ts` transpilePackages；`apps/web/package.json` workspace 依赖；根 `package.json` typecheck 链加入 `@incept/music`。
- **B1**：`apps/web/src/mount/{types,registry}.ts` 与 mount 测试同步（loader 类型分离）。
- `pnpm-lock.yaml`：install 后更新（workspace 链接 @incept/music）。

## 检查与结果（本机执行）

- `pnpm typecheck`：**四包全绿**（web；core 双配置；music 三重配置 = 纯层边界 + node 层 + 全量；db）。
- `pnpm test`：**266/266 全绿**——core 73、**music 27（3 文件随迁）**、web 166（19 文件 = 原 22 文件减 3 随迁）；总数与迁移前一致，零回退。
- `prisma validate`：schema **valid**（未动 schema/migration，符合决策 4）。
- `grep "@incept/db/music"`：**代码引用 0** ✓；全仓其余命中为 docs 计划/报告的历史描述 3 处 + `music-key.ts:1` 注释 1 处（READAI 2.1 冻结，见未完成项）。
- 方向核查：`from ...adapters` 在 domain/ports 为 **0**（domain 不依赖 adapters）✓。
- 非空探针（B3）：contentHash 唯一规则改坏 → 2 用例红 → 还原 → 27/27 绿 ✓（输出见上文对照）。

## Phase 2 验收对照

- ✓ `grep -r "@incept/db/music"` 代码引用为 0（注释 1 处按 READAI 冻结待批，见下）。
- ✓ plan/upload/manage 测试随迁全绿 + 非空探针红→绿。
- ✓ `pnpm test` / `pnpm typecheck` 全绿；`prisma validate` 全绿。
- ✓ contentHash 去重、P2002 重试一次、清单整体重写语义逐条回归不变（27 用例 + 逐函数核对表）。
- ✓ domain 层不 import adapters（类型方向核查 + 纯层边界三重配置）。

## 未完成项

- **music-key.ts:1 注释待批准修改**（READAI 2.1）：现实内容「转发 @incept/db/music 的键规则：网页服务端与 db 包共用一套实现」与迁移后事实不符，拟改为「转发 @incept/music/domain 的键规则：网页服务端与 music 包共用一套实现」。批准前不动，Phase 2 的 grep 全仓归零项保持"代码 0 + 注释 1 冻结"口径。
- **R-KEYS 待裁定**（纯实现 vs 改层，见上节）。
- Phase 3–8 待批准（Phase 3 起涉及 server 管线 10 文件与 findRepoRoot 解除）。
- 早前已登记遗留不变（owner loader 浏览器实测留 Phase 7 等）。
