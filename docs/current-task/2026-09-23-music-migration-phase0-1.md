# 2026-09-23 Music 模块化迁移 Phase 0/1 实施记录

## Status

**Phase 0/1 实施完成并验收。** music 功能代码零改动（迁移的代码移动从 Phase 2 开始，待批准）。工作区随本轮提交清空。

[2026-09-23 14:10] - Update by AI完成改动:
- 修改了 music 模块化迁移计划（v2 修订：实施审查发现的 7 处计数/口径修正、Phase 1 设计增补（保留字防劫持、桌面/移动双渲染路径、serverLoader 服务端隔离）、Phase 2 拆分细则与事务不变式、风险登记 R9/R10、附录 A 基线），实现了迁移 Phase 0（决策落档 `docs/decisions/{en,zh}/music-package-boundaries.md`、`@incept/db` typecheck 脚本接入根链、R2 未暴露存量类型问题）与 Phase 1（typed mount manifest、带保留字与重复 id 防护的静态注册表、服务端专用 loader 注册表、SettingsSectionContribution 整块面板 + owner 门控 server loader 数据流、三处布局贡献位、9 个新测试）。
- 遗留问题: owner 视角的 loader 数据流未做浏览器实测（注册表为空，属预期零变化，留待 Phase 7 有真实贡献后测）；Phase 2–8 待批准；R9 待裁定（纯/执行拆分时逐函数核对兜底，或先补最小事务执行回归）。
- Commit 建议: [feat]: music 迁移 Phase 0/1 最小模块机制与基线落档

## 提交清单

本轮按「一轮工作一个 commit」合并为单提交入库（自本轮起的交付约定，commit 本体见 `git log`）：

- `feat: music migration plan v2 and Phase 0/1`（2026-09-23）——计划 v2 修订、决策 en/zh、Phase 0 机制、Phase 1 mount 机制与接线、本记录，全部随此提交交付。

## 改动清单

**计划修订（`docs/current-task/2026-09-23-music-package-migration-plan-v2.md`，新增）**

- 7 处修正：db/music 7→8 文件（漏 index.ts）、`@incept/db/music` 引用 14→18 语句/16 文件、settings props 6→7、URL 散写 6 处/4 类→7 处/5 类、music-player 行数 1,925+881→2,123+896、测试归属（library-consistency 归 Phase 3；Phase 2=3 个、Phase 3=6 个）、A2 口径限定为 music CLI。
- 增补：Phase 1 保留字 id 防劫持与双渲染路径；Phase 2 事务不变式清单（plan/校验在事务内、P2002 整事务重试、RepeatableRead 原样保留）与类型归属（MusicCatalogRecord 先入 domain）；Phase 7 变量清单含 `use-floating-position.ts:225` JS 读取点；R9/R10。
- 附录 A：Phase 0 基线（typecheck 三包输出要点、test 257 用例逐文件计数、Phase 1 后 266 增量）。

**Phase 0**

- 新增 `docs/decisions/en/music-package-boundaries.md` + `docs/decisions/zh/music-package-boundaries.md`（16 项决策、口径澄清、Rejected/Consequences、逐节 en/zh 对照；实现 commit 已补记）。
- `packages/db/package.json`：新增 `"typecheck": "tsc --noEmit"`。
- 根 `package.json`：typecheck 链加入 `@incept/db`（现覆盖 web + music-player-core + db 三包）。

**Phase 1（music 零改动，注册表为空）**

- 新增 `apps/web/src/mount/types.ts`：MountContribution 三类（providerWrapper 两种包裹深度 `provider-chain`/`root-layout`、floatingOverlay、layoutSlot）+ `SettingsSectionContribution`（id/label/visibility/order/serverLoader/panel）+ `MountManifest`。
- 新增 `apps/web/src/mount/registry.ts`：空静态注册表 `mountManifest`、保留字 `RESERVED_SETTINGS_SECTION_IDS`（appearance/language/account/music/ai，注册即抛错）、重复 id 抛错、按 order 稳定排序的收集器、owner 门控 `loadSettingsSectionContributionData`、泛型面板类型擦除 helper、三个渲染 helper（createElement 实现，服务端/客户端共用，order 小者最外层）。
- 新增 `apps/web/src/mount/server.ts`：服务端专用 `settingsSectionServerLoaders`（serverLoader 闭包不进客户端包图，R10）。
- 新增 `apps/web/src/mount/__tests__/mount-registry.test.tsx`：9 个测试 = 类型测试（manifest 表达两种包裹深度 + overlay + slot + section&loader）+ 运行时（生产注册表为空、排序/深度过滤、包裹顺序、overlay/slot 过滤、保留字/重复 id 拒绝、loader owner 门控、面板渲染）。
- `apps/web/src/app/layout.tsx`：root-layout 包裹贡献位（既有 RuntimeMount 原位保留）。
- `apps/web/src/components/base/app-providers.tsx`：provider-chain 贡献位（既有四 Provider 原位保留，含 EyeComfortFilter 自闭合形态）。
- `apps/web/src/app/[locale]/layout.tsx`：floatingOverlay + layoutSlot（`shell-after`）贡献位（既有 FloatingMount 原位保留）。
- `features/settings/shared/settings-types.ts`：section id 放开为 `string`（内置五分区字面量保持）。
- `features/settings/shared/settings-schema.ts`：`getSettingsPageData` 按 order 追加已注册贡献分区（当前为空，输出不变）。
- `features/settings/page/settings-page-content.tsx`：`ContributionSectionPanel` 整块面板渲染，桌面/移动两条渲染路径接入；新增 `settingsContributionData` prop。
- `app/[locale]/settings/page.tsx`：调用 `loadSettingsSectionContributionData(settingsSectionServerLoaders, viewer.role === 'owner')` 灌数据流（既有 `readMusicAdminData` 直连原位保留，Phase 7 再收编）。

## 检查与结果（本机执行）

- `pnpm typecheck`：**exit 0，三包全绿**（web `tsc -p tsconfig.json`；core 双配置；db `tsc --noEmit` 新脚本，R2 未暴露）。
- `pnpm test`：**266/266 全绿**（core 73/73 node:test；web 193/193、22 文件 Vitest+jsdom = 迁移前基线 184 + 新增 mount 9，基线零回退）。
- 浏览器抽查（agent-browser 0.37.1 + `next dev` :3001，guest 视角）：
  - `/zh/settings` SSR 200（48,090 字符、5 个 `?section=` 导航链接、含「音乐」）；浏览器快照确认导航「设置分区」5 项（主题/语言/账户/音乐/模型）与主题分区控件（主题模式 亮色/暗色/跟随系统、护眼模式、代码块配色）渲染正常；截图 scratchpad `settings.png` 目视核对通过（左下角悬浮播放器 orb 在位）。
  - `/zh` 200（33,757 字符），无 Application error；截图 `home.png`。
  - 早前一条「home error overlay: True」为检查脚本误报（`next-error` 是 Next 产物块名；另 `$home` 撞 PowerShell 只读自动变量致首抓失败），已复核排除。
- 决策文档 en/zh 逐节对照（Status/Context/16 项 Decision/三处口径澄清/Rejected 6 项/Consequences）：内容等价。
- README 之外未跑 `pnpm lint`（lint 基建不在迁移范围，计划无 lint 断言）。

## 验收对照

- Phase 0 验收：✓ typecheck 三包全绿；✓ test 全绿且基线计数一致（257 → 257 保持 + 9 新增）；✓ 决策 en/zh 等价。
- Phase 1 验收：✓ 设置页 5 分区渲染与现状一致、全站行为零变化（浏览器抽查 + 截图）；✓ test/typecheck 全绿；✓ manifest 类型可表达两种包裹深度、overlay、layout slot、section + loader（类型测试）；✓ 保留字 id 注册被拒绝（运行时测试，v2 增补项）。

## 未完成项

- Phase 2–8 **待批准**（批准 Phase 2 前建议先裁定 R9：接受逐函数核对兜底，或先补最小事务执行回归；Phase 2 开工前按提交策略打 `anchor` 快照）。
- owner 视角的 server loader 数据流浏览器实测：注册表为空无从测，留 Phase 7 有真实贡献后随验收执行。
- Phase 1 的桌面/移动双渲染路径移动端仅代码核对（jsdom 测试 + 桌面浏览器），移动端真机/窄屏截图未做。
- 条目未超 20，暂不迁移 `finish-task/`。
