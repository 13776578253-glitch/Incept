# 2026-09-23 Music 迁移 Phase 2 跟进轮（裁定落地：R-KEYS / 注释 / music-admin 去向）

## Status

**三项裁定已实施完毕，检查全绿；按「完成后先报告、审查后提交」流程，本轮改动未提交，等待审查。**

[2026-09-23 18:45] - Update by AI完成改动:
- 修改了 keys 的文件名工具实现（R-KEYS 选 A：node:path 纯实现化，语义 POSIX-only——目录分隔符只有 `'/'`，`'\'` 是普通字符），实现了与 `path.posix` 逐例一致的 basename/extname 等价（55 行语料锁定，含 `'..'`/`'...'`/`'..hidden'`/`'a.'` 等全部点形边角）；同轮修正 `music-key.ts:1` 注释（批准项）；计划 v2 补点名 **music-admin.ts → application**（Phase 3 第 10 文件缺口）并登记 `tracks/route.ts:143` 的 Phase 5 扩展名统一注记。
- 遗留问题: 无新增（Phase 3–8 待批准；owner loader 浏览器实测仍留 Phase 7）。
- Commit 建议: [refactor]: keys 文件名工具纯实现化（POSIX-only）与音乐注释修正

## 裁定执行对照

1. **R-KEYS 选 A（纯实现，POSIX-only）**：`packages/music/src/domain/keys.ts` 移除 `node:path` 与 `@ts-ignore` 桥接，改为纯实现 `baseNameOf` / `extensionOf`（`titleFromFileName`、`deriveMusicTrackKey` 随之接入，函数体其余逐字保留）。纯层边界（tsconfig.src.json，`types: []`）现在**零豁免**通过。
   - 语义等价以 `src/__tests__/music-keys.test.ts` 锁定：3 个用例 = 55 行语料上与 `path.posix.basename/extname` 公式逐例比对（title 与 trackKey 两条路径）+ 反斜杠普通字符断言。
   - 等价规则（实测 `path.posix` 真值拟合）：末段取最后一个 `'.'`；点位于段首（`.hidden`）或整段恰为 `'..'` 时无扩展名；点在末位取 `'.'`（`'...'`→`'.'` 与 `'..'`→`''` 的同形不同果以真值为准）；全斜杠输入 basename 为 `''`。
   - 分隔符现实核查（零行为变更依据）：`source-scan.ts:20-21`「清单里的路径一律用正斜杠」（`split(path.sep).join('/')`）、`manifest-builder.ts:58` 自行 `split('/').join('-')`、上传 filename 为客户端 `File.name`——win32 双分隔符路径是死输入。
2. **music-key.ts:1 注释（批准）**：已同轮改为「转发 @incept/music/domain 的键规则：网页服务端与 music 包共用一套实现」。
3. **music-admin.ts 去向（点名）**：**→ application**（读用例编排，与 import-runner 编排同层，含面板视图类型 MusicAdminData 一族）。留 host 装配层会让决策 6/16「宿主只经 ports/装配/注册面接入」长期留缺口；host 现有 `readMusicAdminData` 直连是 Phase 7 serverLoader 收编前的过渡态。已写入计划 v2 Phase 3 改动面（10 文件全部点名）与修订记录 11。
4. **tracks/route.ts:143 注记（附带提醒）**：已登记计划 v2 Phase 5——host 侧 `path.extname` 随收编改用包内 keys 的 POSIX-only 纯实现，避免两套 extname 语义并存（修订记录 12）。

## 改动清单（未提交）

- `packages/music/src/domain/keys.ts`：纯实现化（-node:path/-@ts-ignore，+baseNameOf/+extensionOf）。
- `packages/music/src/__tests__/music-keys.test.ts`：新增，55 行 `path.posix` 等价语料锁。
- `apps/web/src/server/music/music-key.ts`：注释修正（批准项）。
- `docs/finish-task/2026-09-23-music-package-migration-plan-v2.md`：修订记录 10–12、Phase 3 music-admin 点名、Phase 5 扩展名统一注记。
- 本记录。

## 检查与结果（本机执行）

- `pnpm typecheck`：**四包全绿**；music 纯层边界**无任何桥接/豁免**通过（R-KEYS 关闭）。
- `pnpm test`：**269/269 全绿**（core 73 + music 30 = 27 旧 + 3 keys 等价、web 166）。

## 未完成项

- 无新增未完成项；本轮改动待你审查后按一轮一个 commit 提交（拟用上方 Commit 建议）。
- Phase 3–8 待批准。
