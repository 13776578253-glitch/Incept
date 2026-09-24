# Music 模块化迁移计划（v2 修订）

## Status

修订二版，2026-09-23。v1（2026-09-22，16 项决策定稿）经实施前逐条审查（全部断言对照仓库实测）后，修正 7 处计数与口径偏差，并补遗 Phase 1 设计细节与 Phase 2 拆分细则。批准状态沿用 v1 范围表：Phase 0/1 已批准（本轮实施），Phase 2–8 待批准，未获批准的 Phase 一律不执行。基线见附录 A。

## 修订记录（2026-09-23，实施审查修正）

1. 数据层文件数 7 → **8**：`packages/db/src/music/index.ts`（纯 + 执行混导出的桶文件）此前漏计；行数 约 1,200 → **1,385**（实测）。
2. `@incept/db/music` 引用「14 处」→ 实测 **18 条静态 import 语句 / 16 个文件**（生产 10 + 测试 6），另有 2 处 `vi.mock` 与 2 处 `importOriginal` 类型引用；「14」疑按文件口径且漏计 2 个路由测试文件。
3. `settings-renderer.tsx` music props「6 个」→ **7 个**（漏计 `isMusicPreferencesReady`，settings-renderer.tsx:21-27）。
4. URL 散写「6 处（4 类管理端点）」→ **7 处字面量 / 5 类管理操作**：`use-music-track-catalog.ts:38`、`music-upload-client.ts:37`、`music-admin-panel.tsx:102/135/150/169/182`（PATCH 曲目、PATCH 曲库、POST 曲库、DELETE 曲目、DELETE 曲库）。
5. `features/music-player` 行数 1,925+881 → **2,123+896**（实测；其余三组行数与 v1 精确一致，疑 v1 计数后该目录又有提交改动）。
6. 测试归属修正：`library-consistency.test.ts` 测的是 apps/web `import-runner.ts`，归 **Phase 3**；Phase 2 随迁测试为 **3 个**（plan/manage/upload），Phase 3 为 **6 个**（server 实现 5 + consistency 1）。原 Phase 2「4 个」与 Phase 3「9 个」存在重叠认领。
7. A2 口径限定：「CLI 不动态 import apps/web」只约束 **music CLI**（`scripts/music-*.mjs`）；docs/activity 的 5 处动态 import 不在本迁移范围。

增补（审查发现，随本版落档）：

- **Phase 1**：保留字 section id 防劫持（贡献注册拒绝 `appearance`/`language`/`account`/`music`/`ai`）；设置页桌面端仅渲染当前 section、移动端渲染全部 section，contribution 面板须接入两条渲染路径；`EyeComfortFilterProvider` 是自闭合遮罩（不包裹 children），providerWrapper 的有序渲染须兼容该形态；`serverLoader` 的执行注册放服务端专用注册表（`src/mount/server.ts`），客户端可见的 mount manifest 不携带服务端闭包，防止服务端依赖进入客户端包图。
- **Phase 2**：纯/执行拆分细则与事务不变式清单（见该 Phase 风险注）；`MusicCatalogTrackRecord`/`MusicCatalogRecord` 是纯类型但现居 `queries/list.ts`，须先随 domain 迁移，禁止 domain 反向依赖 adapters；`resolveLibraryId`/`assertMusicLibraryAssignments`（manage.ts:16-47）为被 upload.ts:3 消费的跨界纯助手，随 domain 迁移；`isMusicUniqueConflict` 归 domain（纯），注记其 P2002 语义；`import.ts` 内联 select 形状（:14-31）与 `queries/list.ts` 的 selection 重复，迁移时并轨。
- **Phase 7**：`use-floating-position.ts:225` 对 `--navbar-height` 的 JS 运行时 `getComputedStyle` 读取，列入包所需变量清单；music 偏好 props 为 7 个。
- 风险登记新增 R9、R10。
8. B1（R10 强制，2026-09-23 Phase 2 批准附带）：`SettingsSectionContribution` 摘除 `serverLoader` 字段，loader 只存在于服务端注册表类型 `SettingsSectionServerLoader`（按 id 与分区配对）；类型测试同步。客户端可见贡献类型从编译期就不可能携带服务端闭包。
9. R9 裁定（2026-09-23）：纯/执行拆分接受「逐函数核对」兜底，不先补事务执行回归；逐函数映射表见 Phase 2 报告。R-KEYS 新增：keys.ts 的 `node:path` 与「domain 禁 Node」口径矛盾（计划两处要求不可兼得），暂以边界桥接注释冻结（零行为变更），待裁定纯实现或改层。
10. 未完成项裁定（2026-09-23）：R-KEYS **选 A（纯实现），语义必须 POSIX-only**（`\` 是普通字符，不是 win32 双分隔符），以 `path.posix` 等价测试锁语义；`music-key.ts:1` 旧包名注释**批准修改**，与 R-KEYS 同轮一次写完。
11. music-admin.ts 去向点名（2026-09-23，补 Phase 3 的第 10 文件缺口）：**→ application**（读用例编排，与 import-runner 编排同层，含面板视图类型 MusicAdminData 一族）；留 host 装配层会让决策 6/16 的「宿主只经 ports/装配/注册面接入」长期留缺口，host 现有 `readMusicAdminData` 直连是 Phase 7 serverLoader 收编前的过渡态。
12. Phase 5 注记（2026-09-23）：`tracks/route.ts:143` host 侧 `path.extname` 随收编改用包内 keys 的 POSIX-only 纯实现，避免两套 extname 语义并存（与 R-KEYS 选 A 对齐）。
13. Phase 3 实施修正（2026-09-23，已追认）：ncm-decode 去向 domain → **adapters**（node:crypto + Buffer 会被纯层边界拒绝，决策 1 梯度优先）；exports 清单补 **`./application`、`./testing`**（计划六层清单漏计）；media-store 拆**纯契约 → domain/media** + IO 留 adapters（避免 domain→adapters 反向依赖）；music-key.ts 按 **shim 删除**处理（消费者直连 domain）。纯层闭包（tsconfig.src.json）现为 **domain + ports**；application 的「禁直接 Node 导入」由 review + import-boundary lint 承担。
14. Phase 3 审查裁定（2026-09-23）：①`ports/auth` 的 Request 抑制**撤销**——端口泛型化 `AuthorizeOwner<TRequest = unknown>`，宿主以 `AuthorizeOwner<Request>` 定死（消灭需求而非压制，同类抑制保持零容忍）；②决策 1 **正式修订**：application 承认为 Node 可用编排层，其「禁直接 Node 导入」由 import-boundary lint 任务承接（BACKLOG B-25 已排期）；③`MusicRepository` 注释改为事实（端口 Phase 5 接线，现状无 PrismaMusicRepository）；`resolveWebMusicPaths` 无消费者与镜像路径三处重复留 Phase 4 收敛；④`source-scan` 扩展名白名单改由 `domain/media` 派生（三份白名单收敛为一根轴 + 嗅探侧映射）；⑤宿主 `mirrorDirectory` 按**追认**处置（依据决策 13「路径知识留宿主侧」），Phase 3 改动面措辞同步修正；⑥报告计数措辞修正为「16 rename + 1 shim 删除」。
15. Phase 5 开放问题裁定（2026-09-23，按 READAI 核对 Next 16 文档）：`route.md` 确认 `context.params` 为 Promise（现状正确、随迁保持）；`runtime.md:18` 确认 `'nodejs'` 是**默认值**——stub 的 `export const runtime` 随收编移除（零行为差异），仅 catalog stub 保留字面 `export const dynamic = 'force-dynamic'`（语义配置、须路由文件静态可析）。验收措辞同步：「stub 仅含 re-export 行」→「stub 形态 = re-export 行 + 注释 + 必要的 segment 配置行（当前仅 catalog 的 dynamic）」。另：`@incept/music` 以 peerDependencies（+devDependencies 供本地类型检查）声明 next——决策 1 给 next 层的 `next/server` 特权需要显式依赖。
16. Phase 4 修订版裁定与实施（2026-09-23）：**D.1 = 甲**（CLI 取 `--mirror`，根转发脚本给出；为 C6 归一，镜像布局常量唯一定义于 `scripts/music-paths.mjs`（+`.d.mts` 供 TS 侧解析），assembly 与两支转发脚本共用）；**D.2 = 删除 `resolveWebMusicPaths`**（甲之下无用途，死代码按 R8 清除）；**D.3 = 采纳**（cli 入口不导出、根脚本直接 exec，功能经 `./application`/`./adapters` 出口）。**R11 探针通过**（tsx 对 exports 自引用解析到 .ts 源正常）。**C1 基线对照达成**：临时 clone @ origin/main(a927a12) vs 新 CLI，manifest/import `--dry-run` 行级 0 diff；两次运行间输入清单 `music.json` 的 SHA-256 未变（输入指纹，非产物 hash）——兼证 R-KEYS「POSIX-only 零行为变更」。转发基准变更 db→music（R6 注记）；新增 `--env-file`/`--mirror` plumbing 标志（`--help` 文案保持原样以守 C4）。
17. Phase 6/7 前置修订（2026-09-23）：①**Tailwind `@source` 行并入 Phase 6**（globals.css 一行；仓库无 `tailwind.config.*`、只有 `postcss.config.js`，CSS-first 是唯一入口），**CSS 断言写进 Phase 6 验收**（build 产物 CSS 含包内 class 实测），**Phase 7 只做复核**；②**类型边界决策（非机械搬运）**：Phase 7 的 `SettingsSectionContribution.label` 在宿主类型上是 `(locale: AppLocale) => string`，函数参数逆变要求 `(locale: MusicLocale) => string` 可赋值的前提是 **AppLocale ⊆ MusicLocale**——最省做法：包自带 `MusicLocale` **精确镜像**宿主联合类型（Phase 6 落类型，music-schema 的宿主 AppLocale 依赖随之解除）；③**提交流程固定步骤**：`pnpm build` 会改写被跟踪的 `apps/web/next-env.d.ts`，Phase 7/8 的提交流程与 A11 证据步骤固定加一条 `git restore apps/web/next-env.d.ts`。
18. Phase 6 审查裁定（2026-09-23）：5 项实施修正**全部追认**（music-schema 迁回宿主、core 补依赖、testing 出 node 层配置、补 `jsx: react-jsx`）。**修订 18 = 决策 1 的有界例外**：`src/react/music-player/components/music-player-floating.tsx` 允许 `next/navigation` 的 `usePathname`（路由响应式，注入 props 会丢失响应性）——例外**仅限该文件该导入**，不构成 react 层可用 next 的一般许可；包内其余 react 文件仍以 React 为唯一框架依赖。**必修项（已修）**：`packages/music/tsconfig.json` include 补 `src/**/*.tsx`——原 `*.ts` 致 7 个 React 测试 .tsx（59 例，占 music 套件 1/3）静默失检（迁移前 web 的 tsconfig 含 `**/*.tsx`；vitest 全跑 + typecheck 全绿故两边不报警），与第 4 项补 jsx 属同一处遗漏。**「新增文件类型是否纳入对应 tsconfig 的 include」列入 Phase 7/8 收尾核对**。

## 背景与目标

music 功能当前约 6,400 行实现 + 3,400 行测试、65 个文件散布在 `apps/web` 的 features / server / api / settings / 布局六处，另有 `packages/db/src/music` 与根 `scripts/music-*.mjs`。功能已完成且稳定，是提取为标准模块的最佳时机。

目标形态：`packages/music`（`@incept/music`）作为进程内 feature package，自带 domain / application / ports / adapters / react / next / cli 全部实现；宿主只保留 mount 注册、route stub、authorizeOwner 适配、路径装配。不服务化、不拆数据库、零行为变更。

## 决策登记（定稿 16 项）

| # | 议题 | 定案 | 要点 |
|---|------|------|------|
| 1 | 包框架认知 | 分层梯度 | domain/application/ports 禁 React/Next/Node；react 认 React；next 认 next/server；cli/adapters 认 Node |
| 2 | music-player-core 归属 | 保持独立包 | domain 依赖 `@incept/music-player-core`；其零依赖机械边界与测试原样保留 |
| 3 | 边界强制方式 | exports + 分层 tsconfig + pnpm 隔离 + 包独立 typecheck | lint/import-boundary 基建另立任务 |
| 4 | 数据层归属 | 包定义 MusicRepository，包内 Prisma adapter | `@incept/db` 永久保留 schema、migration、Prisma client；music 包拥有业务规则与 `PrismaMusicRepository` |
| 5 | 媒体与文件系统 | 实现迁入包，路径装配注入 | contentRoot、mirrorDirectory 由宿主/CLI 装配提供；移除 `findRepoRoot` 跨 feature 依赖 |
| 6 | 鉴权端口 | `authorizeOwner(request): Promise<boolean>` | music 不感知会话模型、角色名、同源策略；公开目录路由保持无门禁 |
| 7 | 偏好与浏览器存储 | 迁入 react 层，key 不变 | Provider、hook、两个 localStorage key 常量随包；值保持 `incept-music-player-preferences`、`incept-music-player:v1:floating-ui` |
| 8 | Settings 扩展机制 | 最小 SettingsSectionContribution | 支持排序、可选 owner 门控 server loader、整块 React 面板；不做行控件/renderer 注册体系 |
| 9 | 全局挂载机制 | typed mount manifest | provider 包裹（有序）、floating overlay、layout slot 三类贡献 |
| 10 | API URL 合同 | 包导出 `musicEndpoints` 常量 + 路径 stub | Web 在约定 App Router 路径放 re-export stub；消除组件内 URL 散写 |
| 11 | 样式与层级合同 | 组件样式随包；全局层级变量由宿主提供 | z-index、navbar 高度、安全区由 Web 拥有并赋值；包声明所需变量清单 |
| 12 | 测试归属 | 随包迁移 | 包内 Vitest（React/route/fs 测试）；core 保持 node:test；fixtures 不反向依赖宿主 |
| 13 | CLI 与环境加载 | 实现入包，根脚本只转发 | CLI 接受显式配置或 `--env-file`；不再动态 import Web 源码 |
| 14 | 构建与样式扫描 | 迁移同步完成 | transpilePackages、Tailwind v4 `@source`、根 typecheck 均为迁移输入，不是可选优化 |
| 15 | 迁移策略 | 先最小模块机制，music 作首个完整迁移样本 | 按阶段推进，每阶段独立验收 |
| 16 | 迁移深度 | 进程内 package + ports + mount stubs | 共享 PostgreSQL、Prisma schema、部署进程不变；不服务化 |

三处口径澄清（与早期草案的差异，以本表为准）：

- 数据层：早期草案的「第二步把 schema/migration 收入 music 包」不再执行；`@incept/db` 永久保留 schema、migration、client，本迁移不生成任何 Prisma migration。
- 鉴权：端口是单一门禁函数 `authorizeOwner`，不暴露 viewer/角色/同源细节。
- Settings：原「6+1 插槽原语」收窄为最小 SettingsSectionContribution；account 分区暂不迁移。

## 边界全景（迁移对象）

（计数为 2026-09-23 实测；括号内为 v1 口径偏差处）

- 数据：`packages/db/src/music/**` **8 文件**（types/keys/plan 纯规则 + import/manage/upload/queries 执行 + index.ts 桶），**18 条静态 import 语句 / 16 文件**随迁改写（生产：5 路由、server/music 3 文件、settings 类型 2 文件；测试：plan/manage/upload/consistency + 2 个路由测试）。
- 服务端管线：`apps/web/src/server/music/**` 10 文件（import-runner 661 行、media-store 398、manifest-builder 321、ncm-decode 260、audio-inspection 113、music-admin 96、manifest-file 50、source-scan 31、content-root 28、music-key 8）。
- 鉴权触点：**6 个 internal 方法处理器**同一模式（同源 + owner 判定，非 owner 404）；公开 GET 零门禁。
- API：`app/api/**/music/**` 5 个 route handler + 2 个路由测试文件。
- React：`features/music-player/**` 25 文件、`features/settings/music/**` 14 文件、偏好 Provider/hook 2 文件（另各有 1 个偏好 Provider 测试文件随迁）。
- 设置框架硬编码 4 处：`settings-types.ts`（3 个 `music-*` controlType + `'music'` id）、`settings-renderer.tsx`（3 段分支 + **7 个 props**）、`settings-schema.ts`（静态 import）、`settings/page.tsx`（`readMusicAdminData` 直连）。
- 布局挂载 2 处：`app/layout.tsx`（RuntimeMount 包裹全站）、`app/[locale]/layout.tsx`（FloatingMount）。
- 宿主散落：`components/base/music-player-preferences-provider.tsx`、`hooks/use-music-player-preferences.ts`、`test/{music-fixtures,ncm-fixture,media-element}.ts`。
- 样式：`tokens.css` 的 `--z-music-player: 45`（纯 music 专属）、`--navbar-height`（宿主契约，另有 `use-floating-position.ts:225` 的 JS 运行时读取点）。
- 路由知识：`player-route-policy.ts` 的 5 条 HIDDEN_ROUTE_PREFIXES + 借用宿主 `localeConfig.locales`。
- URL 散写 **7 处**（目录 fetch 1、XHR 上传 1、管理端点 5）。
- CLI：`scripts/music-{manifest,import,cleanup}.mjs` 硬编码读 `apps/web/.env.local`、动态 import `apps/web/src/server/music/*.ts`。

## 规模统计

（实测修正版；实现 + 测试行数为物理行）

| 区域 | 文件数 | 行数（实现 + 测试） | 去向 |
|------|--------|--------------------|------|
| features/music-player | 25（20+5 测试） | 2,123 + 896 | packages/music react |
| features/settings/music | 14（11+3 测试） | 2,023 + 516 | packages/music react |
| server/music | 19（10+9 测试） | 1,966 + 1,597 | domain / application / adapters |
| api 路由及测试 | 7（5+2 测试） | 529 + 383 | packages/music next + stub |
| packages/db/src/music | 8 | 1,385 | domain + adapters/prisma |
| 宿主散落（偏好/fixtures 等） | 12 | 约 700（口径随分组浮动，实测 579–990） | react / 装配层 |
| scripts/music-*.mjs | 3 | 403（mock-audio 81 行另计） | packages/music cli（mock-audio 留下） |
| 合计 | 约 88 | 约 11,800 | — |

## Phase 0 — 决策落档与基线

不改任何运行代码。

改动面：

- 新增 `docs/decisions/en/music-package-boundaries.md` 与 `docs/decisions/zh/music-package-boundaries.md`（16 项决策、约束、状态行 Accepted (2026-09-22)，实现 commit 各 Phase 补记）。
- `packages/db/package.json` 新增 typecheck 脚本；根 `package.json` 的 typecheck 链加入 `@incept/db`。
- 本文件附录 A 记录基线：`pnpm test`、`pnpm typecheck` 的输出与计数。

验收标准：

- `pnpm typecheck` 覆盖 web、music-player-core、db 三包全绿。
- `pnpm test` 全绿，用例计数与迁移前一致。
- 决策文档 en/zh 内容等价（逐节对照）。

风险与阻塞：db 补 typecheck 可能暴露存量类型问题（R2）。若暴露：登记 `docs/BACKLOG.md` 独立修复项，除非阻塞迁移，否则不混入本迁移。

批准检查点：**停止。批准 Phase 1 后方可继续。**（v1 范围表已批准 Phase 0/1，本轮连续实施）

## Phase 1 — 最小模块机制（宿主基建，music 不动）

目标：建立决策 8/9 的注册机制，music 尚未注册，站点行为零变化。

改动面（apps/web）：

- 新增 `src/mount/types.ts`：typed mount manifest——providerWrapper（有序，深度 `provider-chain` / `root-layout` 两种包裹深度）、floatingOverlay、layoutSlot 三类贡献；SettingsSectionContribution——id、label、visibility、order、serverLoader（owner 门控）、panel（整块 React 面板）。
- 新增 `src/mount/registry.ts`：静态注册表与渲染 helper（收集按 order 稳定排序；保留字 id 与重复 id 注册即抛错）。
- 新增 `src/mount/server.ts`：服务端专用注册表（settingsSectionServerLoaders）；serverLoader 闭包不得进入客户端包图。
- `app/layout.tsx`、`components/base/app-providers.tsx`、`app/[locale]/layout.tsx`：增设贡献渲染位（既有宿主 Provider 原位保留，最小侵入；布局 slot 名 `shell-after`）。
- `features/settings`：`getSettingsPageData` 追加已注册 contributions（按 order 排序）；`settings-types.ts` 的 section id 放开为 string（既有字面量保持）；`settings-page-content.tsx` / `settings/page.tsx` 支持 contribution 整块面板与 server loader 数据流（桌面/移动两条渲染路径都接入）。

验收标准：

- 设置页 5 分区渲染与现状一致，全站行为零变化（浏览器抽查）。
- `pnpm test` / `pnpm typecheck` 全绿。
- manifest 类型可表达两种包裹深度、overlay、layout slot、section + loader（以类型测试验证；示例贡献只存在于测试，不注册到生产）。
- 保留字 section id 注册被拒绝（运行时测试验证）。

风险与阻塞：section id 放开可能影响 account 整块替换分支的类型收窄——account 分支逻辑保持不变，仅放宽 id 类型；保留字防劫持校验作为补偿（v2 增补）。EyeComfortFilterProvider 自闭合形态与桌面/移动双渲染路径为已知接入细节。

批准检查点：**停止。批准 Phase 2 后方可开始移动 music 代码。**

## Phase 2 — 包骨架与数据层

改动面：

- 新增 `packages/music/`：`package.json`（`@incept/music`，TS 源码直发，exports 按层：`./domain` `./ports` `./adapters` `./react` `./next` `./cli`）、分层 tsconfig（domain/application/ports：`lib: ["ES2022"]` + `types: []`；react：加 dom；adapters/next/cli：加 node）+ `tsconfig.src.json` 边界校验（沿 core 范例）。
- git mv `packages/db/src/music/{types,keys,plan}.ts` → `src/domain/`；`manage.ts`/`upload.ts` 拆分：plan*/校验纯函数 → domain，Prisma 执行 → `src/adapters/prisma/`；`queries/list.ts` → adapters/prisma（**纯类型 `MusicCatalogTrackRecord`/`MusicCatalogRecord` 与 selection 常量先行迁 domain**）；`index.ts` 桶按层重导出。这是本迁移唯一的非纯移动改动（纯/执行拆分），事务语义不得变化。
- 拆分细则（v2 增补，逐函数核对）：
  - manage.ts 内联 DB 校验（:207-209、:225-227、:255-257、:329-331、:345-350）与 import.ts `resolvePairs`（:86-99）依赖事务内读数，**留在执行侧**，不得移入 domain。
  - `resolveLibraryId`/`assertMusicLibraryAssignments`（manage.ts:16-47）随 domain 迁移（upload.ts:3 消费）。
  - `isMusicUniqueConflict`（upload.ts:171-177）归 domain，注记 P2002 语义。
  - 事务不变式：plan/校验调用保持在 `$transaction` 内、作用于事务内读取的数据（manage:234/259/306/338、upload:224/226/257）；`uploadMusicTrack` 的整事务 P2002 重试一次（:192-201）与 `listActiveMusicCatalog` 的 `RepeatableRead`（queries/list:78-98）及其合同校验 throw（:119-125）原样保留；调用层级与顺序不可变。
  - `import.ts` 内联 select 形状（:14-31）并轨到迁移后的 selection 常量。
- 新增 `src/ports/music-repository.ts`：MusicRepository（用例方法：listActiveCatalog、listAllTracks、listAllLibraries、listMemberships、importCatalog、uploadTrack、updateTrack、deleteTrack、createLibrary、updateLibrary、deleteLibrary）。
- packages/db：删除 `src/music/**`，exports 移除 `./music`。
- 改写 import（生产 10 文件 + 测试 3 文件）指向 `@incept/music/*`。
- 测试随迁：plan/manage/upload **3 个**测试 → packages/music（包内 Vitest，node 环境 pragma 同现状）。
- `apps/web/next.config.ts` transpilePackages 加入 `@incept/music`；`apps/web/package.json` 声明 `@incept/music: workspace:*`。

验收标准：

- `grep -r "@incept/db/music"` 全仓为 0。
- 迁移后既有 plan/upload/manage 测试全绿；非空探针：临时改坏一条 plan 规则，对应测试变红后还原。
- `pnpm test` / `pnpm typecheck` 全绿；`prisma validate` 全绿（schema 未动）。
- contentHash 去重、P2002 重试一次、清单整体重写语义逐条回归不变。
- domain 层不 import adapters（类型方向核查）。

风险与阻塞：manage.ts/upload.ts 拆分触及事务边界，须逐函数核对「纯规划 / 执行」归属后再移动（细则见上）；事务执行路径**无直接测试兜底**（路由测试 mock 掉 db 模块），迁移时须以逐函数核对 + 非空探针补偿，或先行补最小执行回归（R9）。

批准检查点：**停止。批准 Phase 3 后方可继续。**

## Phase 3 — 服务端管线与端口

改动面：

- git mv `apps/web/src/server/music/**` 10 文件入包：manifest-builder、music-key、ncm-decode、import-runner 纯函数 → domain；import-runner 编排、**music-admin（读用例编排，readMusicAdminData 与面板视图类型 MusicAdminData 一族）→ application**（2026-09-23 补点名，见修订记录 11）；media-store、audio-inspection、manifest-file、source-scan、content-root → adapters。
- 新增 `src/ports/paths.ts`（contentRoot、mirrorDirectory 注入）与 `src/ports/auth.ts`（`authorizeOwner`）。
- 删除 media-store 对 `features/docs/importer/paths` 的 `findRepoRoot` 依赖（media-store.ts:10，使用点 :92）。
- `apps/web/src/server/music/assembly.ts` 新增（Web 装配：authorizeOwner 实现包 `server/auth`；contentRoot 来自 env、mirrorDirectory 由宿主按仓库布局解析——2026-09-23 追认，依据决策 13「路径知识留宿主侧」）；`apps/web/src/server/**` 除装配外清空 music。
- `music-metadata` 依赖声明从 `apps/web/package.json`（dependencies:17）移到 `@incept/music`。
- 同步改写 `scripts/music-*.mjs` 的动态 import 目标指向包内路径（保持 CLI 可用，正式化留 Phase 4）。
- 测试随迁 **6 个**（ncm-decode、media-store-upload、manifest-builder、import-runner、audio-inspection、library-consistency——最后一个测的是本目录 import-runner.ts，v2 归属修正）。

验收标准：

- `apps/web` 内 import server/music 内部实现为 0（装配文件除外）；包内 `findRepoRoot` 为 0。
- 6 个 server 测试随迁全绿；media-store 路径逃逸防护测试保持（realpath + relative 双检）。
- `music-metadata` 不再出现在 `apps/web/package.json`。
- `pnpm test` / `pnpm typecheck` 全绿。

风险与阻塞：CLI 动态 import 目标必须与文件移动同轮完成，否则 CLI 断链。

批准检查点：**停止。批准 Phase 4 后方可继续。**

## Phase 4 — CLI 迁入

改动面：

- 新增 `packages/music/cli/`（manifest / import / cleanup 三个入口），配置显式化：`--root`、`--manifest`、`--env-file`。
- `scripts/music-*.mjs` 变纯转发：`pnpm --filter @incept/music exec tsx ...`，并显式传 `--env-file apps/web/.env.local`（用户命令与体验不变，路径知识留在根转发脚本即宿主侧）。注意转发基准目录从 `packages/db` 变为 `packages/music`，`--env-file` 须用根相对或绝对路径。
- `music-mock-audio.mjs` 留 `scripts/`（测试造数工具，不属于功能包）。

验收标准：

- 三个命令在真实内容根 `--dry-run` 输出与迁移前一致（清单 hash 与计划摘要对比留档）。
- **music CLI**（`scripts/music-*.mjs`）动态 import `apps/web` 路径为 0（A2 口径 v2 修正）。
- `music:manifest` / `music:import` / `music:cleanup` 命令名与参数体验不变。

风险与阻塞：env 加载语义变化经显式 `--env-file` 传递消除；runbook 需同步补一句转发机制说明（Phase 8 文档收尾统一做）。

批准检查点：**停止。批准 Phase 5 后方可继续。**

## Phase 5 — API 路由收编

改动面：

- 新增 `src/endpoints.ts`（`musicEndpoints` 常量）与 `src/next/`（5 个 route handler，消费 authorizeOwner 端口 + MusicRepository 装配）。
- 统一扩展名判定（2026-09-23 注记，见修订记录 12）：`tracks/route.ts:143` host 侧的 `path.extname` 随收编改用包内 keys 的 POSIX-only 纯实现（R-KEYS 选 A 语义）。
- `apps/web/app/api/**/music/**` 5 文件变 re-export stub。

验收标准：

- 5 端点行为不变（路由测试随迁全绿）：公开 GET 零门禁；internal 端点非 owner 返回 404 的语义逐条保持。
- stub 文件仅含 re-export 行。
- `pnpm test` / `pnpm typecheck` 全绿。
- 补齐 404 语义回归（v2 增补）：tracks POST 测试目前把 auth mock 成 owner，无非 owner 用例，随迁时补一条。

风险与阻塞：`runtime = 'nodejs'` 与 `context.params` Promise 约定的归属（stub 还是包导出）实施前按 READAI 要求核对 `node_modules/next/dist/docs/` 的 Next 16 文档后定（现状：5 文件均有 `runtime='nodejs'`，动态路由 `context.params` 为 Promise）。

批准检查点：**停止。批准 Phase 6 后方可继续。**

## Phase 6 — React 层迁入

改动面：

- git mv `features/music-player/**`（25 文件）、`features/settings/music/**`（14 文件）、偏好 Provider/hook（2 文件）+ 偏好 Provider 测试（`components/base/__tests__/music-player-preferences-provider.test.tsx`，v2 增补）、`test/{music-fixtures,ncm-fixture,media-element}.ts` → `src/react/**`。
- 组件 URL 改用 `musicEndpoints`（消除 **7 处**散写）。
- `player-route-policy` 改为 locales 注入 + 隐藏路由清单由 mount 配置传入。
- 偏好 localStorage key 常量随迁（值不变）。
- **类型边界决策（修订 17②）**：包内落 `MusicLocale`（精确镜像宿主 `AppLocale` 联合——函数参数逆变要求 AppLocale ⊆ MusicLocale）；`music-schema` 等对宿主 `AppLocale` 的类型依赖改用 `MusicLocale`。
- **Tailwind `@source` 行（修订 17①，自 Phase 7 并入）**：`globals.css` 加一行 `@source` 指向 `packages/music` 源码（CSS-first，仓库无 tailwind.config）。
- 测试随迁：包内 Vitest 配置（jsdom、setup 抽取共享部分）；`music-fixtures` 反向 import 改包内路径。

验收标准：

- 前端测试随迁全绿（feature 目录 8 个 + 偏好 Provider 1 个）；非空探针：播放器与上传各至少一处断言临时注入错误变红后还原。
- `apps/web` 内 import music 组件为 0（挂载/装配/桩除外）。
- 浏览器实测：迁移前后同一 localStorage 偏好值继续生效（key 不变）。
- 测试输出零噪声（jsdom media 警告为零；拆除顺序为 cleanup 先于恢复原型 stub）。
- **CSS 断言（修订 17①）**：`pnpm build` 产物 CSS 含 `packages/music` 内 class（`@source` 生效实测）。

风险与阻塞：vitest 基础设施抽取不得影响 web 既有测试（抽取后 web 全量回归一次）；`settings-renderer.test.tsx`（6 用例）覆盖 music 分支，Phase 7 删除分支时同步收敛。

批准检查点：**停止。批准 Phase 7 后方可继续。**

## Phase 7 — 挂载收编与构建定形

改动面：

- music 注册进 mount manifest（偏好 Provider wrapper、RuntimeMount wrapper、FloatingOverlay）与 SettingsSectionContribution（music section：3 行偏好 + 整块管理面板 + owner 门控 server loader；**7 个偏好 props** 迁入面板内部）。label 用包内 `MusicLocale`——函数参数逆变要求 AppLocale ⊆ MusicLocale，MusicLocale 精确镜像宿主联合（修订 17②）。
- 删除设置框架 music 硬编码：`settings-types.ts` 3 个 controlType 与 `'music'` id、`settings-renderer.tsx` 3 段分支与 **7 个** props、`settings-schema.ts` 静态 import、`settings/page.tsx` 的 `readMusicAdminData` 直连（改挂 serverLoader）、`settings-page-content.tsx` 的 `MusicAdminPanel` 直连与 7 个偏好 props 的 interactions（2026-09-23 补点名）。
- 样式：组件样式随包；`tokens.css` 由 Web 提供 `--z-feature-floating`（原 `--z-music-player` 更名）与 `--navbar-height`；包所需变量清单写入模块文档（含 `use-floating-position.ts:225` 的 JS 运行时读取点）。
- 构建定形：`@source` 与 CSS 断言已在 Phase 6 落地，本 Phase 只做复核（修订 17①）；transpilePackages 完成态核对。
- **提交流程固定步骤（修订 17③）**：凡执行 `pnpm build` 后、提交前固定执行 `git restore apps/web/next-env.d.ts`（build 会改写该被跟踪文件）。
- 删除 `apps/web` 残留 music 文件。

验收标准：

- 设置页整块注册渲染正确；3 行偏好样式与主题/语言行一致（浏览器截图与几何核对）。
- 悬浮播放器路由隐藏策略不变：工具页进出自如、播放不中断。
- 生产构建产物 CSS 含包内 class（实测 `pnpm build` 产物，防 `@source` 遗漏）。
- `pnpm test` / `pnpm typecheck` 全绿。

风险与阻塞：Tailwind 内容检测遗漏只在生产构建暴露，必须以产物实测为准；z-index 更名连带 `use-floating-position` 与 floating 组件的引用点。

批准检查点：**停止。批准 Phase 8 后方可继续。**

## Phase 8 — 删除演练、全量验收与冻结

改动面：

- 删除演练：临时摘除 mount 注册与 stub，构建应仅在 stub/注册处报错；恢复并把演练输出记入本文件。
- 边界检查留档：exports 封装、分层 tsconfig、pnpm 隔离各一条可复现验证命令及输出。
- **A11 证据步骤固定项（修订 17③）**：`pnpm build` 采集产物 CSS 证据后、提交前固定执行 `git restore apps/web/next-env.d.ts`。
- **收尾核对项（修订 18，Phase 7/8 共用）**：新增文件类型是否已纳入对应 tsconfig 的 include（Phase 6 曾因 include 漏 `*.tsx` 致 7 个测试文件静默失检）。
- 全量浏览器验收：播放、上传（音频 + NCM）、管理（曲库/曲目增删改查）、偏好、设置页。
- 冻结声明写入决策文档：music 扩展只经 ports / adapters / 注册面；`docs/BACKLOG.md` 登记遗留（account 分区按同一原语迁移、lint 基建、新模块 scaffold、`music:check-*` 兼容别名整理）。
- 文档收尾：两份 music runbook 补 CLI 转发机制说明与迁移后目录布局。

验收标准：下节验收总表 A1–A13 全部核销并留证据。

批准检查点：迁移完成，music 进入冻结状态。

## 验收总表（迁移完成的定义）

| # | 不变量 | 验证方式 |
|---|--------|----------|
| A1 | apps/web 不 import server/music 内部实现 | grep 为 0（装配除外） |
| A2 | **music CLI** 不动态 import apps/web（docs/activity 的 5 处不在范围） | grep 为 0（scripts/music-*.mjs） |
| A3 | `@incept/music` 唯一公共出口 | exports 封装；深层 import 编译失败实测 |
| A4 | 宿主只经 mount、stub、adapter 接入 | 残留文件清单核对（仅桩/装配/注册条目） |
| A5 | 删除包后 Web 仅剩桩处报错 | 删除演练记录 |
| A6 | 新模块可复制结构而无需改 music 内部 | 结构文档核对（scaffold 另立任务） |
| A7 | core、web、db、music 测试全部通过 | `pnpm test` 全量输出 |
| A8 | 边界约束可执行 | 三件套各一条验证命令留档 |
| A9 | 删除演练留记录 | 本文件 Phase 8 附录 |
| A10 | typecheck 覆盖含 @incept/db 与 @incept/music | 根 typecheck 链核对 |
| A11 | 构建集成完整 | transpilePackages + Tailwind `@source`；`pnpm build` 产物 CSS 实测含包内 class |
| A12 | 行为零变更 | 5 端点、上传/去重/NCM、导入 dry-run hash 对比、播放器交互、偏好保留 |
| A13 | UI 呈现不回退 | 设置行样式几何核对、悬浮播放器路由策略实测 |

## 范围边界

批准状态默认全部待批准，由主控按 Phase 点名批准范围。未点名的 Phase 即使前置工作自然引出也不执行。

| Phase | 内容 | 批准状态 |
|-------|------|----------|
| 0 | 决策落档与基线 | 批准（2026-09-23 实施） |
| 1 | 最小模块机制 | 批准（2026-09-23 实施） |
| 2 | 包骨架与数据层 | 待批准 |
| 3 | 服务端管线与端口 | 待批准 |
| 4 | CLI 迁入 | 待批准 |
| 5 | API 路由收编 | 待批准 |
| 6 | React 层迁入 | 待批准 |
| 7 | 挂载收编与构建定形 | 待批准 |
| 8 | 删除演练、验收与冻结 | 待批准 |

未交付（明确不在本迁移范围）：

- 独立 HTTP 服务、独立端口、独立部署（决策 16 否决）。
- 独立数据库与 schema/migration 入包（决策 4：`@incept/db` 永久持有）。
- 全能 settings 插件框架（行控件、自定义 renderer、section renderer 覆盖体系）。
- account 分区迁移（后续按同一原语另行迁移）。
- ESLint / import-boundary lint 基建（另立任务）。
- 新模块 scaffold 脚手架（另立任务）。
- 任何音乐功能的行为变更（本迁移零行为变更）。

## 风险登记

| # | 风险 | 缓解 |
|---|------|------|
| R1 | Tailwind `@source` 遗漏导致包内样式在生产构建丢失 | A11 以 build 产物实测，不以配置存在为准 |
| R2 | db 补 typecheck 暴露存量类型问题 | Phase 0 先行暴露，登记 BACKLOG 独立修，不混入迁移 |
| R3 | READAI 约束与大迁移的张力（禁改注释、最小侵入） | 文件一律 git mv、注释原样带走；注释与代码矛盾先报告再改 |
| R4 | Next 路由文件必须真实存在于 app/ | A5 验收形态定义为「仅桩处报错」，不是零文件 |
| R5 | fixtures 迁移破坏测试基线 | 非空回归探针逐套件执行（Phase 2/6） |
| R6 | env 加载路径变化影响使用习惯 | 根转发脚本显式传 `--env-file`，用户命令不变 |
| R7 | 双 runner 并存（core node:test、music/web Vitest） | 记录为已接受限制 |
| R8 | 注册机制先于真实消费者设计 | 契约严格取材于 music 已核实触点，不预留投机成员 |
| R9 | 事务执行路径无直接测试兜底（v2 增补） | 拆分逐函数核对 + 非空探针；或 Phase 2 前补最小执行回归 |
| R10 | serverLoader 闭包进客户端包图（v2 增补） | loader 注册收口 `src/mount/server.ts`，客户端 manifest 不携带 |

## 验证策略

- 每 Phase：`pnpm typecheck` 与 `pnpm test` 全绿并记录输出；结果标注为本机执行。
- 非空回归探针：关键行为断言临时注入错误确认变红后还原（Phase 2/6 各一组）。
- UI 相关 Phase（1/6/7/8）：浏览器实测 + 截图或几何核对为准，不以代码推理代替。
- Phase 4：迁移前后 CLI `--dry-run` 输出对比（清单 hash）。
- 附录记录基线与演练原始输出，注明执行环境。

## 提交策略

- Phase 2 前打一次 `anchor` 提交（大规模重构前快照，READAI commit type）。
- 文件移动一律 git mv 保留历史；注释原样搬运，发现注释与代码矛盾先报告（READAI 2.1）。
- 按层提交：数据/服务端改动与 UI 改动不混入同一提交；类型以 `refactor` 为主，机制新增为 `feat`。
- 仅本地提交，不推送远端；推送另行请示。
- 每轮 commit summary 按 READAI 3.1 格式随轮产出。

## 附录 A：Phase 0 基线

2026-09-23 本机执行（worktree `D:\Desktop\code\code\Incept-music`，Windows PowerShell 5.1，pnpm 10.30.3）。

**`pnpm typecheck`（exit 0，三包全绿）**

- `web` → `tsc --noEmit -p tsconfig.json`：通过。
- `@incept/music-player-core` → `tsc --noEmit -p tsconfig.src.json && tsc --noEmit -p tsconfig.json`：通过（双配置边界校验）。
- `@incept/db` → `tsc --noEmit`（Phase 0 新增脚本）：通过，**R2 未暴露存量类型问题**，无需登记 BACKLOG。

**`pnpm test`（迁移前基线，exit 0，257 用例全绿）**

- `@incept/music-player-core`（node:test）：**73/73**（queue/reducer/playback-mode/timing 4 文件）。
- `web`（Vitest 5 + jsdom）：**184/184，21 文件**，逐文件计数：
  - server/music/__tests__：audio-inspection 7、media-store-upload 12、music-import-plan 9、manifest-builder 12、ncm-decode 6、music-upload-plan 11、music-manage 7、library-consistency 7、import-runner 12（9 文件 83 用例）
  - 路由：`app/api/internal/music/tracks/__tests__/route.test.ts` 12、`tracks/[trackKey]/__tests__/route.test.ts` 3（2 文件 15 用例）
  - 前端：music-source 19、music-player-runtime-mount 3、music-player-provider 16、player-library-switcher 4、use-music-track-catalog 8、music-player-preferences-provider 10、settings-renderer 6、music-upload-zone 6、music-upload-filter 2、music-admin-panel 12（10 文件 86 用例）

**Phase 1 后增量（同日）**：`pnpm test` **266/266 全绿**（22 文件 web 193 = 基线 184 + mount-registry 9；core 73 不变）；`pnpm typecheck` 三包保持全绿。

## 记录

[2026-09-22] - Update by AI完成改动:
- 确认 16 项模块化决策定稿，完成 music 迁移边界全景探索与规模统计，制定 Phase 0…8 迁移计划。
- 遗留问题: 计划待评审与批准；批准范围未点名。
- Commit 建议: [docs]: music 模块化迁移计划（v1）制定

[2026-09-23] - Update by AI完成改动:
- 实施前逐条审查 v1 全部断言（文件/行数/import 计数/key/触点），修正 7 处计数与口径偏差，补遗 Phase 1 设计（保留字防劫持、双渲染路径、serverLoader 服务端隔离）与 Phase 2 拆分细则（事务不变式、类型归属、跨界纯助手），产出 v2 修订（本文件）。
- 遗留问题: Phase 2–8 待批准；R9 事务回归兜底方式待定（拆分核对 vs 先补测试）。
- Commit 建议: [docs]: music 模块化迁移计划 v2 修订落档

[2026-09-23 17:05] - Update by AI完成改动:
- Phase 2 实施（含 B1/B2/B3 强制项与 R9 裁定执行）：packages/music 包骨架（六层 exports、分层 tsconfig 边界）、manage/upload 纯执行拆分（事务语义逐函数核对不变）、catalog 形状与选择常量入 domain、import.ts 选择并轨、MusicRepository 端口（11 用例方法）、10 文件 git mv + 3 测试随迁（27 用例）、18 条 import 原子改写（10 生产 + 6 测试）、db 移除 ./music、transpilePackages 与 web 依赖同轮、R10 类型强制（B1）、非空探针红→绿留档。详见 `docs/current-task/2026-09-23-music-migration-phase2.md`。
- 遗留问题: R-KEYS（node:path 归层，已就地桥接零行为变更）与 music-key.ts:1 旧包名注释（READAI 2.1 冻结）待裁定；Phase 3–8 待批准。
- Commit 建议: [feat]: music 迁移 Phase 2 包骨架与数据层

[2026-09-23 19:20] - Update by AI完成改动:
- Phase 3 实施（服务端管线与端口）：6 实现 + import-runner/manifest-builder + music-admin + ncm-fixture + 6 测试 git mv 入包（import-runner 纯/编排拆分）；决策 5 路径注入（directory 必填、findRepoRoot 出包）；决策 6 鉴权端口 + 宿主 assembly；music-metadata 迁移；music-key shim 删除；三支 scripts 动态 import 同轮改写。验收：四包 typecheck 全绿、269/269 测试全绿（56 用例随迁、总数零漂移）、grep 全过。详见 `docs/current-task/2026-09-23-music-migration-phase3.md`。
- 遗留问题: 修订 13 的 4 处计划修正待追认；`removeMusicMediaByUrl` 过时注释行（READAI 冻结 + 变更注记）待批并改；Phase 4–8 待批准。
- Commit 建议: [feat]: music 迁移 Phase 3 服务端管线与端口

[2026-09-23 20:40] - Update by AI完成改动:
- Phase 5 实施（API 路由收编；Phase 4 未点名按范围规则跳过）：`src/endpoints.ts`（musicEndpoints）+ `src/next/` 5 个 route handler 工厂（authorizeOwner + MusicRepository Pick + paths 注入）；`PrismaMusicRepository` 接线端口（决策 4）；5 个 app/api stub 变 re-export（catalog 保留字面 dynamic）；`tracks/route.ts` 的 `path.extname` 改包内 POSIX 实现（修订 12）；2 个路由测试随迁（15 用例）+ 新增非 owner 404 回归（v2 增补）；next 以 peer+dev 声明。开放问题按 Next 16 文档定案（修订 15）。验收：四包 typecheck 全绿、**270/270** 测试全绿（269+1，对账精确）、stub 门禁/装配引用 grep 归零。详见 `docs/current-task/2026-09-23-music-migration-phase5.md`。
- 遗留问题: Phase 4（CLI 迁入）未批准、其收敛项（镜像路径三处重复、resolveWebMusicPaths）一并顺延；Phase 6–8 待批准。
- Commit 建议: [feat]: music 迁移 Phase 5 API 路由收编

[2026-09-23 21:30] - Update by AI完成改动:
- Phase 4（修订版）实施：CLI 三入口迁入 `src/cli/`（文案/参数逐字保留 + --env-file/--mirror plumbing）、纯转发脚本（基准 db→music）、exports 自引用（字面 src 路径归零）、镜像路径唯一定义（D.1 甲）、resolveWebMusicPaths 删除（D.2）、smoke 测试 6 例；R11 探针通过；C1 以 origin/main(a927a12) 临时 clone 基线对照达成（dry-run 行级 0 diff，兼证 R-KEYS）。详见 `docs/current-task/2026-09-23-music-migration-phase4.md`。
- 遗留问题: 无新增；Phase 4+5 就绪待合并提交；Phase 6–8 待批准。
- Commit 建议: [feat]: music 迁移 Phase 4+5 CLI 迁入与 API 路由收编

[2026-09-23 23:15] - Update by AI完成改动:
- Phase 6 实施（React 层迁入）：42 项迁移、URL 收敛 7 处、policy 注入化、MusicLocale 落地、@source + CSS 断言、共享 setup 抽取、真 barrel；80 用例随迁、**270/270 全绿**、探针红→绿闭环、宿主导入 grep 归零。实施修正 4 项 + react 层 next/navigation 例外（修订 18 待追认）。详见 `docs/current-task/2026-09-23-music-migration-phase6.md`。
- 遗留问题: 浏览器 localStorage 实测待补（唯一验收缺口）；Phase 7–8 待批准。
- Commit 建议: [feat]: music 迁移 Phase 6 React 层迁入

[2026-09-23] - Update by AI完成改动:
- Phase 7 实施（挂载收编与构建定形）：music 3 贡献位 + SettingsSectionContribution 注册进 manifest、设置框架 5 处硬编码切除（含 3 controlType/3 分支/7 props/music-schema/readMusicAdminData 直连）、`--z-feature-floating` 改名、构建复核 + 浏览器轮（5 分区顺序保全、非 owner 门控、**localStorage 偏好延续实测通过**）。构建复核抓获并修复 RSC 边界 bug（注册数据模块拆 `'use client'`）。271/271、四包 typecheck、build 全绿。详见 `docs/current-task/2026-09-23-music-migration-phase7.md`。
- 遗留问题: 浮层 DOM 可见性与 owner 浏览器视角并入 Phase 8 全量浏览器验收；Phase 8 待批准。
- Commit 建议: [feat]: music 迁移 Phase 7 挂载收编与构建定形
