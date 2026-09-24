# 2026-09-23 Music 模块化迁移 Phase 3 实施记录（服务端管线与端口）

## Status

**Phase 3 实施完成并验收。** `apps/web/src/server/music` 除装配外清空（10 文件 + 6 测试 + fixture 入包，全部 git mv 保留历史）；`findRepoRoot` 跨 feature 依赖移除（决策 5 核销）；`music-metadata` 迁出 web；三支 CLI 同轮改写无断链。四包 typecheck 全绿、**269/269 测试全绿**（总数与迁移前一致）。按流程未提交，等待审查。

[2026-09-23 19:20] - Update by AI完成改动:
- 修改了服务端管线的归属（media-store/audio-inspection/ncm-decode/manifest-file/source-scan/content-root → adapters；import-runner 拆纯函数 → domain/import-runner、编排 → application/import-runner；music-admin → application；manifest-builder → domain），实现了决策 5 路径注入（ports/paths + `directory` 必填、assembly 与 CLI 装配）、决策 6 鉴权端口（ports/auth + 宿主 assembly.authorizeOwner）、music-metadata 依赖迁移、`music-key.ts` shim 删除（消费者直连 domain）、`ncm-fixture` 迁包（`./testing` 出口）、6 测试随迁（56 用例）、三支 scripts 动态 import 同轮指向包内。
- 遗留问题: `removeMusicMediaByUrl` 旧注释第 2 行仍冻结待批并改；`resolveWebMusicPaths` 无消费者 + 镜像路径三处重复留 Phase 4 收敛；Phase 4–8 待批准。（其余审查裁定已全部落地，见文末「审查反馈处理」）
- Commit 建议: [feat]: music 迁移 Phase 3 服务端管线与端口

## 计划修正（实施中发现；已按 2026-09-23 审查裁定处置，见文末）

1. **ncm-decode 去向修正：domain → adapters**。计划点名入 domain，但其 `node:crypto` + `Buffer` 会被纯层边界（types: []）拒绝——与 R-KEYS 同类矛盾。已按 Node 计算归 adapters（决策 1 梯度优先于放置速记）。
2. **exports 清单缺口**：计划的六层清单（domain/ports/adapters/react/next/cli）漏了 application 与测试支持面——已补 `./application`、`./testing`（共 8 个出口）。
3. **media-store 纯/IO 拆分**（计划原为整体入 adapters）：纯契约（公开路径、格式白名单、操作形状）→ `domain/media.ts`；IO 留 `adapters/media-store.ts`。原因：`MusicImportPlanEntry.source` 的类型若留在 adapters 会造成 domain→adapters 反向依赖（Phase 2 同款问题）。
4. **music-key.ts 按删除处理**（计划点名 → domain）：它只是 8 行转发 shim，消费者（manifest-builder/music-admin/上传路由）已直连 `@incept/music/domain`，无入包实体可言。其注释（上一轮批准修正的那行）随文件删除。

## 关键实现注记

- **事务/行为不变式**：import-runner 编排逐字搬运，仅三处注入化改写（`getMusicContentRoot()` → `paths.contentRoot`、`path.resolve/join` + `fs.readFile` → manifest-file 的 `resolveMusicManifestPath`/`readMusicManifestRaw`、`fs.readdir` → media-store 的 `listMusicMirrorNames`），错误文案与调用顺序原样。
- **注释处置（READAI 2.1）**：全部既有注释逐字随代码搬运；两处注释与新代码矛盾的处置——`removeMusicMediaByUrl` 的「生产调用走默认镜像目录」冻结未动、其下新增变更注记行；被删函数（`musicMediaMirrorDirectory`）的注释随函数一并移除（已报告）。
- **music-admin → application**（上轮点名的第 10 文件）落地；其 `MusicAdminData` 一族被 9 个 settings 文件引用，已全部原子改写至 `@incept/music/application`。
- **tracks 路由测试双 mock 合并**：media-store 并入 adapters 后，db 覆写与镜像目录覆写合并进单一 `vi.mock('@incept/music/adapters')`（注释原样保留），临时目录覆写语义不变。
- **分层边界现状**：`tsconfig.src.json` 纯闭包 = domain + ports（机械强制）；application 因调用 adapters 图无法进纯程序（连带 node 解析失败），其「禁直接 Node 导入」由 review + 决策 3 已列的 import-boundary lint 任务承担。
- **A2 口径**：music scripts 动态 import apps/web = 0 ✓（`--env-file` 与镜像路径知识仍按决策 13 留在根转发脚本）。

## 改动清单（未提交）

- **git mv（16 项 R 状态保留历史 + 1 项 shim 删除）**：6 实现 → `src/adapters/`、import-runner/manifest-builder → `src/domain/`、music-admin → `src/application/`、ncm-fixture → `src/testing/`、6 测试 → `src/__tests__/`；`music-key.ts` 删除。
- **新增**：`domain/media.ts`、`application/import-runner.ts`、`application/index.ts`、`ports/paths.ts`、`ports/auth.ts`、`testing/index.ts`、宿主 `server/music/assembly.ts`（webMusicMirrorDirectory / resolveWebMusicPaths / authorizeOwner）。
- **改写**：media-store（去 findRepoRoot、directory 必填、+listMusicMirrorNames）、audio-inspection（+readAudioDurationSeconds）、manifest-file（+resolveMusicManifestPath/readMusicManifestRaw）、content-root（resolveMusicContentRoot(配置值)）、manifest-builder（extname → keys.extensionOf，POSIX 语义统一）、domain/import-runner（纯化）、music-admin、6 测试、tracks 路由（import 重组 + directory 注入 + 双 mock 合并）、9 处 settings 类型/调用、libraries 路由、route.test fixture、3 支 scripts、2 个 package.json、2 份 tsconfig。

## 检查与结果（本机执行）

- `pnpm typecheck`：**四包全绿**（music 三重配置：纯层闭包 domain+ports、node 层、全量）。
- `pnpm test`：**269/269 全绿**——core 73、music **86**（10 文件：随迁 56 = import-runner 12、manifest-builder 12、media-store-upload 12、library-consistency 7、audio-inspection 7、ncm-decode 6 + 旧 30）、web **110**（13 文件）。总数与迁移前一致，零回退。
- 验收 grep：`findRepoRoot`/`features/docs` 在包内 **代码 0**（唯一命中为报告用的变更注记）；apps/web 引用 `@/server/music/` **仅 assembly** ✓；`music-metadata` 已不在 apps/web/package.json ✓；music scripts 动态 import `apps/web/src` = 0 ✓；`@incept/db/music` 保持 0 ✓。

## Phase 3 验收对照

- ✓ apps/web 内 import server/music 内部实现为 0（装配文件除外）。
- ✓ 包内 findRepoRoot 为 0。
- ✓ 6 个 server 测试随迁全绿（56 用例）；media-store 路径逃逸防护测试保持（realpath + relative 双检，media-store-upload 12 用例）。
- ✓ music-metadata 不再出现在 apps/web/package.json。
- ✓ pnpm test / pnpm typecheck 全绿。
- ✓ CLI 无断链窗口（动态 import 与文件移动同轮完成）。

## 未完成项

- `resolveWebMusicPaths` 无消费者 + 镜像路径三处重复（assembly / music-import.mjs / music-cleanup.mjs）留 Phase 4 收敛。
- Phase 4–8 待批准；owner loader 浏览器实测仍留 Phase 7。

## 审查反馈处理（2026-09-23，已全部落地）

1. **ports/auth Request 抑制撤销**（❌ 不照收编）：端口泛型化 `AuthorizeOwner<TRequest = unknown>`（纯层零抑制、类型检查恢复），宿主 `assembly.ts` 以 `AuthorizeOwner<Request>` 定死——「music 不感知会话模型」成为类型事实。同类抑制保持零容忍。
2. **决策 1 正式修订**：application 承认为 Node 可用编排层；其「禁直接 Node 导入」由 import-boundary lint 承接——**BACKLOG B-25 已排期**（Active），决策文档 en/zh 同步修订。
3. **MusicRepository 注释改为事实**：原「PrismaMusicRepository 在 adapters/prisma 按此实现」不符现实（零实现、零消费者），已改写为「adapters/prisma 以裸函数导出、消费者直调；端口 Phase 5 正式接线」。`resolveWebMusicPaths` 无消费者与镜像路径三处重复（assembly / music-import.mjs / music-cleanup.mjs）留 **Phase 4** 一并收敛。
4. **扩展名白名单收敛**：`source-scan.MUSIC_AUDIO_EXTENSIONS` 改由 `domain/media.musicAudioFormats` 派生（`Object.keys` 保持同序同值，行为不变）；失效理由注释冻结 + 变更注记。audio-inspection 的格式映射属嗅探侧另一根轴，维持现状。
5. **宿主 mirrorDirectory 按追认处置**：决策 13「路径知识留宿主侧」为依据，装配层 `findRepoRoot` 属宿主内聚知识（决策 5 的字面要求「包内为 0」已达成）；计划 Phase 3 措辞已修正为「contentRoot 来自 env、mirrorDirectory 由宿主按仓库布局解析」。如你倾向改 env，一行即改。
6. **计数措辞修正**：本报告改动清单已改为「16 项 git mv 保留历史 + 1 项 shim 删除」。
7. **`removeMusicMediaByUrl` 注释按批准并改**：删除失实后半句、改「目录必填、由装配注入（决策 5）」，保留独立日期注记行（与包内其余注记同款）。审查通过，本轮以单 commit 交付。
