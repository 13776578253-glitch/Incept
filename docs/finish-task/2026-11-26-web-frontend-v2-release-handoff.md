# Web Frontend v2 重构完成与服务端上线交接文档

## 1. 交接概览

| 项目 | 说明 |
| --- | --- |
| 交接对象 | GPT（负责最终构建验收、推送 `origin/main` 与服务端部署上线） |
| 主仓库目录 | `D:\Desktop\code\code\Incept`（当前分支：`main`） |
| 原开发工作树 | `D:\Desktop\code\code\Incept\.worktrees\web-redesign`（分支：`refactor/web-frontend-v2`） |
| 远端基线 | `origin/main` = `aefdab4` |
| 本地合并状态 | 已将 `refactor/web-frontend-v2` 通过 `--no-ff` 无冲突合入本地 `main`，**尚未 `git push` 至远端** |
| 主分支既有未推送提交 | 合并前本地 `main` 已有 `381c4ff`（Dashboard 数据审计）与 `0de98d5`（Dashboard 范围切换性能排查）两笔文档/脚本提交（与本次前端重构无任何文件重叠） |

---

## 2. 本次并入 `main` 的完整提交清单

从分叉基线 `aefdab4` 起，`refactor/web-frontend-v2` 共合入以下 15 笔提交（含本文档提交前共 14 笔代码/配置/依赖提交 + 1 笔交接文档提交）：

1. `4f42373` `feat(web): redesign settings UI, theme presets, and code palette switching`
2. `e01954c` `feat(web): refine desktop navbar, music table styling, and account history truncation`
3. `fd6d6df` `feat(music): redesign desktop floating player surfaces and inline error notices`
4. `80507d9` `feat(web): unify Incept C2 brand mark and adapt docs home accents`
5. `47a2bf9` `feat(web): refine docs responsive reading layout, mobile header, and music orb`
6. `bc1ed4e` `feat(web): add docs reading typography controls and block theme integration`
7. `9e3acb4` `feat(web): add docs html embed block, curated whitelist, and mobile nav accordion`
8. `c1afe64` `feat(web): refine roadmap workflow and appearance settings`
9. `2679252` `feat(dashboard): redesign analytics workbench and optimize range-switch latency`
10. `aa52f53` `feat(dashboard): add 24h hourly heatmap, light/dark color schemes, and polish workbench layout`
11. `1636a5e` `chore(deps): upgrade next and eslint-config-next to 16.4.6`
12. `2169901` `chore(web): stop tracking gitignored next-env.d.ts`
13. `4218c5a` `feat(web): restyle about and activity pages for frontend v2`
14. `8850ccc` `fix(ops): include @incept/ui package in Dockerfile build stages`
15. 本文档提交：`docs: add web frontend v2 release handoff`

本地 `main` 在 `aefdab4` 之上原本自带的未推送提交（继续保留在 `main` 历史中）：
- `381c4ff` `docs: add Dashboard data audit`
- `0de98d5` `docs: record Dashboard range switch performance investigation`

---

## 3. 全站重构模块与功能范围

- **共享设计系统包 `@incept/ui`**：抽离主题 Preset tokens、语义颜色/边框/阴影变量与基础 UI Primitives（Button、Badge、Select、Switch、SegmentedControl、SettingsGroup/Row 等）。
- **导航栏与品牌标识**：统一 Incept C2 品牌标识、桌面端主导航样式，以及移动端折叠菜单手风琴与单激活态标点修正。
- **`/settings` 设置中心**：重构设置导航与分组卡片；支持主题 Preset 卡片、主题跟随/自定义 Shiki 代码高亮配色、文档阅读基础排版控制与高级选项折叠；新增 Docs 首页策展白名单管理面板、Dashboard 配色风格与单模型覆写配置面板。
- **`/docs` 与 `/notes`**：重构首页卡片与工具栏；引入数据库持久化 `isCurated` 首页策展白名单、文档内阅读排版控制与代码块主题集成、Markdown-like `html` 嵌入块解析与安全渲染，以及移动端阅读栏和目录抽屉交互。
- **Music 播放器（`@incept/music`）**：重构桌面端悬浮播放面板与内联错误提示、桌面曲目表样式，以及移动端纯图标可拖拽悬浮球。
- **`/roadmap`**：同步 v2 视觉风格、工作流与局部交互细节。
- **`/dashboard` 分析工作台（`packages/dashboard`）**：重构分析工作台与布局（固定视口与柔和滚动条）、新增单日 `24h` 分布热力图、支持亮/暗色独立模型家族色系与单模型优先级覆写、重构 `7d` / `30d` / `All` / `1D` 切窗与单飞请求/代次校验性能修复（详见 [Dashboard 范围切换性能交接](./2026-11-25-dashboard-range-switch-gemini-handoff.md)）。
- **`/about` 与 `/about/activity`**：收紧 `/about` Hero 高度使首段正文进入首屏、章节竖条切换至 `--color-accent`、保留轻量行内“查看活动记录”链接；`/about/activity` 升级 Git / Writing 为 v2 描边卡片、`color-mix(in oklab, ...)` 主题自适应热力图色阶、保留卡片右侧竖向年份栏、修复跨月刻度 `NovDec` 重叠问题、底栏固定单行英文日期计数。

---

## 4. 服务端上线必做变更清单

### 4.1 数据库迁移（上线必跑）

- **迁移文件**：[migration.sql](../../packages/db/prisma/migrations/20261123120000_add_docs_home_curation/migration.sql)
- **变更内容**：
  - 向 `docs_documents` 添加 `"isCurated" BOOLEAN NOT NULL DEFAULT false` 及索引 `docs_documents_isCurated_idx`。
  - 向 `docs_collections` 添加 `"isCurated" BOOLEAN NOT NULL DEFAULT false` 及索引 `docs_collections_isCurated_idx`。
- **兼容性**：新增列自带 `NOT NULL DEFAULT false`，对旧版运行代码向后兼容，可零停机**先执行 `prisma migrate deploy` 再发布新应用镜像**。
- **Prisma 客户端生成**：构建或本地直接运行前需执行 `pnpm db:generate`。

### 4.2 依赖、Next.js 配置与 Dockerfile 变更

- **新增工作区包与依赖**：
  - 新增 `packages/ui`（`@incept/ui`）。
  - `apps/web/package.json` 新增 `@incept/ui: workspace:*` 与 `lucide-react@^1.77.0`。
  - `next` 与 `eslint-config-next` 从 `16.4.3` 升级至 `16.4.6`（`pnpm-lock.yaml` 已更新）。
- **Next.js 编译转译列表**：[next.config.ts](../../apps/web/next.config.ts) 中 `transpilePackages` 已加入 `'@incept/ui'`。
- **Dockerfile 已同步补齐（`8850ccc`）**：[Dockerfile](../../Dockerfile) 已新增 `COPY packages/ui/package.json packages/ui/package.json` 及 `production-dependencies` 阶段 `/app/packages/ui/node_modules` 清理；构建镜像时请使用 `--frozen-lockfile`。
- **本地主目录运行提醒**：若在 `D:\Desktop\code\code\Incept` 主目录直接运行开发/脚本，合并后记得先执行 `pnpm install --frozen-lockfile` 与 `pnpm db:generate`。

### 4.3 未变更与无新增要求项

- `deployment/` 目录下无文件改动。
- 无新增必填环境变量。

---

## 5. 本地最终验证结果与环境限制

以下均为代码合入 `main` 前在 `D:\Desktop\code\code\Incept\.worktrees\web-redesign` 实测的完整结果（如实标注跳过项与宿主机环境限制）：

| 检查项 | 执行范围 / 命令 | 结果与备注 |
| --- | --- | --- |
| 全局类型检查 | `pnpm typecheck` | 通过，0 errors（覆盖 `@incept/ui`、`web`、`@incept/music`、`@incept/db`、`@incept/roadmap`、`@incept/dashboard`、`@incept/sync-agent`、`@incept/sync-gateway`、`scripts`） |
| Web ESLint | `pnpm lint` | 通过，0 errors（`8` 条其他目录既有 warning，本次 `/about` 等新增重构代码 0 warning） |
| `@incept/ui` | `pnpm --filter @incept/ui test` | `2` 个文件，`12` 项全部通过 |
| `@incept/music` | `pnpm --filter @incept/music test` | Vitest `26` 个文件 `200` 项通过（按包脚本 `--exclude src/__tests__/cli-smoke.test.ts`）+ `test:core` `73` 项全部通过 |
| `@incept/roadmap` | `pnpm --filter @incept/roadmap test` | `7` 个文件，`77` 项全部通过 |
| `@incept/dashboard` | `pnpm --filter @incept/dashboard exec vitest run --maxWorkers=4` | `56` 个文件 `410` 项通过；`1` 个预设文件 / `2` 项跳过（`recovery-sandbox-e2e.test.ts`） |
| `apps/web` | `pnpm --filter web exec vitest run --maxWorkers=2 --testTimeout=15000` | `49` 个文件 `206` 项通过；`5` 个 DB/同步集成测试文件共 `55` 项跳过（缺 `INCEPT_AUTH_TEST_DATABASE_URL` 或实时集成环境） |
| `@incept/sync-gateway` | `pnpm --filter @incept/sync-gateway test`（沙箱外回环端口） | `2` 项全部通过 |
| 生产运维校验 | `pnpm test:ops`（沙箱外回环代理端口） | `158` 项通过，`1` 项预设跳过（`159` total） |
| `@incept/sync-agent` | `pnpm --filter @incept/sync-agent test` | 本机 Windows 因 PowerShell 执行策略拦截未签名 `Install.ps1` 导致 `tests/windows.test.mjs` 失败；本次重构未改动 `apps/sync-agent`，待 Linux `docker build` 完整验证 |
| **生产构建（重要环境限制）** | `pnpm build` / `next build --webpack` | **本机 Windows 未完成构建产物**：默认 `next build`（Next 16.4.6 Turbopack）在 PostCSS loader 子进程 IPC 处触发 `node process exited before we could connect to it with exit code: 0`；`next build --webpack` 在向上扫描宿主目录时被受保护的 `C:\Users\86139\Intel\Logs\SetupRST.log` 触发 `EPERM readlink`（`apps/web/.next` 已清空残留缓存）。**请 GPT 在 Linux 容器环境中将 `docker build` / `pnpm build` 作为上线前第一必验门禁。** |

---

## 6. GPT 上线与验收操作清单

1. **同步远端与核对分支**
   - 在 `D:\Desktop\code\code\Incept` 执行 `git fetch origin` 检查远端是否有新提交，确认本地 `main` 可快进或正常合入远端。
   - 若要确认纯线上构建行为，建议直接在目标 Linux 构建机/Docker 环境拉取分支执行完整 `docker build`（`Dockerfile` 第 27–31 行会自动串行执行 `pnpm db:generate`、workers 构建、`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm test:ops` 与标准 `pnpm build`）。
2. **生产库迁移**
   - 对生产 PostgreSQL 执行 `prisma migrate deploy`，确认 `20261123120000_add_docs_home_curation` 成功应用（`docs_documents.isCurated` 与 `docs_collections.isCurated` 建列与索引生效）。
3. **重启上线与服务端健康检查**
   - 启动新镜像后检查容器健康状态与 `scripts/production-start.mjs` 启动日志，确认无 Prisma schema mismatch 或静态资源 404。
4. **线上全站路由与样式烟雾验收**
   - `/zh/docs` & `/zh/notes`：验证首页策展卡片筛选、阅读排版抽屉、代码块高亮主题切换、`html` 嵌入块渲染及移动端导航折叠菜单。
   - `/zh/roadmap`：验证看板样式与阶段切换正常。
   - `/zh/dashboard`：验证 `7d` / `30d` / `All` / `1D` 切换无串数据、单日 `24h` 分布热力图正常显示与悬停读数稳定、模型表格滚动条及设置页亮/暗双模式模型配色生效。
   - `/zh/settings`：验证外观 Preset、代码配色、Docs 策展白名单（需 Owner 登录）、Dashboard 配色与账号安全面板。
   - `/zh/about` & `/zh/about/activity`：验证首屏 Hero 比例、轻量行内“查看活动记录”链接、Git & Writing `color-mix` 热力图在亮/暗主题下的显示、右侧竖向年份栏与范围胶囊切换、顶部月份刻度无重叠，以及悬停/点击格子的单行英文底栏读数。
   - 全局导航与 Music：检查 C2 品牌标识、桌面端悬浮播放器及移动端 `390×844` 悬浮球与无横向溢出表现。
5. **推送与收尾**
   - 上述验证全部通过后推送 `git push origin main`。
   - 上线稳定后可按需移除本地开发 worktree：`git worktree remove .worktrees/web-redesign`。
6. **回滚方案**
   - 如需紧急回滚，代码可安全切回原基线 `aefdab4`（或合入前 `0de98d5`）；数据库中新增的 `isCurated BOOLEAN NOT NULL DEFAULT false` 列不会破坏旧版应用读写，无需做破坏性删列回滚。
