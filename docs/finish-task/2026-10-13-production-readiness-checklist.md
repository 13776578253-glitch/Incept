# 项目生产环境上线准备逐项处理清单

- **关联报告**：[2026-10-13-production-readiness-audit.md](file:///d:/Desktop/code/code/Incept/docs/finish-task/2026-10-13-production-readiness-audit.md)
- **创建日期**：2026-10-13
- **目标周期**：3 天内达到 CONDITIONAL GO / GO 状态并完成安全上线
- **核心策略**：收缩首发范围（限制公开用量与私密媒体） + 最小闭环运维（单机 Nginx + PostgreSQL + systemd）

---

## 阶段规划概览

```mermaid
flowchart LR
    Day1["Day 1：代码安全加固与核心缺陷修复<br/>(依赖升级 / 接口收口 / 交互修复 / Lint)"]
    Day2["Day 2：生产基建搭建与发布流程打通<br/>(Linux 环境 / PostgreSQL / Nginx / 持久化)"]
    Day3["Day 3：全链路验收、灾备演练与正式切流<br/>(三端走查 / 备份恢复演练 / DNS 切流)"]

    Day1 --> Day2 --> Day3
```

---

## 阶段一：代码级关键安全与缺陷修复（Day 1）

> 必须在本地或临时分支完成编码、自动化测试并通过验证，消除所有阻断性安全红线。

### [ ] Task 01: [T01 / R01] 升级核心依赖并消除高危安全漏洞
- **风险等级**：`P0 致命`
- **涉及文件**：
  - [package.json](file:///d:/Desktop/code/code/Incept/package.json)
  - [apps/web/package.json](file:///d:/Desktop/code/code/Incept/apps/web/package.json)
  - [pnpm-lock.yaml](file:///d:/Desktop/code/code/Incept/pnpm-lock.yaml)
- **现状与问题**：
  - `Next.js 16.2.0`、`sharp 0.34.5`、`music-metadata 11.15.0` 命中已知 CVE 公告（包含 Server Function CPU DoS、AVIF 图片解码 RCE 等）。生产环境依赖扫描存在 46 条记录。
- **具体改造方案**：
  1. 将 `apps/web/package.json` 中的 `next` 依赖更新至官方安全修复版本（建议 `≥ 16.3.8`）。
  2. 核对并更新 `sharp` 锁版本至 `≥ 0.35.5`，`music-metadata` 至 `≥ 11.16.0`。
  3. 执行 `pnpm install` 重新生成 lockfile。避免做跨大版本的不兼容重构。
- **验收通过标准**：
  - 执行 `pnpm audit --prod` 确认上述高危公告已修复或阻断。
  - 执行 `pnpm run test` 与 `pnpm run build` 全部成功通过。

---

### [ ] Task 02: [T02 / R02] Dashboard 用量数据与强制采集权限收口
- **风险等级**：`P0 致命`
- **涉及文件**：
  - [apps/web/src/app/api/dashboard/usage/route.ts](file:///d:/Desktop/code/code/Incept/apps/web/src/app/api/dashboard/usage/route.ts)
  - [packages/dashboard/src/next/usage-route.ts](file:///d:/Desktop/code/code/Incept/packages/dashboard/src/next/usage-route.ts)
  - [packages/dashboard/src/adapters/local/aggregation/summarize.ts](file:///d:/Desktop/code/code/Incept/packages/dashboard/src/adapters/local/aggregation/summarize.ts)
- **现状与问题**：
  - `/api/dashboard/usage` 匿名即可读取，返回了开发者的会话标题、文件路径、设备和模型费用；且支持匿名传入 `forceRefresh` 强行触发后台 Worker 采集，易被外部滥用打满服务器 CPU。
- **具体改造方案**：
  1. 在 `/api/dashboard/usage` 中强制注入 Owner 身份校验（`authorizeOwner`）。未登录/访客调用直接返回 `401/403`。
  2. 禁用匿名的 `forceRefresh` 采集触发能力，仅允许已认证的 Owner 触发且增加调用冷却（Cooldown）。
  3. （可选）若未来需向访客展示用量，必须新增独立的 `usage-public` 脱敏路由，仅返回全局总计数字，剔除路径/标题等字段。
- **验收通过标准**：
  - 未登录时发起 `GET /api/dashboard/usage` 返回 401/403。
  - 未登录时发起 `GET /api/dashboard/usage?refresh=true` 无法触发 Worker 采集。

---

### [ ] Task 03: [T03 / R03] 文档媒体访问控制与首发范围策略
- **风险等级**：`P0 致命（条件项）`
- **涉及文件**：
  - [apps/web/src/features/docs/importer/media/local-store.ts](file:///d:/Desktop/code/code/Incept/apps/web/src/features/docs/importer/media/local-store.ts)
  - [apps/web/src/proxy.ts](file:///d:/Desktop/code/code/Incept/apps/web/src/proxy.ts)
- **现状与问题**：
  - 导入文章时，本地图片直接写入了公开目录 `public/_docs-media/`。即使文章本身设为 Pro 或私密，只要图片 URL 被猜出或转发，外部访客仍能免鉴权直接下载。
- **具体改造方案（二选一，推荐方案 A 以保障 3 天快速上线）**：
  - **方案 A（快速规避，强烈推荐）**：确立首发范围纪律——**首批上线内容仅包含 public 级别的文章与媒体**，不发布任何 Pro/private 级别文章及其关联图片；同时清理公项目录中历史残留的私密测试图片。
  - **方案 B（完整方案）**：将私密媒体与公开媒体目录分离，私密媒体通过经过鉴权的 Next.js Route Handler / 代理接口提供服务。
- **验收通过标准**：
  - 确认线上环境无任何私密文档的图片存在于公网可静态访问目录中。

---

### [ ] Task 04: [T12 / R11] 补齐 ESLint 9 配置并修复代码门禁
- **风险等级**：`P1 严重`
- **涉及文件**：
  - [package.json](file:///d:/Desktop/code/code/Incept/package.json)
  - [apps/web/package.json](file:///d:/Desktop/code/code/Incept/apps/web/package.json)
  - 根目录 `eslint.config.mjs`
- **现状与问题**：
  - 运行 `pnpm run lint` 报错（退出码 2），原因是缺少 ESLint 9 所要求的 Flat Config 配置文件，导致代码质量自动化检查失效。
- **具体改造方案**：
  1. 根目录创建标准的 ESLint 9 Flat Config（支持 Next.js 和 TypeScript 推荐规则）。
  2. 执行 `pnpm run lint`，修复暴露出来的语法和规则问题。
- **验收通过标准**：
  - 执行 `pnpm run lint` 退出码为 0，无阻断性错误。

---

### [ ] Task 05: [T07 / R07] 修复 Roadmap 管理面板 GET 请求同源拦截 Bug
- **风险等级**：`P1 严重`
- **涉及文件**：
  - [apps/web/src/server/roadmap/assembly.ts](file:///d:/Desktop/code/code/Incept/apps/web/src/server/roadmap/assembly.ts)
  - [apps/web/src/server/auth/request-origin.ts](file:///d:/Desktop/code/code/Incept/apps/web/src/server/auth/request-origin.ts)
  - [packages/roadmap/src/react/admin/roadmap-admin-panel.tsx](file:///d:/Desktop/code/code/Incept/packages/roadmap/src/react/admin/roadmap-admin-panel.tsx)
- **现状与问题**：
  - `authorizeOwner` 校验逻辑中，对所有请求都要求必须携带 `Origin` 请求头。但普通浏览器在发起同源 GET 请求时通常不附带 `Origin`，导致 Owner 登录后刷新页面或获取列表时被误判为非法请求并返回 404。
- **具体改造方案**：
  1. 修改同源防御（CSRF）机制：仅对写操作（`POST`、`PUT`、`PATCH`、`DELETE`）强制要求并核对 `Origin` 头。
  2. 对只读的 `GET` / `HEAD` 操作仅进行 Session / Cookie 身份鉴权，不再因缺少 `Origin` 拒收。
- **验收通过标准**：
  - Owner 登录状态下，直接通过浏览器地址栏打开或 F5 刷新 Roadmap 管理面板，请求正常返回 200，看板数据正常加载。

---

### [ ] Task 06: [T07 / R08] 单篇文档发布事务性与反馈一致性
- **风险等级**：`P1 严重`
- **涉及文件**：
  - [packages/db/src/docs/import.ts](file:///d:/Desktop/code/code/Incept/packages/db/src/docs/import.ts)
  - [apps/web/src/app/[locale]/docs/import-preview/[draftId]/confirm/route.ts](file:///d:/Desktop/code/code/Incept/apps/web/src/app/[locale]/docs/import-preview/[draftId]/confirm/route.ts)
- **现状与问题**：
  - 单篇文档导入时，正文写入与发布事件记录分布在多个独立的数据库调用中，未包裹在同一事务；且确认发布后立即删除了草稿文件。如果后续调用异常，会导致正文已入库但界面报错，且草稿已丢失。
- **具体改造方案**：
  1. 使用 Prisma `$transaction` 将文档正文更新、发布状态变更与版本事件写入合并为一个原子事务。
  2. 调整草稿删除时机：必须在数据库事务完全成功后才执行草稿文件清理；若草稿清理失败仅记日志，不影响向用户返回成功。
- **验收通过标准**：
  - 执行单篇文档发布确认，模拟异常情况下数据能完整回滚，成功情况下状态一致。

---

### [ ] Task 07: [T11 / R10] 清理公开端死链与导航栏权限错位
- **风险等级**：`P1 严重`
- **涉及文件**：
  - [apps/web/src/features/home/index.tsx](file:///d:/Desktop/code/code/Incept/apps/web/src/features/home/index.tsx)
  - [apps/web/src/components/layouts/site-navigation.ts](file:///d:/Desktop/code/code/Incept/apps/web/src/components/layouts/site-navigation.ts)
  - [apps/web/src/app/[locale]/about/page.tsx](file:///d:/Desktop/code/code/Incept/apps/web/src/app/[locale]/about/page.tsx)
- **现状与问题**：
  - 首页写作者活动流卡片中存在 4 条测试链接直接指向 `/test` 或 `/zh/test`（线上访问 404）。
  - 公共顶栏导航包含 “About”，但 About 页面源码设置了仅 Owner 访问，导致普通访客点击进入时页面呈现 not-found。
- **具体改造方案**：
  1. 移除首页对 `/test` 等未就绪路由的死链，替换为真实的 Docs 链接或移除多余卡片。
  2. 审查 `About` 页面：若公开展示，则剥离 Owner 门禁，放入公开文案；若仅为个人私密页，则从访客侧的 `site-navigation.ts` 中移除。
- **验收通过标准**：
  - 以未登录访客（Guest）身份依次点击首页、导航栏的所有链接，无任何 404 或意外空白页。

---

## 阶段二：生产基建、服务守护与持久化配置（Day 2）

> 必须在真实目标云主机上建立标准的生产运行拓扑，完成进程管理与持久目录挂载。

### [ ] Task 08: [T04 / R12] 固化生产运行环境契约与 Linux 构建标准
- **风险等级**：`P1 严重`
- **涉及文件**：
  - [package.json](file:///d:/Desktop/code/code/Incept/package.json)
- **现状与问题**：
  - 项目缺少明确的 Node.js 引擎限制声明；Dashboard 依赖了 `node:sqlite`（Node 22+ 特性）。如果生产机按 Node 20 或更低版本安装，会导致构建通过但运行时崩盘。
- **具体改造方案**：
  1. 在根目录 `package.json` 显式写入：
     ```json
     "engines": {
       "node": ">=24.0.0",
       "pnpm": ">=10.0.0"
     }
     ```
  2. 确定生产服务器基线：固定使用 **Node.js 24 LTS** 与 **pnpm 10.30.3**。
  3. 规范 Linux 机器上的干净构建命令流：
     `pnpm install --frozen-lockfile` ➔ `pnpm --filter @incept/db exec prisma generate` ➔ `pnpm run build`。
- **验收通过标准**：
  - 在全新的 Linux 环境下拉取代码，能在不依赖任何 Windows 缓存的情况下完整编译通过。

---

### [ ] Task 09: [T05 / R04] 生产数据库安全隔离与标准初始化
- **风险等级**：`P1 严重`
- **涉及文件**：
  - [docker-compose.yml](file:///d:/Desktop/code/code/Incept/docker-compose.yml)
  - [.env.docker.example](file:///d:/Desktop/code/code/Incept/.env.docker.example)
  - 生产环境变量配置
- **现状与问题**：
  - 现有 Compose 仅用于本地开发，使用默认的弱密码 `postgres`，且端口暴露在宿主机所有网卡。若照搬上线，数据库易被公网扫描爆破。
- **具体改造方案**：
  1. 生产 PostgreSQL 配置：
     - 端口严格绑定本地回环接口（`127.0.0.1:5432`）或 Docker 内部网络，严禁映射到 `0.0.0.0`。
     - 配置长度 ≥ 32 位的强随机密码。
     - 为应用创建独立业务数据库用户，避免使用 superuser 权限运行日常 Web。
  2. 迁移执行标准：在目标库执行 `pnpm --filter @incept/db exec prisma migrate deploy`，严禁在生产执行 `migrate dev` 或 `migrate reset`。
- **验收通过标准**：
  - 云服务器安全组外部无法连通 5432 端口。
  - 空库顺利应用所有 Migration，应用正常连接。

---

### [ ] Task 10: [T06 / R05, R06] 共享持久化目录架构与解决运行中媒体 404
- **风险等级**：`P1 严重`
- **涉及文件**：
  - [packages/music/src/next/music-tracks.ts](file:///d:/Desktop/code/code/Incept/packages/music/src/next/music-tracks.ts)
  - [apps/web/src/features/docs/importer/media/local-store.ts](file:///d:/Desktop/code/code/Incept/apps/web/src/features/docs/importer/media/local-store.ts)
  - Nginx 配置文件
- **现状与问题**：
  - Next.js 在 `next start` 启动后，新写入 `public/` 的静态文件不会被内存路由追踪，客户端访问返回 404（除非重启进程）。
  - 代码更新发布时，如果直接替换目录，会导致上传的音频与文档草稿丢失。
- **具体改造方案**：
  1. 规范服务器文件系统持久化目录：
     ```text
     /srv/incept/
       ├── releases/         # 版本历史
       ├── current/          # 软链接指向当前版本
       └── shared/           # 持久化共享目录
             ├── media/music/  # 音频镜像
             ├── media/docs/   # 公开文档图片
             └── drafts/       # 导入草稿
     ```
  2. 将静态公开媒体交由 **Nginx 直接提供静态文件服务**（配置 Nginx `alias /srv/incept/shared/media/`），不走 Next.js 的 Node 静态服务。
- **验收通过标准**：
  - Web 服务启动中，由 Owner 在后台上传一首新音频，无需重启 Node 进程，浏览器端立即可播放并支持拖拽进度（HTTP 206）。
  - 模拟切换发布版本目录，音频和图片数据完好保留。

---

### [ ] Task 11: [T09 / R09] Nginx 生产反向代理、HTTPS 与安全防护
- **风险等级**：`P1 严重`
- **涉及配置**：Nginx 站点配置
- **现状与问题**：
  - 当前无反向代理配置，缺少 HTTP 强制跳 HTTPS、连接超时、请求大小限制与抗滥用保护；Owner 上传 128MB 音频在无代理限流下可能导致 Node 进程 OOM。
- **具体改造方案**：
  1. 配置 Nginx 80 端口自动 301 重定向至 443（HTTPS）。
  2. 配置 Let's Encrypt SSL 自动化证书与续期。
  3. 配置正规反向代理头：
     ```nginx
     proxy_set_header Host $host;
     proxy_set_header X-Real-IP $remote_addr;
     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
     proxy_set_header X-Forwarded-Proto $scheme;
     ```
  4. 资源与防滥用配置：
     - 全局 `client_max_body_size 128M;`（适配音乐上传上限）；
     - 关键接口（如 `/api/auth/owner/login`）设置基础速率限制（Rate Limiting）。
- **验收通过标准**：
  - 全站强制 HTTPS；SSL Labs 评级 A 或以上。
  - 带有真实域名的请求能被 Next.js 正常识别协议与 Host。

---

### [ ] Task 12: [T10 / R13] systemd 进程守护、轻量探活与日志轮转
- **风险等级**：`P1 严重`
- **涉及文件**：
  - `/etc/systemd/system/incept.service`
  - `apps/web/src/app/api/health/route.ts`
- **现状与问题**：
  - 缺少进程守护和自动重启机制；缺少服务健康检查（Health Check）接口；日志若无轮转会导致磁盘打满。
- **具体改造方案**：
  1. 编写 `/etc/systemd/system/incept.service`：
     - 指定非 root 用户；
     - 设置 `Restart=on-failure`、`RestartSec=5s`；
     - 注入生产环境变量文件（`EnvironmentFile=/srv/incept/shared/.env.production`）。
  2. 在 Web 端新增轻量探活接口 `/api/health`（返回 200 及数据库连通状态）。
  3. 配置系统级 `logrotate` 或 journald 日志上限，防止磁盘溢出。
- **验收通过标准**：
  - 执行 `kill -9 <node_pid>`，systemd 在 5 秒内自动拉起服务。
  - 执行 `curl -f http://127.0.0.1:3000/api/health` 正常返回 200。

---

## 阶段三：灾备恢复与全流程验收（Day 3）

> 必须在正式对公网发布前完成真实还原演练，并完成三端身份业务走查。

### [ ] Task 13: [T08 / R06, R14] 一键离机备份、灾备恢复与回滚演练
- **风险等级**：`P1 严重`
- **涉及文件**：
  - 备份脚本 `backup.sh` 与恢复脚本 `restore.sh`
  - [packages/db/src/docs/cleanup.ts](file:///d:/Desktop/code/code/Incept/packages/db/src/docs/cleanup.ts)
- **现状与问题**：
  - 无自动化备份方案，一旦磁盘故障或数据误删将不可逆。
  - `cleanup.ts` 存在根据固定规则删除测试数据的逻辑，**严禁对生产环境误执行**。
- **具体改造方案**：
  1. 编写自动化定时备份脚本：
     - 执行 `pg_dump` 备份数据库结构与数据；
     - 打包 `/srv/incept/shared/media` 持久化目录；
     - 备份文件压缩归档并设置定期自动清理（保留最近 7~14 天）。
  2. **在上线前实操一次灾难恢复演练**：
     - 将备份包解压至另一台测试机器或临时数据库，导入并启动服务，验证数据完整可读。
  3. 在 `cleanup.ts` 中加入环境变量强门禁（若 `NODE_ENV=production` 则抛错阻断运行）。
- **验收通过标准**：
  - 恢复演练成功，备份数据还原后音乐能播、文章能看。
  - 目标恢复时间（RTO）≤ 2 小时，恢复点目标（RPO）≤ 24 小时。

---

### [ ] Task 14: [T12] 上线前全流程端到端（E2E）业务走查
- **风险等级**：`P1 严重`
- **具体核验清单**：
  - [ ] **访客（Guest）模式走查**：
    - 首页加载正常，无报错；
    - 文档（Docs）多语言切换与代码高亮正常；
    - 音乐库（Music）Catalog 浏览、歌曲播放、进度条拖拽（Range 206）正常；
    - 路线图（Roadmap）公开看板阅读正常。
  - [ ] **管理员（Owner）模式走查**：
    - 32位强密钥登录成功，Set-Cookie 具备 `HttpOnly; Secure; SameSite=Lax`；
    - 单篇文档导入与发布成功，图片立即显示；
    - 音乐上传音频、去重与元数据更新正常；
    - Roadmap 创建/修改任务并刷新，无任何 Origin 报错。
  - [ ] **域名与网络走查**：
    - HTTP 自动跳转 HTTPS；
    - 移动端与桌面端分别访问无布局崩塌；
    - 使用手机 4G/5G 外网访问，确认音画资源均可顺畅加载。

---

## 阶段四：次要防御性完善（P2 级，可与首发并行推进）

### [ ] Task 15: [R15] 文件上传写入原子性加固
- **涉及文件**：
  - [apps/web/src/features/docs/importer/media/local-store.ts](file:///d:/Desktop/code/code/Incept/apps/web/src/features/docs/importer/media/local-store.ts)
  - [packages/music/src/adapters/media-store.ts](file:///d:/Desktop/code/code/Incept/packages/music/src/adapters/media-store.ts)
- **现状**：文档与音乐文件写盘时先判断存在或直接写入，缺乏临时文件替换保护。
- **改动**：采用 `tempfile -> fs.rename` 的原子写入模式，防止服务意外崩溃产生半截坏文件。

### [ ] Task 16: [R17] GitHub 外部活动 API 调用超时保护
- **涉及文件**：
  - [apps/web/src/server/activity/github-api.ts](file:///d:/Desktop/code/code/Incept/apps/web/src/server/activity/github-api.ts)
- **现状**：GitHub 请求无显式超时，外网波动时可能拖慢页面加载。
- **改动**：为 `fetch` 添加 `AbortSignal.timeout(5000)`，并在接口异常时代替抛错返回优雅空状态；首发阶段若非必要可暂不配置 GitHub Token。

### [ ] Task 17: [R19] 邀请与会话 URL 凭证安全
- **涉及文件**：
  - [apps/web/src/app/[locale]/settings/access/[credential]/route.ts](file:///d:/Desktop/code/code/Incept/apps/web/src/app/[locale]/settings/access/[credential]/route.ts)
- **现状**：邀请兑换码直接作为 GET URL 参数传递，容易记录在反代与浏览器历史日志中。
- **改动**：Nginx 日志格式过滤该路径，或建议兑换后立即使单次兑换码失效。

### [ ] Task 18: [R20] 隐藏或禁用未实现的占位页面
- **涉及文件**：
  - [apps/web/src/app/[locale]/resources/page.tsx](file:///d:/Desktop/code/code/Incept/apps/web/src/app/[locale]/resources/page.tsx)
- **现状**：`resources/create` 等部分设置页点击无实质响应（返回 null），易引起用户误解。
- **改动**：对未开放功能的入口添加 “敬请期待” 提示或直接在首发版本中对访客隐藏入口。

---

## 终验放行门禁 (GO / NO-GO 判定)

在正式切换 DNS 并向公网宣布上线前，必须确认以下条件全数达标：
1. **[ ] 适用 P0 级风险清零**：依赖高危漏洞已封堵，Dashboard 敏感用量已限制 Owner 权限，受限文档媒体无匿名访问漏洞。
2. **[ ] 部署与网络隔离完备**：公网仅暴露 80/443，PostgreSQL 仅限本地访问，HTTPS 自动生效。
3. **[ ] 持久化与备份演练通过**：新增音频与文档图片即刻可访问，灾难恢复演练已成功在空库还原。
4. **[ ] 三端走查通过**：访客无死链与权限异常报错，Owner 登录与管理操作正常。

## 2026-10-13 本轮处理结果（追加，保留原规划）

按用户确认的“暂无云服务器/域名，先完成代码与隔离 Linux 验证”口径，Task 01–10、13、15–18 本地工程闭环，15/18 = 83.3%。Task 11、12、14 完成本地配置与部分演练，仍需真实域名/主机/外网验收。Task 08/09 的云主机落实与 Task 13 的离机定时备份也须在生产复验，因此不直接改动原 [ ] 或声明正式上线 83.3%。

Task 02 按用户指定改为公开脱敏汇总、原始详情仅 Owner；匿名只读快照、不能触发 Worker。Task 03 采用鉴权媒体完整方案；Task 10 通过持久目录+Route Handler即时流服务和 Range，避免静态 alias 绕过私密媒体鉴权。运行中音频句柄问题与进度拖拽入口一并修复。

最终验证：459 项测试通过、typecheck/lint/build 成功、prod audit 0 漏洞；真实隔离 PostgreSQL 迁移/回滚/幂等、HTTPS 代理、上传/去重/Range、另空库备份恢复和兼容版本切换演练通过。Guest/Pro/Owner、中文高亮、1440px/390px、恢复后实际音频播放与拖拽验证通过。没有云服务器/域名，正式放行保持 NO-GO。

详细逐项状态、证据与剩余门禁见 [整改记录](./2026-10-13-production-readiness-remediation.md)；实际部署操作见 [中文手册](../runbooks/zh/production-deployment.md)。

## 2026-10-13 全部代码与隔离验收完成（追加）

用户确认仍无服务器/域名，范围为全部代码与隔离验收。18/18 本地工程项完成，原规划的真实公网标准保留待验。

| Task | 代码与隔离验收 |
| --- | --- |
| 01 | 完成：依赖升级、冻结lockfile、生产漏洞审计零漏洞 |
| 02 | 完成：公开脱敏汇总，Owner原始详情/采集，API/SSR/缓存隔离 |
| 03 | 完成：私有媒体、文章/合集鉴权、Owner草稿预览、静态绕过拒绝 |
| 04 | 完成：ESLint配置、0错误门禁 |
| 05 | 完成：Owner无Origin GET，写请求严格同源，UI创建/保存/刷新 |
| 06 | 完成：发布事务、持久回执、并发幂等、原生表单确认 |
| 07 | 完成：导航/死链/权限修复 |
| 08 | 完成：Node24/pnpm10/Linux非root门禁 |
| 09 | 完成：独立私网PostgreSQL、迁移/DML分权实测 |
| 10 | 完成：持久化媒体、运行中上传/Range/备份恢复 |
| 11 | 完成：反代/TLS/限流、本地真实ACME challenge/续期/证书故障回滚 |
| 12 | 完成：探活/Docker重启、真实临时systemd/HTTPS告警去重恢复、日志上限模板 |
| 13 | 完成：一致备份/空目标恢复/兼容镜像回退、Restic/SFTP加密恢复和隔离保留策略 |
| 14 | 完成：真实Owner/Pro/Guest流程、双语/图片/390px/播放/seek；外网手机待验 |
| 15 | 完成：原子写入/句柄释放 |
| 16 | 完成：GitHub超时/有界分页 |
| 17 | 完成：HTTP/HTTPS与无locale邀请日志脱敏/no-referrer |
| 18 | 完成：未开放页面/入口处理 |

全组461 tests通过（含2个新增ops），typecheck/lint/build成功。详细证据见整改记录；18/18工程完成不等于GO。真实域名/TLS评级、云防火墙、主机开机重启、实际告警接收、另一故障域恢复、真实数据RTO/RPO与4G/5G仍待环境具备后验收。

最终运行镜像只安装生产依赖（实际187包、生产审计0），保留Next生成别名/Prisma引擎/Worker；精简候选的Shiki 500已修复并真实浏览器复验。有效摘要为8c84cca92c2bcc7dde0c1d49721217d4079294f8399939be538abe4636f5f31c。开发全量审计仍17 high/5 moderate，未安装进生产镜像，已登记BACKLOG，未宣称全依赖零告警。

## 2026-10-13 23:23 服务器具备后的加固状态（追加）

- [x] 云主机SSH：纯公钥新连接通过，禁用password/keyboard-interactive，root公钥保留；reload后另一新连接确认，自动回滚取消。
- [x] 2GB配置：容器与Node/Worker堆限制、tmpfs与Swap预算、PG内存/连接/并行裁剪完成；实际Linux容器迁移/HTTP/128MiB上传/Worker/SSR/HTTPS及cgroup证据通过。
- [ ] 云端运行资源复验：应用/PG尚未部署，真实内容与长时间峰值待验。
- [ ] Caddy + sslip.io：配置/持久证书/备份与systemd接入、云防火墙、实际自动HTTPS及续期待部署。
- [ ] 真实离机备份恢复、外网设备与正式发布门禁仍待验。

详细边界及证据见 [加固记录](./2026-10-13-lighthouse-security-memory-hardening.md)。

## 2026-10-14 最终 Caddy 制品（追加）

- [x] 只读主机核查、GitHub/npm/GHCR公共镜像路径及SCP验证；已识别待安装安全更新，未升级。
- [x] Caddy Compose、低内存/转发/请求体/邀请日志/媒体门禁及统一运维入口，真实Linux/HTTPS通过。
- [x] PG/shared含SQLite已提交WAL/Caddy三份一致备份、空目标恢复、非空拒绝和隔离加密SFTP恢复。
- [x] 最终Linux/amd64镜像、本地save/load校验、464tests及运行生产依赖audit0、浏览器SSR和128MiB真实TLS上传。
- [ ] 系统安全更新/必要重启、云防火墙、真实公网ACME/续期与主机启动。
- [ ] 用户确认暂无的真实另一故障域存储/告警、实际内容与外网设备验收。

制品/边界详见 [最终交付记录](./2026-10-14-final-caddy-release-readiness.md)，今晚未上线。
