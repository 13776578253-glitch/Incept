# Music 包边界

## Status

Accepted on 2026-09-22。本文件的 16 项决策锁定 `@incept/music` 提取的边界；迁移阶段规格见 `docs/current-task/2026-09-23-music-package-migration-plan-v2.md`。实现 commit 按 Phase 逐条补记于本文件。

## Context

music 功能目前约 6,400 行实现 + 3,400 行测试，散布在 `apps/web` 的六处（features、server、api、settings、布局挂载、宿主散落偏好）以及 `packages/db/src/music` 与根 `scripts/music-*.mjs`。功能已完成且稳定，是提取为标准模块的最佳时机。目标是 `packages/music`（`@incept/music`）作为进程内 feature 包，自带 domain / application / ports / adapters / react / next / cli 全部实现；宿主只保留 mount 注册、route stub、`authorizeOwner` 适配与路径装配。不服务化、不拆数据库、零行为变更。

## Decision

十六项决策，按定案顺序：

1. **包框架是分层梯度。** domain / ports 禁止引入 React、Next 或 Node 内置模块；**application 是 Node 可用的编排层**（2026-09-23 修订：其「禁直接 Node 导入」由 import-boundary lint 任务承接约束，见 BACKLOG B-25）；react 层认 React；next 层认 `next` / `next/server`；cli 与 adapters 认 Node。
2. **`@incept/music-player-core` 保持独立包。** music domain 依赖它；其零依赖机械边界与测试原样保留。
3. **边界强制方式**为包 `exports`、分层 tsconfig、pnpm 隔离与包独立 `typecheck`。lint / import-boundary 基建另立任务。
4. **数据层归包所有。** 包定义 `MusicRepository`，拥有业务规则与 `PrismaMusicRepository` adapter；`@incept/db` 永久保留 schema、migration 与 Prisma client。本迁移不生成任何 Prisma migration。
5. **媒体与文件系统实现迁入包，路径装配注入。** `contentRoot`、`mirrorDirectory` 由宿主 / CLI 装配提供，删除 `findRepoRoot` 跨 feature 依赖。
6. **鉴权端口是一个门禁函数：** `authorizeOwner(request): Promise<boolean>`。music 不感知会话模型、角色名与同源策略；公开目录路由保持无门禁。
7. **偏好与浏览器存储迁入 react 层，key 不变。** Provider、hook 与两个 localStorage key 常量随包；值保持 `incept-music-player-preferences` 与 `incept-music-player:v1:floating-ui`。
8. **Settings 扩展是最小 `SettingsSectionContribution`：** id、label、visibility、order、可选的 owner 门控 server loader、整块 React 面板。不做行控件/renderer 注册体系。
9. **全局挂载是 typed mount manifest**，三类贡献：有序 provider 包裹（两种包裹深度：Provider 链与根布局）、floating overlay、命名 layout slot。
10. **API URL 合同**是导出的 `musicEndpoints` 常量加路径 stub：Web 在约定 App Router 路径放 re-export stub，组件内的 URL 散写全部消失。
11. **样式与层级合同：** 组件样式随包；全局层级变量（z-index、navbar 高度、安全区）由宿主拥有并赋值，包声明所需变量清单（含运行时 `getComputedStyle` 读取点）。
12. **测试随代码迁移**（React / route / fs 测试在包内 Vitest；core 保持 node:test）；fixtures 不得反向依赖宿主。
13. **CLI 实现迁入包，根脚本只做转发。** CLI 接受显式配置或 `--env-file`，不再动态 import Web 源码。
14. **构建与样式扫描是迁移输入**，不是可选优化：`transpilePackages`、Tailwind v4 `@source` 扫描、根 typecheck 链。
15. **迁移策略：** 先建最小模块机制，music 作首个完整迁移样本；按阶段推进，逐阶段验收。
16. **迁移深度是进程内 package + ports + mount stubs。** 共享 PostgreSQL、Prisma schema 与部署进程不变；不服务化。

三处口径澄清（取代早期草案）：

- **数据层：** 早期草案「第二步把 schema/migration 收入 music 包」取消。`@incept/db` 永久持有 schema、migration、client。
- **鉴权：** 端口是单一门禁函数 `authorizeOwner`，不暴露 viewer、角色或同源细节。
- **Settings：** 原「6+1 插槽原语」收窄为最小 `SettingsSectionContribution`；account 分区本次不迁移。

## Rejected alternatives

| 选项 | 否决理由 |
| --- | --- |
| 独立 music 服务、独立端口、独立部署 | 决策 16：部署进程保持单一；当前负载不证成本合理。 |
| 把 Prisma schema 与 migration 迁入 music 包 | 决策 4：数据库共享，`@incept/db` 是其永久归属；拆分会产生两条迁移历史。 |
| 全能 settings 插件框架（行控件、自定义 renderer、section renderer 覆盖） | 决策 8：真实消费者只有一个整块面板分区，框架即投机。 |
| 同批迁移 account 分区 | 超范围；后续按同一原语另行迁移。 |
| 包内提供 `music:*` 兼容别名层 | 暂留根脚本别名；整理登记为冻结期遗留。 |
| 包内保留 `findRepoRoot` 路径发现 | 决策 5：路径是装配职责；会解析 repo 根的包破坏 pnpm 隔离。 |

## Consequences

- 行为以合同冻结：5 个端点、上传 / 去重 / NCM、导入 dry-run 输出、播放器交互在迁移全程不得变化。
- music 只经 ports / adapters / 注册面（mount manifest 与 `SettingsSectionContribution`）扩展；宿主侧改动限于桩、装配与注册条目。
- 宿主客户端在装配时传入 `authorizeOwner`；包内任何代码不得读取会话或角色。
- 两个 localStorage key 与 CSS 变量合同（`--z-feature-floating`、`--navbar-height`，含 `use-floating-position` 的运行时读取）属于兼容面，迁移前后必须保持不变——唯一例外是 z-index 变量更名，在 Phase 7 一次性完成并同步全部引用点。
- 设置贡献的 server loader 闭包放在服务端专用注册表（`src/mount/server.ts`），服务端专属代码永不进入客户端包图。
- 边界由 exports + 分层 tsconfig + pnpm 隔离 + 包独立 typecheck 强制；lint 级 import-boundary 规则仍是独立任务。
- 实现 commit 按 Phase 各补一行记入本文件。

## 实现 commit 补记

自 2026-09-23 起按「一轮工作一个 commit」交付；下列 Phase 注记指向落地该阶段的轮次，commit 本体见 `git log`。

- **Phase 0 — 决策落档与基线（2026-09-23 轮）。** 本决策文件（en/zh）、迁移计划 v2 修订（含 Phase 0 基线附录）、`@incept/db` typecheck 脚本与根链接入（R2 未暴露）随该轮唯一提交一并入库。
- **Phase 1 — 最小模块机制（2026-09-23 轮，同一提交）。** `apps/web/src/mount`（manifest 类型、带保留字防护的空静态注册表、服务端专用 loader 注册表、9 个测试）与根布局 / Provider 链 / locale 布局 / 设置页接线。注册表保持为空直至 Phase 7。
- **Phase 2 — 包骨架与数据层（2026-09-23 轮）。** `packages/music` 落地：六层 exports 与分层边界 tsconfig；manage/upload 纯执行拆分、catalog 形状与选择常量入 domain、MusicRepository 端口（11 用例方法）、10 文件 git mv 与 3 测试随迁、18 条 import 原子改写（10 生产 + 6 测试）、`@incept/db` 移除 `./music` 导出、transpilePackages 与 web 依赖声明同轮，全部随该轮唯一提交入库。待裁定：`keys.ts` 的 `node:path` 与「domain 禁 Node」梯度的口径矛盾（已就地桥接，行为零变更）。
- **Phase 3 — 服务端管线与端口（2026-09-23 轮）。** 服务端 10 文件与 6 测试入包（import-runner 纯/编排拆分、music-admin → application、ncm-decode → adapters、media-store 拆纯契约入 domain/media）；决策 5 路径注入落地（`ports/paths`、directory 必填、包内 findRepoRoot 归零）；决策 6 鉴权端口落地（`ports/auth` + 宿主 `assembly.authorizeOwner`）；music-metadata 迁出 web、music-key shim 删除、三支 CLI 同轮改写无断链。exports 补 `./application`、`./testing`（共 8 出口）。待追认 4 处实施修正见迁移报告。
- **Phase 5 — API 路由收编（2026-09-23 轮）。** `src/endpoints.ts`（musicEndpoints，决策 10）与 `src/next/` 5 个 route handler 工厂落地；`adapters/prisma/repository.ts` 的 PrismaMusicRepository 正式接线 MusicRepository 端口（决策 4，11 用例方法）；5 个 app/api stub 变 re-export（catalog 保留字面 `dynamic`，`runtime` 按 Next 16 文档为默认值随收编移除）；404 语义回归补齐（非 owner 用例）。next 以 peer+dev 声明（决策 1 的 next 层特权）。
- **Phase 4 — CLI 迁入（2026-09-23 轮，与 Phase 5 合并提交）。** `packages/music/src/cli/`（manifest/import/cleanup + args/env 骨架）落地：用法文案与参数逐字保留，新增 `--env-file`/`--mirror` plumbing 标志；`scripts/music-*.mjs` 变纯转发（基准 db→music）；包内 CLI 全走 exports 自引用（字面 src 路径归零，A3 补强）；镜像布局唯一定义于 `scripts/music-paths.mjs`（D.1 甲，装配与转发共用）；`resolveWebMusicPaths` 删除（D.2）；R11 探针通过；C1 以 origin/main(a927a12) 临时 clone 基线对照达成（dry-run 行级 0 diff、清单 hash 一致，兼证 R-KEYS）。新增 CLI smoke 测试 6 例。
