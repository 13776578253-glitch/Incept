# 生产上线准备独立验收评估报告 (Production Readiness Independent Acceptance Evaluation)

- **评估基线分支**：`codex/production-readiness`
- **基线 Commit**：`b623e13eaa1b09d1d20fb30eef832db06f9f47f6`
- **评估日期**：2026-10-13
- **评估原则**：严格只读受控运维（Controlled Read-Only Operations）、防作弊真实性审查（Anti-Cheating Integrity Forensics）、全量自动化验证（100% Automated Testing）
- **关联参考资料**：
  - 审查报告：`docs/current-task/2026-10-13-production-readiness-audit.md`
  - 整改记录：`docs/current-task/2026-10-13-production-readiness-remediation.md`
  - 任务清单：`docs/current-task/2026-10-13-production-readiness-checklist.md`
  - 验证证据：`output/production-readiness-2026-10-13/`（共 87 项测试与演练日志）

---

## 1. 执行摘要与验收结论 (Executive Summary & Acceptance Conclusion)

### 1.1 本地工程闭环评估结论 (Engineering Closure Verdict)
基于对分支 `codex/production-readiness` 上 18 项生产就绪整改任务（Task 01 至 Task 18）的代码逐行审查、静态类型与代码规范检查、全量自动化测试套件执行、对抗性安全边界穿透压测以及防作弊法医级审查，评估结论如下：

**分支工程级整改实现：全部完成并通过（18/18 任务闭环，100%）**

- **测试套件**：全工程 **461 / 461** 项测试全部通过（通过率 100%，0 失败，0 错误，0 挂起）。
- **生产依赖漏洞**：`pnpm audit --prod` 结果显示 **0 漏洞**（Critical: 0, High: 0, Moderate: 0, Low: 0, Info: 0）。
- **TypeScript 类型检查**：全工作区（Web、Dashboard、Database、Music、Roadmap、Scripts）**0 类型错误**。
- **ESLint 代码规范**：ESLint v9 Flat Config 校验退出码为 0，**0 错误**（仅存 9 项已知非阻断警告）。
- **生产容器镜像**：多阶段 Docker 构建成功剔除 Vitest、ESLint、jsdom、braces 等全部开发工具，生产镜像仅含 **187 个纯生产依赖包**，有效避免构建工具污染与潜在反序列化面。镜像摘要：`sha256:8c84cca92c2bcc7dde0c1d49721217d4079294f8399939be538abe4636f5f31c`。

### 1.2 公网放行门禁评审结论 (Public Release Gate Review)

> **⚠️ 关键判定：当前阶段公网发布状态必须严格保持 “NO-GO”**

**核心决策依据（本地工程闭环与公网放行解耦原则）**：
1. **基础设施物理缺失**：当前验收运行于本地隔离环境（Windows / WSL2 / 临时 Docker 容器沙箱），目前**尚无真实公网云服务器、公网 IP、独立云安全组、解析生效的公网域名**。
2. **TLS 证书与公网验证缺失**：本地使用 Pebble ACME 及自签测试 CA 完成了证书签发、续期与故障回滚脚本逻辑验证，但尚未在公网由真实 Let's Encrypt CA 签发并在真实网络中通过 SSL Labs A+ 评级验证。
3. **异地灾备物理隔离缺失**：Task 13 验证了 Restic 加密备份与 14 天滚动保留逻辑，但测试端点为同机容器化 SFTP 节点，尚未接入跨可用区/跨云厂商的独立异地对象存储（如 AWS S3 / 阿里云 OSS）。
4. **宿主机生产级守护未激活**：systemd 服务模板通过了临时用户单元测试，但尚未在常驻生产宿主机上配置开机自启、真实 webhook 故障告警分发以及系统级 journald 存储硬配额。
5. **物理真机与运营商蜂窝网络走查待执行**：全流程端到端走查（Task 14）目前在本地 Chromium/Edge（1440px 与 390px 模拟视口）完成，尚未在真实 iOS/Android 物理移动设备及 4G/5G 蜂窝网络下验证音视频加载性能与弱网重试行为。

因此，**代码与本地架构已具备生产就绪品质，但公网放行必须等待云基础设施就绪并完成生产前置清单验证后方可切换为 GO。**

### 1.3 核心指标度量总览 (Readiness Scorecard)

| 度量维度 | 指标基线要求 | 本次独立验收实测值 | 评估判定 |
| :--- | :--- | :--- | :---: |
| **任务闭环度** | 18 项整改全部有真实代码与机制支撑 | 18/18 项代码与本地演练完成 | **PASS** |
| **自动化测试** | $\ge 461$ 项测试且无虚假/空断言 | 461 / 461 项测试通过（耗时约 12s） | **PASS** |
| **生产安全漏洞** | 0 Critical / 0 High / 0 Moderate | 0 生产漏洞（评估 277 个生产依赖） | **PASS** |
| **类型安全** | 全 Monorepo 严格无类型报错 | 0 TS 错误（6 个 package / scripts 均通过） | **PASS** |
| **代码质量门禁** | ESLint 9 正常运行且 0 错误 | 0 errors, 9 non-blocking warnings (Exit 0) | **PASS** |
| **工作区安全** | 0 破坏性 Git 操作，工作区 100% 完整 | 63 修改 + 56 未跟踪 = 119 文件完全无损 | **PASS** |
| **历史产物保留** | 历史 87 项测试与压测日志完好 | 87 / 87 项产物完整保留于 `output/` | **PASS** |
| **公网放行状态** | 必须确认公网前置条件前严禁切流 | 维持 **NO-GO**，待真实云设施具备 | **SOUND** |

---

## 2. 逐项验收矩阵 (Task-by-Task Acceptance Matrix: Tasks 01 to 18)

本节对照用户规划清单（Task 01 至 Task 18），对每一项任务的代码变更、设计逻辑、安全边界、测试证据及验收状态进行逐一核验。

---

### Task 01: 核心依赖加固与高危漏洞消除 (Core Dependency Hardening)
- **目标变更文件**：
  - `package.json`（根目录 overrides 与 engines）
  - `apps/web/package.json`（Next.js、React、sharp 版本升级）
  - `packages/music/package.json`（music-metadata 升级）
  - `packages/db/package.json`（Prisma 引擎及 tsx 移入生产依赖）
  - `Dockerfile`（多阶段构建生产依赖隔离）
  - `pnpm-lock.yaml`（锁定安全版本依赖图谱）
- **实现逻辑与代码审查**：
  1. 在根 `package.json` 中配置严格 scoped `pnpm.overrides`，针对 `@babel/core` (`^7.29.6`)、`browserslist` (`^4.28.7`)、`source-map-js` (`^1.2.2`)、`@prisma/config>deepmerge-ts` (`8.0.0`)、`esbuild@<0.28.1` (`0.28.1`) 实施全局强制版本覆盖。
  2. 升级 `apps/web` 中 `next` 至 `16.4.0`、`react`/`react-dom` 至 `19.2.8`、`sharp` 至 `0.35.5`；升级 `packages/music` 中 `music-metadata` 至 `11.16.1`。彻底消除了 Next.js Server Function DoS、sharp AVIF 解码堆缓冲区溢出以及 music-metadata 递归解析死循环。
  3. 改造 `Dockerfile` 采用 `production-dependencies` 多阶段抽取机制：备份 Prisma 原生引擎，清空源码工作区全部开发 node_modules，执行 `CI=true pnpm install --prod --offline --frozen-lockfile --ignore-scripts`，回填 Prisma 原生引擎并校验 `.next` 软链接完整性。
- **验收状态**：**通过 (Pass)**
- **验证证据与测试覆盖**：
  - 审计命令 `corepack pnpm audit --prod --json` 输出：`"vulnerabilities": {"info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 0}`，总计评估 277 个生产依赖项。
  - 运行镜像证据 `output/production-readiness-2026-10-13/ops-complete/runtime-artifact-proof.log` 确认安装目录仅 187 个包，无 Vitest、ESLint、jsdom 等开发工具。

---

### Task 02: Dashboard 用量数据脱敏与强制采集冷却 (Dashboard Usage Privacy & Cooldown)
- **目标变更文件**：
  - `apps/web/src/app/api/dashboard/usage/route.ts`
  - `packages/dashboard/src/next/usage-route.ts`
  - `packages/dashboard/src/domain/public-summary.ts`
  - `packages/dashboard/src/next/dashboard-page.tsx`
  - `packages/dashboard/src/react/hooks/client-snapshots.ts`
- **实现逻辑与代码审查**：
  1. 在 `apps/web/.../usage/route.ts` 中解析 `getCurrentViewer()`，仅当 `viewer.role === 'owner'` 时传递 `viewer.sessionId`，访客传入 `undefined`。
  2. 在 `usage-route.ts` 中实现权限守卫：若未携带 `ownerSessionId`，任何带有 `?refresh=1` 的请求直接阻断返回 **HTTP 403 Forbidden**；普通匿名请求仅调用 `readDashboardSnapshot` 读取磁盘已有快照，严禁触发后台 Worker。
  3. 采用白名单结构投影 `publicDashboardSummary`：以 `emptyDashboard` 为底座，仅拷贝脱敏的总计 Token、日期、缓存命中率和聚合费用；字段 `projects`、`sessions`（含会话标题、终端设备）、`models`、`sources` 和内部报错堆栈强制清空置为 `[]`。
  4. 对已认证 Owner 的强制采集实施防抖与冷却：在内存维护 `Map<string, number>`，强制采集间隔低于 30 秒时直接拒绝并返回 **HTTP 429** 与 `Retry-After: 30` 响应头。
  5. 客户端与 SSR 数据按身份分域：`dashboard-page.tsx` 根据 `canImport` 使用不同的组件 key（`key={canImport ? 'owner' : 'public'}`），客户端 LocalStorage 缓存键采用 `${scope}:${range}` 隔离，彻底防止切换身份后数据残留。
- **验收状态**：**通过 (Pass)**
- **验证证据与测试覆盖**：
  - 测试套件 `pnpm --filter @incept/dashboard test` 全量通过（18 文件，93 项测试）。
  - 对抗性注入测试证明：注入宿主机路径 `/home/deploy/.../.git` 与会话标题，经 `publicDashboardSummary` 序列化后敏感特征数量为 0。
  - 接口实测：未登录调用 `GET /api/dashboard/usage?refresh=1` 返回 HTTP 403；未登录普通请求返回 200 脱敏数据；Owner 连续调用立即触发 HTTP 429。

---

### Task 03: 文档媒体鉴权 Route Handler 与防静态枚举 (Document Media Access Control)
- **目标变更文件**：
  - `apps/web/next.config.ts`（beforeFiles 路由重写规则）
  - `apps/web/src/app/api/docs/media/[fileName]/route.ts`
  - `apps/web/src/server/docs/media-access.ts`
  - `apps/web/src/server/media/file-response.ts`
  - `apps/web/src/features/docs/importer/media/local-store.ts`
- **实现逻辑与代码审查**：
  1. 在 `next.config.ts` 中配置 `beforeFiles` 重写：
     `{ source: '/_docs-media/:fileName', destination: '/api/docs/media/:fileName' }`。
     `beforeFiles` 在 Next.js 静态文件匹配之前执行，彻底阻断了绕过鉴权直接从 `public/` 目录拉取静态文件的安全后门。
  2. 在 `apps/web/src/server/docs/media-access.ts` 中执行真实的 PostgreSQL 原生查询：利用 `jsonb_path_exists(l."bodyJson", '$.sections[*].blocks[*] ? (@.type == "image" && @.src == $url)')` 校验该图片是否确实存在于已发布文档（`l.status = 'published'`）的正文结构中，并严格核对当前访客角色（`guest` < `pro` < `owner`）是否满足文章及所属合集的访问门槛。
  3. 防探测与抗枚举设计：当图片不存在、文章未发布或当前用户权限不足时，统一返回 **HTTP 404 Not Found** 并附加 `Cache-Control: no-store`，杜绝攻击者通过 401/403 与 404 的状态码差异暴力枚举私密文件名。
  4. 针对 Owner 提供发布前草稿预览豁免：Owner 角色允许读取有效哈希格式的未引用草稿媒体，保障文章导入编辑工作流流畅。
- **验收状态**：**通过 (Pass)**
- **验证证据与测试覆盖**：
  - 测试套件 `pnpm docs:check-media` 与 `file-response.test.ts` 全部通过。
  - 隔离日志 `output/production-readiness-2026-10-13/linux-legacy-static.log` 验证：向静态目录植入受限图片，以 Guest 身份请求该 URL 稳定返回 404。
  - 演练日志 `linux-http-preview-final.log` 确认：新上传图片在发布前 Owner 可正常返回 200 预览，Guest 返回 404；发布后 Guest 正常返回 200。

---

### Task 04: ESLint 9 Flat Config 配置与 Hydration 规范修复 (ESLint 9 Flat Config)
- **目标变更文件**：
  - `apps/web/eslint.config.mjs`
  - `apps/web/package.json`
  - `apps/web/src/hooks/use-mounted.ts`
  - `apps/web/src/components/base/color-scheme-provider.tsx`
  - `apps/web/src/hooks/use-eye-comfort-filter.ts`
- **实现逻辑与代码审查**：
  1. 采用 ESLint 9 原生 Flat Config 规范编写 `apps/web/eslint.config.mjs`，完整整合 `eslint-config-next/core-web-vitals` 与 `eslint-config-next/typescript`，配置全局忽略目录 `.next/**` 与导入生成代码。
  2. 修复 React 19 服务端渲染下的 Hydration 闪烁与水合不匹配缺陷：
     - 重构 `use-mounted.ts`，使用 React 18/19 标准的 `useSyncExternalStore(subscribe, () => true, () => false)` 替代易受并发渲染影响的 `useEffect + setState` 模式。
     - 修复 `color-scheme-provider.tsx` 与 `use-eye-comfort-filter.ts` 在服务端或水合尚未就绪前直接访问 `localStorage` 或 `window.matchMedia` 的潜在报错。
- **验收状态**：**通过 (Pass)**
- **验证证据与测试覆盖**：
  - 执行 `corepack pnpm run lint`（对应 `eslint .`）退出码为 0，输出报告显示 **0 错误，9 项非阻断警告**（均为已知未使用的局部变量声明或 Next.js 建议优化警告），完全满足代码质量门禁要求。

---

### Task 05: Roadmap 管理面板 GET 请求同源拦截 Bug 修复 (Roadmap Admin Origin Bypass Fix)
- **目标变更文件**：
  - `apps/web/src/server/roadmap/assembly.ts`
  - `apps/web/src/server/auth/request-origin.ts`
  - `packages/roadmap/src/react/admin/roadmap-admin-panel.tsx`
  - `apps/web/src/server/roadmap/__tests__/assembly-auth.test.ts`
- **实现逻辑与代码审查**：
  1. 修复原代码中所有请求无差别检查 `Origin` 头导致同源 GET 刷新失败的缺陷。在 `assembly.ts` 中精准调整鉴权断言：
     ```typescript
     export const authorizeOwner: AuthorizeOwner<Request> = async (request) =>
       (request.method === 'GET' || request.method === 'HEAD' || hasSameOrigin(request)) &&
       (await isRoadmapOwner());
     ```
  2. 保持对只读操作（`GET`/`HEAD`）的身份鉴权：即使免除 `Origin` 头检查，仍必须通过 `isRoadmapOwner()` 校验 Owner 会话。未认证用户或普通访客调用均由 `guardOwner` 统一拦截并返回 **HTTP 404**（实现接口隐蔽，不暴露管理端存在）。
  3. 保持对写操作（`POST`/`PATCH`/`DELETE`）的严格 CSRF 防护：必须同时满足 `hasSameOrigin(request) === true` 与 Owner 身份。外部恶意域名（如 `Origin: https://evil.com`）发起的写请求被坚决阻断。
  4. 在 `request-origin.ts` 中增强反向代理安全头校验：仅当 `INCEPT_TRUST_PROXY === '1'` 时信任 `x-forwarded-*` 头，且对协议进行 `/^(https|http)$/` 正则校验，对 Host 包含空格、换行、反斜杠等非法字符实施防护。
- **验收状态**：**通过 (Pass)**
- **验证证据与测试覆盖**：
  - 测试套件 `pnpm --filter web exec vitest run src/server/roadmap/__tests__/assembly-auth.test.ts` 全量通过（4 项专项测试）。
  - 测试套件 `pnpm --filter @incept/roadmap test` 全量通过（7 文件，67 项测试）。
  - 对抗性测试证明：Owner 免 Origin 头的 GET 请求返回 200；跨域伪造 Origin 的 POST/DELETE 请求稳定返回 404 拒绝。

---

### Task 06: 文档发布事务原子性、持久回执与咨询锁 (Document Publication Transactionality)
- **目标变更文件**：
  - `packages/db/src/docs/confirm.ts`
  - `packages/db/src/docs/import.ts`
  - `packages/db/prisma/schema.prisma`
  - `packages/db/prisma/migrations/20261013090000_add_docs_import_confirmations/migration.sql`
  - `apps/web/src/app/[locale]/docs/import-preview/[draftId]/confirm/route.ts`
- **实现逻辑与代码审查**：
  1. 在 Prisma 数据库模型中新增 `DocsImportConfirmation` 持久化回执表，记录 `draftId`、`documentId`、`redirectPath` 及 `committedAt`。
  2. 在 `confirm.ts` 中通过 Prisma 原生 `$transaction` 保证强原子性，事务超时设定为 30,000ms：
     - 首先执行 PostgreSQL 事务级咨询排他锁：`SELECT pg_advisory_xact_lock(hashtext(${draftId}))`，彻底串行化针对同一草稿的并发确认请求。
     - 校验是否已存在确认回执：若存在则实现幂等返回，防止重复写入。
     - 在同一事务内完整提交文档正文（`bodyJson`）、多语言记录（`docs_document_locales`）、版本发布事件（`docs_publication_events`）及回执记录。
  3. 解耦文件清理操作：在 `confirm/route.ts` 中，本地草稿文件 `deleteDocsImportDraft(draftId)` 仅在数据库事务成功提交后才被触发。若文件删除时发生磁盘 I/O 异常，仅记录告警日志，绝不回滚已经生效的数据库发布成果，依然向客户端返回 HTTP 303 重定向与发布文档 ID。
- **验收状态**：**通过 (Pass)**
- **验证证据与测试覆盖**：
  - 真实 PostgreSQL 事务演练日志 `output/production-readiness-2026-10-13/linux-transactions.log` 证实：
    `{"event":"real_postgres_transactions_passed","rollback":true,"concurrentConfirmation":true,"applicationRoleRestricted":true}`。
  - 在写入中途注入数据库异常，确认正文与发布事件实现 100% 回滚，数据库无残留孤儿数据。
  - 并发压测表明：两个并发请求针对同一草稿发起提交，仅执行 1 次真实写操作，最终返回相同的 `documentId` 与回执。

---

### Task 07: 公开端死链清理与导航栏权限修正 (Public Dead Link & Navigation Cleanup)
- **目标变更文件**：
  - `apps/web/src/features/home/index.tsx`
  - `apps/web/src/components/layouts/site-navigation.ts`
  - `apps/web/src/app/[locale]/about/page.tsx`
  - `apps/web/src/app/[locale]/create/page.tsx`
  - `apps/web/src/app/[locale]/resources/page.tsx`
- **实现逻辑与代码审查**：
  1. 在 `apps/web/src/features/home/index.tsx` 中，彻底清理了首页文章流中指向 `/test` 的 4 条死链，统一重定向至合法且已发布的文档中心路径 `href: '/docs'`（结合 `withLocalePath` 渲染为 `/${locale}/docs`）。
  2. 审查全站导航逻辑：`apps/web/src/app/[locale]/about/page.tsx` 被 `requireOwner()` 守卫为仅限管理员访问的私密页面。为避免普通访客点击触发 404/not-found 错误，在 `site-navigation.ts` 的公共导航中移除了关于（`about`）项。
  3. 对尚未实现或仍在规划中的路由 `/create` 与 `/resources`，直接调用 Next.js 原生 `notFound()`，从源头杜绝未授权访问或半成品组件暴露。
- **验收状态**：**通过 (Pass)**
- **验证证据与测试覆盖**：
  - 浏览器端走查日志 `output/production-readiness-2026-10-13/ops-complete/browser-seek-final.log` 证实访客状态下首页与导航链接点击全部正常，无任何 404 或死链跳转。
  - Web 测试套件 `pnpm --filter web test` 36 项测试全部通过。

---

### Task 08: Linux 运行环境契约与非 Root 容器隔离 (Linux Runtime Contract & Non-Root Build)
- **目标变更文件**：
  - `package.json`（声明 `engines`）
  - `.npmrc`（开启 `engine-strict=true`）
  - `.node-version`（锁定 `24.21.0`）
  - `Dockerfile`（多阶段构建与用户切换）
  - `scripts/production-start.mjs`（启动期环境合同断言）
  - `deployment/compose.production.yml`（容器运行时只读加固）
- **实现逻辑与代码审查**：
  1. 固化执行环境版本：声明 `node: ">=24.15.0 <25"` 与 `pnpm: "10.30.3"`，在 `.npmrc` 开启严格检查，消除低版本 Node.js 缺失 `node:sqlite` 的启动隐患。
  2. Dockerfile 运行时加固：
     - 基于官方 `node:24.21.0-bookworm-slim` 镜像构建；
     - 切换至非特权账号 `USER node`（UID 1000 / GID 1000）；
     - 入口点绑定 `node scripts/production-start.mjs`。
  3. `scripts/production-start.mjs` 启动门禁校验：在监听端口前强制核验 Node 主次版本、`NODE_ENV === 'production'`、`OWNER_ACCESS_SECRET` 长度 $\ge 32$ 且非占位符、`DATABASE_URL` 非默认 postgres 弱口令且连接密码 $\ge 32$ 位，并以 `0o700` 权限初始化所需的数据持久化目录。
  4. Docker Compose 生产加固：开启根文件系统只读 `read_only: true`，剥离全部 Linux Capabilities（`cap_drop: [ALL]`），开启 `no-new-privileges: true`，对 Next.js 运行所需的高频写入目录挂载内存临时卷 `tmpfs`（`/tmp` 及 `.next/cache`）。
- **验收状态**：**通过 (Pass)**
- **验证证据与测试覆盖**：
  - 容器构建日志 `linux-build-runtime-alias-final.log` 完整记录全门禁测试、类型检查及多阶段生成全过程。
  - 容器进程检查确认应用常驻进程运行于 UID 1000（非 root），在只读根文件系统下 Next.js 正常响应路由请求。

---

### Task 09: PostgreSQL 最小权限与内网隔离 (PostgreSQL Least-Privilege & Network Isolation)
- **目标变更文件**：
  - `deployment/compose.production.yml`
  - `deployment/postgres-init.sh`
- **实现逻辑与代码审查**：
  1. 网络层完全隔离：在生产 Compose 中，`postgres` 数据库服务完全移除宿主机端口映射（省略 `ports:` 指令），仅允许容器内部桥接网络互通，公网无法直接探测或爆破 5432 端口。
  2. 职责分离与最小权限控制：
     - DDL 迁移用户：默认容器用户 `incept_migrator` 作为数据库所有者，仅在 `migrate` 临时服务执行 `pnpm db:deploy` 时连入；
     - DML 业务应用用户：在 `postgres-init.sh` 中创建受限账号 `incept_app`，剥离 Public 架构创建权限（`REVOKE CREATE ON SCHEMA public FROM PUBLIC`），仅赋予现有表及未来生成表的 `SELECT, INSERT, UPDATE, DELETE` 以及序列使用权限；
     - 数据库超时限制：通过 `ALTER ROLE incept_app SET statement_timeout = '15s'` 规避慢查询拖垮连接池。
- **验收状态**：**通过 (Pass)**
- **验证证据与测试覆盖**：
  - 数据库操作日志 `output/production-readiness-2026-10-13/linux-transactions.log` 实测证明：以 `incept_app` 身份尝试执行 `CREATE TABLE readiness_should_not_exist (id integer)` 被 PostgreSQL 原生阻断并抛错 `ERROR: permission denied for schema public (SQLSTATE 42501)`。

---

### Task 10: 共享持久化存储与音频播放器 Range 206 拖拽跳转 (Shared Storage & Audio Seek)
- **目标变更文件**：
  - `apps/web/src/server/media/file-response.ts`
  - `apps/web/src/server/media/file-response.test.ts`
  - `packages/music/src/adapters/audio-inspection.ts`
  - `packages/music/src/react/music-player/components/player-expanded.tsx`
  - `packages/music/src/react/music-player/components/music-player-floating.tsx`
  - `packages/music/src/react/music-player/components/__tests__/player-seek.test.tsx`
- **实现逻辑与代码审查**：
  1. 在 `file-response.ts` 中实现高保真 HTTP 206 Partial Content 流式传输：
     - 严格解析客户端 `Range: bytes=start-end`、`bytes=start-`、`bytes=-suffix`；
     - 支持 `Accept-Ranges: bytes` 与 `Content-Range: bytes start-end/size` 响应头；
     - 越界或非法 Range 请求统一返回 **HTTP 416 Range Not Satisfiable**；
     - 采用 `createReadStream(file, { start, end })` 转 Web Stream 传输，杜绝大音频文件整包读入内存引起的 OOM。
  2. 修复发布过程中的文件句柄残留：在 `audio-inspection.ts` 中对元数据解析流增加 `finally` 兜底显式 `stream.destroy()` 并等待关闭，消除 Linux/Windows 下文件被占用导致的发布重命名失败。
  3. 补齐播放器交互组件：在 `player-expanded.tsx` 中新增原生可访问性 `<input type="range">` 进度滑杆，步长 0.1s，与播放核心状态机 `seekRequested` 意图严格绑定，音频未就绪时自动禁用。
- **验收状态**：**通过 (Pass)**
- **验证证据与测试覆盖**：
  - 测试套件 `file-response.test.ts`（2 项通过）与 `player-seek.test.tsx`（1 项通过）全部通过。
  - 运行日志 `output/production-readiness-2026-10-13/ops-complete/browser-seek-final.log` 记录实测拖拽进度数据：`audioTime: 9.2, duration: 15, rangeValue: "9.2"`，成功从第 9.2 秒继续播放。

---

### Task 11: Nginx 生产反向代理、HTTPS 与 ACME 部署 (Nginx Reverse Proxy, HTTPS & ACME)
- **目标变更文件**：
  - `deployment/nginx.conf.template`
  - `deployment/certificate-deploy.sh`
- **实现逻辑与代码审查**：
  1. 80 端口无条件跳转与 ACME 挑战放行：配置 `location /.well-known/acme-challenge/ { root /var/www/acme; }`，其余流量通过 HTTP 308 强制跳转 HTTPS。未匹配默认域名直接以 444 关闭连接。
  2. 443 端口安全加固：强制启用 TLSv1.2 与 TLSv1.3，开启 HSTS、`nosniff`、`DENY` 等防护标头；为音乐上传接口 `/api/internal/music/tracks` 放宽至 128MB，普通接口限制 1MB；针对登录及敏感接口配置限流区（`rate=5r/m` 及 `rate=2r/s`）。
  3. 自动化证书部署与安全回滚机制：编写 `certificate-deploy.sh`，在替换存活证书前强制验证证书有效期（`-checkend 86400`）、域名匹配（`-checkhost`）及私钥公钥哈希一致性；将旧证书备份至独立私有目录，在 `nginx -t` 或 `nginx -s reload` 失败时自动秒级回滚。
- **验收状态**：**待外部验证 (External Pending)**
  - *本地代码与沙箱演练判定*：**通过 (Pass)**。本地 Pebble ACME 自动化签发、续期及坏密钥回滚测试完全闭环。
  - *生产放行门禁判定*：**待外部验证 (External Pending)**。尚未在拥有真实公网 DNS 解析的域名和生产 Let's Encrypt CA 下签发，待云主机就绪。
- **验证证据与测试覆盖**：
  - 演练日志 `certificate-rollback-proof.log` 确认：`{"event":"certificate_renewal_and_rollback_passed","badKeyRejected":true,"failedValidationRestored":true,"newCertificateDeployed":true}`。
  - 反代日志 `acme-renew.log` 记录真实 TLS 序列号自 Pebble 签发成功轮转。

---

### Task 12: systemd 进程守护、轻量探活与告警去重 (systemd Supervision, Probes & Alerting)
- **目标变更文件**：
  - `apps/web/src/app/api/health/live/route.ts`
  - `apps/web/src/app/api/health/ready/route.ts`
  - `apps/web/src/server/health/check.ts`
  - `scripts/production-monitor.mjs`
  - `scripts/production-alert.mjs`
  - `scripts/production-alert.test.mjs`
  - `deployment/incept.service`、`deployment/incept-monitor.service`、`deployment/incept-monitor.timer`
  - `deployment/journald-incept.conf`
- **实现逻辑与代码审查**：
  1. 轻量化双探活接口：
     - `/api/health/live`：纯内存存活探测，零 I/O、零数据库调用，直接返回 `{ status: 'live' }`，防止因数据库瞬时波动引发容器级连雪崩重启；
     - `/api/health/ready`：就绪性探测，执行 `SELECT 1` 并设置 2,000ms 超时熔断，异常或超时返回 HTTP 503 `{ status: 'unavailable' }`。
  2. 运维监测与脱敏告警：`production-monitor.mjs` 定时探测健康检查、磁盘剩余空间（$\ge 15\%$）以及备份新鲜度（$< 24$h）；`production-alert.mjs` 发送 HTTPS Webhook，自带基于本地状态文件的原子去重机制，故障期间保留稳定 `eventId`，避免重复轰炸，恢复后自动派发恢复通报。
  3. 进程守护与日志上限：编写生产级 systemd 单元模板，配置日志保留配额 `SystemMaxUse=256M` 与 `MaxRetentionSec=14day`。
- **验收状态**：**待外部验证 (External Pending)**
  - *本地代码与沙箱演练判定*：**通过 (Pass)**。测试套件 `production-alert.test.mjs` 验证通过；WSL 瞬态 systemd 单元拉起与 SIGKILL 恢复实测耗时约 2.59s。
  - *生产放行门禁判定*：**待外部验证 (External Pending)**。尚未在生产宿主机作为系统守护长期运行，尚未对接真实外部通知通道。
- **验证证据与测试覆盖**：
  - 测试命令 `corepack pnpm run test:ops` 退出码 0，两项原生自动化测试通过。
  - 重启证据 `output/production-readiness-2026-10-13/linux-restart.log`：向应用发送 SIGKILL 后，容器与守护进程于 2.59 秒内完成自我恢复并通过就绪探测。

---

### Task 13: 加密离机备份、灾备恢复与生产清理强阻断 (Encrypted Off-site Backup & Cleanup Guard)
- **目标变更文件**：
  - `packages/db/src/docs/cleanup.ts`
  - `scripts/docs-cleanup-test-data.mjs`
  - `scripts/production-backup.mjs`
  - `scripts/production-offsite.mjs`
  - `scripts/production-offsite.test.mjs`
  - `deployment/backup.sh`、`deployment/offsite.sh`
- **实现逻辑与代码审查**：
  1. 灾难级生产环境硬防线：在 `packages/db/src/docs/cleanup.ts` 开头写入致命阻断门禁：
     ```typescript
     export async function cleanupDocsTestData() {
       if (process.env.NODE_ENV === 'production') {
         throw new Error('Test-data cleanup is disabled in production.');
       }
     ```
     在生产环境调用清理测试数据脚本会直接同步抛出致命异常并以退出码 1 终止，杜绝线上数据被误删。
  2. 静止期一致性备份机制：`production-backup.mjs` 备份前强制检查并要求停止应用写入容器（`docker ps app` 为空），通过流式管道执行二进制 `pg_dump -Fc`，将媒体目录打包为 `data.tar.gz`，计算 SHA256 摘要并写入 `manifest.json`。恢复模式严禁向非空数据库写入，强制检查目标目录为空并验证哈希匹配。
  3. Restic 加密异地留存策略：`production-offsite.mjs` 要求密码文件非软链接且权限为 `0600`，拒绝对接非加密明文 HTTP 端点；上传后执行 `restic check --read-data` 校验快照完整性，并执行保留策略 `--keep-within 14d --keep-last 2`。
- **验收状态**：**待外部验证 (External Pending)**
  - *本地代码与沙箱演练判定*：**通过 (Pass)**。本地备份打包、哈希校验、空库恢复（实测 2.94s）及版本回滚演练完全通过。
  - *生产放行门禁判定*：**待外部验证 (External Pending)**。尚未接入物理独立的云端对象存储/异地 SFTP 节点，海量生产数据下的真实 RTO/RPO 待生产实测。
- **验证证据与测试覆盖**：
  - 演练日志 `linux-cleanup-guard.log` 证实生产模式下清理脚本被瞬间阻断并安全退出。
  - 演练日志 `linux-restore.log` 与 `offsite-restore-hashes.log` 证实恢复后数据库与文件哈希 100% 吻合，内容全部可读。

---

### Task 14: 三角色全流程 E2E 业务走查 (Three-Role E2E Business Walkthrough)
- **目标变更文件**：
  - `scripts/production-integration.ts`
  - `packages/music/src/react/music-player/components/player-expanded.tsx`
  - 截图产物目录：`output/playwright/`
- **实现逻辑与代码审查**：
  1. 三角色全链路自动化走查：
     - **Guest（访客）**：浏览首页、中英双语 Docs、代码高亮渲染、Music Catalog 列表、音频试听与 Range 206 拖拽播放、Roadmap 公开看板阅读；
     - **Pro（付费会员）**：凭证兑换获取会话 Cookie，成功解密并阅读 Pro 专属文章及关联配图，尝试越权访问 Private 资源时正确拦截；
     - **Owner（管理员）**：通过 32 字节高强度密钥登录，进入管理后台进行文档导入草稿确认、实时草稿预览、Roadmap 创建与更新、上传真实 15 秒音频并触发自动去重。
  2. 移动端自适应布局审查：使用 Playwright 针对 390px 移动视口与 1440px 桌面视口进行全面比对，音频播放器控制条、文章排版、代码块均无横向溢出。
- **验收状态**：**待外部验证 (External Pending)**
  - *本地代码与沙箱演练判定*：**通过 (Pass)**。本地无头浏览器及临时端点走查 180 个请求 0 失败，各项业务行为符合预期。
  - *生产放行门禁判定*：**待外部验证 (External Pending)**。尚未在真实手机移动终端（iOS Safari、Android Chrome）及 4G/5G 真实公网环境下进行音视频加载体验走查。
- **验证证据与测试覆盖**：
  - 自动化脚本 `scripts/production-integration.ts` 运行通过，生成了完整的双语与移动端验证截图（如 `output/playwright/runtime-final-zh-code.png`、`restored-player-mobile.png` 等）。
  - 控制台日志 `runtime-browser-console.log` 记录 0 错误、0 警告。

---

### Task 15: 文件上传写入原子性加固与句柄释放 (Atomic Upload Writes & Handle Release)
- **目标变更文件**：
  - `apps/web/src/features/docs/importer/media/local-store.ts`
  - `apps/web/src/features/docs/importer/draft-store.ts`
  - `packages/music/src/adapters/media-store.ts`
  - `packages/music/src/adapters/audio-inspection.ts`
- **实现逻辑与代码审查**：
  1. 原子写入规避脏文件：所有文档图片、草稿 JSON、音乐文件的落盘逻辑统一重构为 `${targetPath}.${crypto.randomUUID()}.tmp` 模式，在同一文件系统分区下写入完成后，通过原子操作 `fs.rename` 替换为目标文件。在 `finally` 块中增加对未完成临时文件的清理保护。
  2. 音乐上传并发去重与排队重试：在 `publishMusicTempFile` 中捕获重命名并发碰撞（`EEXIST`），比对目标文件 SHA256 哈希，若内容相同则复用目标文件并删除临时文件，支持最多 3 次自愈重试。
  3. 流句柄彻底释放：在 `audio-inspection.ts` 中解析音频时长与元数据时，通过 `finished(stream, { cleanup: true })` 与 `stream.destroy()` 确保在 `finally` 中同步关闭文件句柄，杜绝文件被锁定导致后续原子重命名报 `EBUSY` / `EPERM`。
- **验收状态**：**通过 (Pass)**
- **验证证据与测试覆盖**：
  - 测试命令 `pnpm --filter @incept/music exec vitest run src/__tests__/audio-inspection.test.ts src/__tests__/media-store-upload.test.ts` 全部通过（19 项测试）。
  - 执行 `pnpm docs:check-media` 顺利通过，未出现文件写损坏或进程句柄泄露。

---

### Task 16: GitHub 外部活动 API 调用超时保护与分页上限 (GitHub API Timeout & Pagination Budget)
- **目标变更文件**：
  - `apps/web/src/server/activity/github-api.ts`
  - `apps/web/src/server/activity/github.ts`
- **实现逻辑与代码审查**：
  1. 严格请求超时控制：对 GitHub GraphQL API 与 REST API 的所有调用（获取用户活动、仓库状态、提交记录）统一注入 `signal: AbortSignal.timeout(5_000)`，超时直接中断，杜绝外网网络抖动拖垮应用工作线程。
  2. 提交历史有界分页：在遍历提交记录的循环中设置硬性门禁 `if (page > 100) throw new Error('GitHub activity exceeded the pagination budget.');`，防止因异常仓库产生海量分页死循环打满 API Rate Limit 配额。
  3. 优雅降级返回：在聚合层 `github.ts` 中拦截一切网络错误与超时异常，统一捕获并返回静态降级对象 `{ status: 'unavailable' }`，前端页面呈现友好的离线提示文本，整站页面加载不受阻断。
- **验收状态**：**通过 (Pass)**
- **验证证据与测试覆盖**：
  - 执行检查脚本 `node --filter web exec tsx ../../scripts/github-activity-check.mjs` 验证通过。
  - 对抗性模拟证明：在网络完全中断或模拟超时场景下，About 页面渲染正常，活动流区域安全展示离线降级状态。

---

### Task 17: 邀请凭证日志脱敏与 Referrer-Policy 策略 (Invite URL Redaction & Referrer-Policy)
- **目标变更文件**：
  - `deployment/nginx.conf.template`
  - `apps/web/src/app/[locale]/settings/access/[credential]/route.ts`
- **实现逻辑与代码审查**：
  1. Nginx 访问与错误日志全路径脱敏：在配置模板中配置正则映射 `map $uri $safe_uri`，匹配所有包含或不包含语言前缀的邀请路径（`~^/(?:en/|zh/)?settings/access/`），将其在日志变量中一律替换为 `/invitation/redacted`，并在自定义日志格式中采用 `$safe_uri`，彻底防止凭据打印在服务器磁盘日志。配置 `error_log crit` 规避详细错误日志泄漏。
  2. 差异化 Referrer-Policy 防泄露策略：
     - 普通业务路由配置 `Referrer-Policy: same-origin`，确保浏览器发起的原生表单 POST 请求能正常序列化同源 `Origin` 头，防止 CSRF 误拦截；
     - 邀请兑换路径配置 `Referrer-Policy: no-referrer`，无论是 404 错误页还是 303 重定向跳转，均强制浏览器不向后续请求携带来源 Referer，杜绝邀请码通过 HTTP 头外泄。
  3. 兑换即作废单次使用纪律：应用层使用哈希值（`hashAccessCredential`）检索凭据，兑换成功后数据库即刻标记作废，即使 URL 存在于本地浏览器历史记录中也无法二次使用。
- **验收状态**：**通过 (Pass)**
- **验证证据与测试覆盖**：
  - 代理测试日志 `output/production-readiness-2026-10-13/ops-complete/proxy-redaction-proof.log` 证实带有测试标记的邀请 URL 在 Nginx 访问日志中被完全重写为 `/invitation/redacted`。
  - 演练日志 `final-proxy-proof.log` 确认普通页面返回 `Referrer-Policy: same-origin`，邀请路由返回 `Referrer-Policy: no-referrer`。

---

### Task 18: 未实现路由与占位页面隐藏 (Unimplemented Route Concealment)
- **目标变更文件**：
  - `apps/web/src/app/[locale]/resources/page.tsx`
  - `apps/web/src/app/[locale]/create/page.tsx`
  - `apps/web/src/components/layouts/site-navigation.ts`
  - `apps/web/src/features/home/index.tsx`
- **实现逻辑与代码审查**：
  1. 在 `resources/page.tsx` 与 `create/page.tsx` 中直接执行 `notFound()`，从根源消除空组件返回 200 空白页给用户带来的半成品困惑。
  2. 在公共顶栏导航中注释并屏蔽了未开放的入口；在首页卡片中将未就绪测试链接重定向至正规文档。
- **验收状态**：**通过 (Pass)**
- **验证证据与测试覆盖**：
  - 访问 `/resources` 与 `/create` 实测均返回干净的 Next.js 标准 404 错误页面，全站公共可见链接全部为有效功能路由。

---

### 逐项验收状态汇总表 (Tasks 01–18 Summary)

| Task ID | 任务名称与核心目标 | 代码与本地实现 | 公网放行判定 | 关键验证证据 |
| :---: | :--- | :---: | :---: | :--- |
| **Task 01** | 核心依赖加固与高危漏洞消除 | **通过 (Pass)** | **通过** | `pnpm audit --prod` 0 漏洞，Docker 187 依赖包 |
| **Task 02** | Dashboard 用量数据脱敏与采集冷却 | **通过 (Pass)** | **通过** | 白名单投影，匿名 403，30s 冷却 HTTP 429 |
| **Task 03** | 文档媒体鉴权 Route Handler 与防枚举 | **通过 (Pass)** | **通过** | beforeFiles 重写，PostgreSQL jsonb 鉴权，404 掩码 |
| **Task 04** | ESLint 9 Flat Config 与 Hydration 修复 | **通过 (Pass)** | **通过** | Flat Config 0 错误，useSyncExternalStore 修复 |
| **Task 05** | Roadmap 管理面板 GET 来源放行与 CSRF | **通过 (Pass)** | **通过** | GET 免 Origin 保留 Session，写操作严格同源 |
| **Task 06** | 文档发布事务原子性与持久回执 | **通过 (Pass)** | **通过** | Prisma $transaction，pg_advisory_xact_lock，回执持久化 |
| **Task 07** | 公开端死链清理与导航栏权限修正 | **通过 (Pass)** | **通过** | 移除 `/test` 死链与未授权 `/about` 入口 |
| **Task 08** | Linux 运行环境契约与非 Root 容器 | **通过 (Pass)** | **通过** | Node >=24.15/pnpm 10.30.3，非 root UID 1000 |
| **Task 09** | PostgreSQL 最小权限与内网隔离 | **通过 (Pass)** | **通过** | 5432 无外部端口，incept_app 禁止 DDL，15s 超时 |
| **Task 10** | 共享持久化存储与播放器 Range 206 | **通过 (Pass)** | **通过** | HTTP Range 206 流式传输，9.2s 拖拽跳转实测 |
| **Task 11** | Nginx 生产反代、HTTPS 与 ACME 部署 | **通过 (Pass)** | **待外部验证** | 80->443，TLS 模板，证书自动回滚；待公网 CA 签发 |
| **Task 12** | systemd 进程守护、探活与告警去重 | **通过 (Pass)** | **待外部验证** | /live 零 IO，/ready 探活，SIGKILL 2.59s 恢复；待宿主机运行 |
| **Task 13** | 加密离机备份、灾备恢复与生产清理强阻断 | **通过 (Pass)** | **待外部验证** | production 清理致命阻断，空库恢复 2.94s；待异地存储 |
| **Task 14** | 三角色全流程 E2E 业务走查 | **通过 (Pass)** | **待外部验证** | Guest/Pro/Owner 双语走查，390px 布局正常；待 4G/5G 真机 |
| **Task 15** | 文件上传写入原子性加固与句柄释放 | **通过 (Pass)** | **通过** | `.tmp.<uuid>` 写入，哈希复用，流句柄 finally 释放 |
| **Task 16** | GitHub API 超时保护与分页上限 | **通过 (Pass)** | **通过** | AbortSignal 5s 超时，100 页上限，离线降级 |
| **Task 17** | 邀请凭据日志脱敏与 Referrer-Policy | **通过 (Pass)** | **通过** | Nginx `$safe_uri` 脱敏，`no-referrer` 响应头 |
| **Task 18** | 未实现路由与占位页面隐藏 (notFound) | **通过 (Pass)** | **通过** | `/resources` 与 `/create` 显式 notFound() |

---

## 3. 关键安全边界独立评估 (Critical Security Boundary Independent Evaluation)

本节针对生产环境所必须具备的 8 大关键安全防护边界展开深度法医级分析与独立技术评估。

### 3.1 依赖漏洞清零与运行镜像极简化 (Dependency Hardening & Minimal Image)
- **威胁模型**：攻击者利用过时核心依赖（如 Next.js 早期版本或图像/多媒体解析器）存在的公开 CVE 发起拒绝服务（DoS）或远程代码执行（RCE），或通过泄露的开发调试依赖实现沙箱逃逸。
- **实施机制**：
  1. 根目录 `package.json` 中的 `pnpm.overrides` 对所有已知漏洞的传递依赖实施精准锁定；
  2. 构建阶段 `Dockerfile` 采用 `production-dependencies` 多阶段裁剪，彻底隔离开发构建期工具链（Vitest、ESLint、jsdom、braces 等完全不复制入生产环境）；
  3. 保留已构建好的生产文件：Turbopack 生成的 Shiki 语法高亮哈希别名、Dashboard Worker 脚本以及 Prisma 原生引擎二进制文件，避免在只读生产容器内动态下载。
- **独立评估结论**：**极高健壮性**。实测生产漏洞数为 0，运行时依赖仅保留 187 个受控生产目录，极大缩减了运行时的攻击暴露面。

### 3.2 Dashboard 用量数据隐私白名单与采集冷却 (Usage Privacy & Cooldown Boundary)
- **威胁模型**：未授权访客通过嗅探 `/api/dashboard/usage` 获取开发者的私密工作区绝对路径、敏感业务会话标题或使用的模型费用明细；外部恶意攻击者频繁携带 `refresh=1` 发起接口重放，打满后台 Worker 算力与 CPU。
- **实施机制**：
  1. 权限闸门：仅在 `viewer.role === 'owner'` 时传递管理员会话标识；
  2. 匿名防御：匿名请求带有 `refresh=1` 直接返回 HTTP 403；普通匿名请求仅读取本地已有快照，绝对不拉起采集 Worker；
  3. 数据投影：`publicDashboardSummary` 采用严格白名单结构，内部文件路径、会话名称、模型细分、收集错误等字段强制置为空；
  4. 采集冷却：Owner 连续强制刷新必须间隔 $\ge 30$ 秒，违规请求直接返回 HTTP 429 及 `Retry-After: 30`。
- **独立评估结论**：**严密**。经数据投毒与字段注入测试，所有敏感元数据在序列化之前均被彻底过滤，匿名算力放大攻击被完全切断。

### 3.3 文档媒体鉴权 Route Handler、防枚举 404 与 Next.js 重写 (Media Access Boundary)
- **威胁模型**：攻击者已知或猜出付费 Pro / 私密文档中嵌入的配图哈希文件名，直接通过 Web 服务器公开静态路径拉取私密内容，或通过响应状态码差异（401/403 vs 404）枚举猜测系统内存在的文档资源。
- **实施机制**：
  1. Next.js 静态重写门禁：`next.config.ts` 中的 `beforeFiles` 规则将所有 `/_docs-media/:fileName` 请求在 Next.js 文件系统检查之前拦截并转发至鉴权路由 `/api/docs/media/[fileName]`；
  2. PostgreSQL 数据层鉴权：执行 `jsonb_path_exists` 确认该媒体文件被已发布的文档实际引用，且请求者的当前身份角色满足文章与所属合集的访问要求；
  3. 统一 404 响应：任何未授权访问、未发布资源或文件不存在统一返回 **HTTP 404 Not Found** 并设置 `Cache-Control: no-store`，消除预言机差异（Oracle Differential）。
- **独立评估结论**：**安全完备**。消除了静态文件直接下载后门，并具备抵抗文件名枚举探测的能力。

### 3.4 文档发布事务原子性与持久回执 (Document Publication Transactionality)
- **威胁模型**：管理员在确认发布导入的大型文档或合集时，遭遇网络中断、数据库连接抖动或并发重复点击，导致正文已更新但发布事件未记录（数据不一致），或者同一文档被多次并发写入创建多条重复记录。
- **实施机制**：
  1. Prisma `$transaction` 强原子性保障：文档正文、多语言状态、版本事件和确认回执必须在同一个数据库事务中提交，任何一步抛错立即触发全量 `ROLLBACK`；
  2. 事务级咨询排他锁：事务开启后首先执行 `pg_advisory_xact_lock(hashtext(${draftId}))`，同一草稿的并发操作严格排队；
  3. 幂等回执：先查 `DocsImportConfirmation`，若前序请求已提交成功则直接复用回执返回 HTTP 303；
  4. 后置文件清理：本地草稿文件删除操作被后置在事务提交之后，若删除草稿文件因磁盘异常失败，仅记录告警日志，绝不改变已经提交的数据库事实。
- **独立评估结论**：**极高可靠性**。具备完整的并发安全与异常自愈设计，彻底杜绝孤儿数据与状态脱节。

### 3.5 Roadmap 管理面板同源策略与 Origin 检查 (Roadmap Origin Boundary)
- **威胁模型**：攻击者通过第三方恶意网站诱导已登录的 Owner 访问，利用浏览器自动携带 Cookie 的特性发起跨站请求伪造（CSRF），篡改或删除产品路线图条目；或者防御策略过于严苛误拦截普通用户的正常刷新。
- **实施机制**：
  1. 读写分离防护策略：在 `assembly.ts` 中明确豁免 `GET` 与 `HEAD` 请求对 `Origin` 头的依赖，确保管理员在地址栏回车、F5 刷新时正常加载，同时严密保留 `isRoadmapOwner()` 身份会话校验；
  2. 状态变更强校验：对于 `POST`、`PATCH`、`DELETE` 等写操作，强制核验 `hasSameOrigin(request)`，跨域请求一律被拦截；
  3. 隐蔽性防御：被拦截的请求统一由 `guardOwner` 响应 HTTP 404，不向外界暴露管理路由的存在。
- **独立评估结论**：**设计精巧且符合标准**。既解决了浏览器同源 GET 请求不附带 Origin 的交互痛点，又对写操作筑牢了严格的 CSRF 防线。

### 3.6 PostgreSQL 最小权限隔离与私网穿透防御 (Database Least Privilege Boundary)
- **威胁模型**：攻击者利用 Web 应用可能存在的未知 SQL 注入漏洞执行 DDL 破坏性语句（如 `DROP TABLE`、`ALTER TABLE`），或通过公网扫描直接攻击 5432 端口并爆破数据库弱口令。
- **实施机制**：
  1. 网络零暴露：数据库容器在 Docker Compose 中不声明宿主机端口映射，仅对容器内私有 bridge 网络开放；
  2. 角色分立机制：生产日常应用仅连接 `incept_app`，剥离 Public 架构创建权，仅授予指定表的 DML 操作（增删改查），严禁日常连接使用超级用户 `postgres`；
  3. 运行时超时约束：通过 `statement_timeout = '15s'` 强制终止由于异常逻辑引起的长时间慢查询。
- **独立评估结论**：**纵深防御完备**。即使应用层存在单点 SQL 注入缺陷，攻击者也绝对无法执行结构变更（DDL）或越权接管数据库底层。

### 3.7 灾难防御与故障熔断机制 (Disaster Resilience & Cleanup Guard)
- **威胁模型**：线上运维误操作执行了测试数据清理脚本导致全站文档数据清空；或在热运行状态下执行冷备份导致数据库与静态文件处于不一致的中间状态；或外部第三方接口（GitHub）宕机引起本地请求队列积压。
- **实施机制**：
  1. 生产清理强阻断：`cleanupDocsTestData()` 内部检测到 `process.env.NODE_ENV === 'production'` 立即同步抛出致命错误，脚本退出码为 1；
  2. 静止备份门禁：备份脚本执行前主动通过 Docker CLI 探测，若应用容器处于运行状态则直接拒绝执行，确保备份时所有应用事务与文件 I/O 处于静止一致状态；
  3. 外部 API 熔断降级：GitHub 接口调用统一设置 5 秒硬超时及 100 页分页上限，失败时平滑降级展示占位状态。
- **独立评估结论**：**健壮**。消除了毁灭性运维误操作的隐患，保障了灾备数据的一致性与外部依赖不可用时的服务可用性。

### 3.8 邀请凭证日志脱敏与 Referrer-Policy 策略 (Invite Token Privacy Boundary)
- **威胁模型**：系统生成的单次邀请凭证通过 URL 传递时，被代理服务器（Nginx）以明文记录在访问日志中，或通过 HTTP Referer 标头泄漏给外链站点，导致未授权人员通过日志或抓包冒领身份。
- **实施机制**：
  1. Nginx 代理层脱敏：通过 Nginx 内置变量映射将所有 `/settings/access/*` 请求路径在生成日志时强制重写为 `/invitation/redacted`，请求查询参数与 Cookie 均不记入日志；
  2. 标头精准控制：邀请路径单独响应 `Referrer-Policy: no-referrer`，普通页面响应 `same-origin`，上游重复标头由反代统一剥离；
  3. 单次作废：应用层使用哈希检索，凭据兑换完成后立即在数据库端作废销毁。
- **独立评估结论**：**严密**。有效斩断了长期凭据在链路传输与持久化日志中的泄露途径。

---

## 4. 独立自动化验证与指标汇总 (Independent Automated Verification Summary)

### 4.1 全量测试套件执行明细 (461 / 461 Tests Passed)
在评估过程中，独立执行了全 Monorepo 工作区的自动化测试套件，涵盖单元测试、组件集成测试与运维可靠性测试。测试执行总表如下：

| 测试目标组件 | 测试执行工具 | 涵盖测试文件数 | 通过测试用例数 | 失败数 | 耗时 | 判定 |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `packages/roadmap` | Vitest v5.0.1 | 7 | 67 | 0 | 2.20s | **PASS** |
| `packages/dashboard` | Vitest v5.0.1 | 18 | 93 | 0 | 2.86s | **PASS** |
| `packages/music` | Vitest v5.0.1 | 24 | 190 | 0 | 4.50s | **PASS** |
| `packages/music-player-core` | Node 24 Native Test | N/A | 73 | 0 | 0.23s | **PASS** |
| `apps/web` | Vitest v5.0.1 | 8 | 36 | 0 | 2.11s | **PASS** |
| `scripts/` (生产运维告警与异地备份) | Node 24 Native Test | 2 | 2 | 0 | 0.18s | **PASS** |
| **全工程汇总** | **混合测试框架** | **59 个文件** | **461 项测试** | **0** | **~12s** | **100% PASS** |

- **全量递归运行验证**：执行 `corepack pnpm test`（对应 `pnpm -r --if-present test`）无任何子包报错，退出码严格为 0。

### 4.2 TypeScript 类型检查验证 (TypeScript Typecheck)
- **执行命令**：`corepack pnpm run typecheck`
- **检查范围**：
  - `apps/web`: `tsc --noEmit -p tsconfig.json`
  - `packages/music`: `tsconfig.src.json`、`tsconfig.node.json`、`tsconfig.json`
  - `packages/db`: `tsc --noEmit`
  - `packages/roadmap`: `tsconfig.src.json`、`tsconfig.node.json`、`tsconfig.json`
  - `packages/dashboard`: `tsconfig.src.json`、`tsconfig.node.json`、`tsconfig.json`
  - `scripts/`: `tsc --noEmit -p scripts/tsconfig.json`
- **执行结果**：全部子项目类型检查通过，**0 TypeScript 错误**，退出码 0。

### 4.3 ESLint v9 Flat Config 规范复核 (ESLint Check)
- **执行命令**：`corepack pnpm run lint`
- **执行结果**：
  - 错误数（Errors）：**0**
  - 警告数（Warnings）：**9**（均为已知局部变量未读取或 Next.js 建议采用 `<Image />` 组件的优化提示）
  - 退出码：**0**，严格符合工程质量门禁规范。

### 4.4 生产依赖深度安全审计 (Production Audit)
- **执行命令**：`corepack pnpm audit --prod --json`
- **执行结果**：
  ```json
  {
    "actions": [],
    "advisories": {},
    "muted": [],
    "metadata": {
      "vulnerabilities": {
        "info": 0,
        "low": 0,
        "moderate": 0,
        "high": 0,
        "critical": 0
      },
      "dependencies": 277,
      "devDependencies": 0,
      "optionalDependencies": 0,
      "totalDependencies": 277
    }
  }
  ```
  生产依赖图谱中 277 项依赖的已知漏洞数为 **0**。

---

## 5. 受控运维与工作区安全保障声明 (Controlled Operations & Workspace Safety Attestation)

在本次独立审计与验收合成过程中，严格遵照只读与非破坏性工作区规范（Controlled Operations），具体遵从情况声明如下：

### 5.1 零破坏性 Git 操作确认
- 在评估全程中，**未执行任何破坏或改变 Git 工作区历史的命令**；
- 严禁并实际避免了以下指令：`git checkout`, `git reset`, `git clean`, `git commit`, `git push`；
- 当前分支依旧停留在 `codex/production-readiness`，HEAD Commit 保持为 `b623e13eaa1b09d1d20fb30eef832db06f9f47f6`。

### 5.2 工作区源码与测试证据产物无损声明
- **工作区代码文件完整性**：
  经 `git status --porcelain -uall` 最终核验，当前工作区维持 **63 个已修改/已删除跟踪文件 + 56 个未跟踪文件（共 119 个条目，对应 118 个核心工作文件及 Next.js 运行期生成的跟踪辅助声明 `next-env.d.ts`）**，未发生任何非预期的文件覆盖或丢失。
- **历史测试证据产物完整性**：
  经核对，`output/production-readiness-2026-10-13/` 目录下的全部 **87 项** 自动化测试日志、容器压测数据、截图与回滚证明文件完全保留，无任何文件被清理或改动。

### 5.3 运行时进程与测试沙箱清理确认
- **宿主机进程状态**：审计过程中拉起的所有 Node.js 测试用例与临时脚本均已完全退出，宿主机上未遗留任何 dangling 的 Vitest 或 Node 测试进程。
- **Docker 容器状态**：经 `docker ps` 核查，宿主机仅保留用户原有的常驻守护容器（`snowluma` 与 `incept-postgres`），所有临时创建的隔离演练测试容器栈均已安全停止，未对宿主机现有业务产生任何干扰。

---

## 6. 公网放行门禁复核与外部前置条件清单 (Public Release Gate Review & External Prerequisites Checklist)

### 6.1 公网放行评审结论：正式上线必须保持 "NO-GO"
经过全面技术审查，本评估报告**正式确认并支持将当前的公网发布门禁设定为 “NO-GO”**。

**结论释义**：
“NO-GO” 判定绝非指代码层面存在遗留缺陷或工程整改未达标，而是表明**项目当前所处的物理运行阶段尚未完成向真实公网生产环境的跃迁**。任何未经真实云基础设施、公网域名、真实 CA 证书以及跨可用区备份验证的系统，在严谨的工程安全体系下均不得判定为公网 GO。

### 6.2 切换至 “GO” 状态的前置条件清单 (Checklist for Flipping to GO)
在未来具备真实云资源并准备将公网发布状态翻转为 “GO” 之前，运维团队必须严格依照以下清单完成实地部署与最终验收：

#### [ ] 1. 云主机基础设施与网络安全组 (Cloud VM & Security Group)
- [ ] 采购/准备标准的 64 位 Linux 云服务器（推荐 Debian 12 或 Ubuntu 24.04 LTS，规格不低于 2 vCPU / 4 GiB 内存）。
- [ ] 安装受支持的 Docker 27+ 与 Docker Compose v2 工具链。
- [ ] 配置云服务商网络安全组（Security Group）与主机防火墙（ufw / iptables）：
  - **仅开放** TCP 80 (HTTP) 与 TCP 443 (HTTPS) 入站；
  - 严格禁止向公网开放 5432 (PostgreSQL) 端口；
  - SSH 管理端口（22 或自定义高位端口）配置基于密钥登录并限制管理 IP 白名单。

#### [ ] 2. 公网域名解析与 DNS 生效 (Domain & DNS Propagation)
- [ ] 为应用分配正式的生产域名（如 `incept.yourdomain.com`）。
- [ ] 配置 DNS 解析 A / AAAA 记录精确指向云主机的公网静态 IP。
- [ ] 在全国不同地域验证 DNS 解析已生效无劫持（`dig +trace` 或 `nslookup` 返回正确 IP）。

#### [ ] 3. 生产真实 Let's Encrypt TLS 证书签发与监控 (Live Let's Encrypt TLS)
- [ ] 运行部署配置生成生产 `nginx.conf`（替换模板中的 `${INCEPT_DOMAIN}` 占位符）。
- [ ] 首次启动 Nginx 80 端口服务，通过 Certbot webroot 模式发起真实的 Let's Encrypt 证书签发挑战：
  `certbot certonly --webroot -w /var/www/acme -d <domain>`。
- [ ] 校验生成的证书链与私钥，运行 `certificate-deploy.sh` 部署并重载 Nginx。
- [ ] 在公网通过 Qualys SSL Labs 进行 SSL Server Test 评测，确认获得 **A 或 A+ 评级**。
- [ ] 检查并启用 Certbot / systemd 证书自动续期定时器（`certbot.timer`）。

#### [ ] 4. 独立异地/离机加密备份存储接入 (Secondary Off-site Encrypted Backup)
- [ ] 申请与云主机不在同一物理机房/不同故障域的独立存储（如 AWS S3、阿里云 OSS、或异地专属 SFTP 主机）。
- [ ] 初始化生产 Restic 仓库并配置强随机密码，密码文件存放在安全宿主机目录（`0600` 权限）。
- [ ] 写入生产 `deployment/.env.backup` 配置，配置定时备份 systemd 任务（每日 03:00 执行）。
- [ ] 执行一次手动端到端异地备份演练：确认 `latest-backup-manifest.json` 与 `latest-offsite-receipt.json` 成功生成并包含正确 SHA256 摘要。
- [ ] 在完全独立的空白沙箱机器上拉取备份包执行解密恢复演练，实测验证恢复时间（RTO $\le$ 2 小时）与恢复完整性。

#### [ ] 5. 宿主机 systemd 生产守护与告警通道激活 (Host systemd & Alert Webhook)
- [ ] 将 `deployment/incept.service` 部署至宿主机 `/etc/systemd/system/`，执行 `systemctl daemon-reload` 并 `systemctl enable incept.service` 激活开机自启。
- [ ] 部署 `incept-monitor.service` 与 `incept-monitor.timer`，实现每分钟自动健康探活。
- [ ] 配置生产告警接收 Webhook（如企业微信机器人、飞书机器人、Slack 或 OpsGenie），在 `.env.monitor` 中配置 `INCEPT_ALERT_WEBHOOK_URL`。
- [ ] 模拟一次异常（如临时切断数据库），确认告警机器人可在 1 分钟内收到脱敏告警，服务恢复后收到恢复通报，且无连续重复告警轰炸。
- [ ] 部署 `deployment/journald-incept.conf`，重启 `systemd-journald`，确保日志单服务体积上限被限制在 256MB 以内。

#### [ ] 6. 物理移动设备与运营商网络最终走查 (Physical Mobile & Cellular Walkthrough)
- [ ] 在至少一台真实物理 iPhone（iOS Safari）与一台物理 Android 手机（Android Chrome）上，断开 Wi-Fi 并连接真实 4G / 5G 移动蜂窝网络。
- [ ] 访问线上生产域名，验证 HTTPS 自动跳传、证书有效性。
- [ ] 完整走查：
  - 中英文文档切换与阅读；
  - 核心音频加载、播放与进度滑杆拖拽（验证 4G 蜂窝网络下 HTTP 206 流式加载是否流畅）；
  - 兑换码兑换 Pro 权限流程；
  - 管理员手机端登录与基本面板查看。
- [ ] 确认全站页面无任何移动端水平滚动溢出、无控制台报错、音画播放顺畅。

---

## 7. 评估结语 (Evaluation Summary)

综合上述评估：
分支 `codex/production-readiness` 上完成的 18 项整改工作表现出了极高的工程严谨性与架构安全水准。代码层面消除了全部阻断性缺陷，各项业务逻辑与安全边界均通过了真实且完备的自动化测试验证，未发现任何弄虚作假、虚假断言或空实现。

当前系统已完全具备进入真实云环境进行生产级部署的质量条件。建议团队保持当前的 **NO-GO** 状态，待上述第 6 节列出的云端外部前置条件全数完成配置并实测通过后，正式实施公网切流发布。
