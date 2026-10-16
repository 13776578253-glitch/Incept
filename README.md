<!-- Banner Section: 支持系统深色/浅色自适应切换 -->
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/incept-banner-dark.png">
    <source media="(prefers-color-scheme: light), (prefers-color-scheme: no-preference)" srcset="docs/assets/incept-banner-light.png">
  </picture>
</p>

<h1 align="center">Incept</h1>

<p align="center">
  <strong>更安静的界面，更清楚的边界。</strong><br>
  沉静、有序的个人数字花园、工程知识中枢与创作发布系统。
</p>

<p align="center">
  <a href="#-核心特性">核心特性</a> ｜
  <a href="#-架构设计">架构设计</a> ｜
  <a href="#-快速上手">快速上手</a> ｜
  <a href="#-常用指令">常用指令</a> ｜
  <a href="#-文档体系">文档体系</a> ｜
  <a href="#-设计哲学">设计哲学</a> 
</p>

<p align="center">
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16.4-000000?style=flat&logo=next.js&logoColor=white">
  <img alt="React 19" src="https://img.shields.io/badge/React-19.2-20232A?style=flat&logo=react&logoColor=61DAFB">
  <img alt="TypeScript 5" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat&logo=typescript&logoColor=white">
  <img alt="Tailwind CSS v4" src="https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=flat&logo=tailwind-css&logoColor=white">
  <img alt="Prisma & PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-Prisma-2D3748?style=flat&logo=prisma&logoColor=white">
  <img alt="Node >= 24" src="https://img.shields.io/badge/Node-%E2%89%A5%2024.15-339933?style=flat&logo=node.js&logoColor=white">
  <img alt="pnpm workspace" src="https://img.shields.io/badge/pnpm-10.3-F69220?style=flat&logo=pnpm&logoColor=white">
</p>

---

## 📖 项目简介 (Introduction)

**Incept** 是一个私有化部署、高工程密度的个人数字化内容站点与创作系统。系统基于 **pnpm workspace** 驱动的现代 Monorepo 架构构建，前端采用 **Next.js 16 (App Router)**、**React 19** 与 **Tailwind CSS v4**，数据层依托 **Prisma ORM** 与 **PostgreSQL**，并具备中英双语对等支持（`next-intl`）与深浅色模式（`next-themes`）。

> [!NOTE]
> **当前界面演进状态**：原始 Home 落地页基于早期 Mock 设计，目前已列入重构周期（当前不展示作为主入口）。系统当前的核心体验与展示重心聚焦于 **Docs 知识发布引擎**、**Roadmap 看板**、**Ambient Music** 及 **Dashboard 仪表盘**。

---

## ✨ 核心特性 (Features)

### 1. 📚 沉静式 Docs 知识库与两阶段发布流水线
* **离线 Markdown-like 创作**：文章正文与媒体文件与代码仓库解耦，使用独立内容源目录（`DOCS_CONTENT_ROOT`）与 `.docs.md` 格式。
* **双阶段审核发布**：CLI 导入时先完成内容结构校验、图片哈希去重与草稿（Draft）生成；必须由站长在 Web 端的 Owner 预览页面中直观校验确认后，才正式将文章事务写入 PostgreSQL。
* **分级内容形态**：原生支持 `article`（长文）、`reference`（参考资料）与 `note`（随笔小记）；支持单篇阅读与树形嵌套的系列合集（Series & Collections）。
* **高性能阅读体验**：集成 Shiki 语法高亮引擎、响应式侧边导航、目录大纲联动以及安全鉴权的受控媒体分发。

### 2. 🎵 六边形架构环境声学与音乐系统 (`@incept/music`)
* **整洁六边形架构**：将音频子系统解耦为 Domain（领域模型）、Ports & Adapters（端口与适配器）、Application（应用用例）、React 组件层与 CLI 独立工具链。
* **文件夹即曲库 (Folder-as-Library)**：直接根据目录命名与层次自动提取音频元数据并派生曲库配置，无需手动维护繁复的索引文件。
* **全局持久化播放体验**：通过站点自研的 Mount System 无缝注入根布局，悬浮播放条支持背景流式播放、播放列表切换与进度记忆。
* **本地开发友好**：内置 Mock 音频生成指令（`pnpm music:mock-audio`），本地脱离真实版权资源即可实现全流程闭环开发。

### 3. 🗺️ 动态交互式路线图与规划全景 (`@incept/roadmap` & Atlas)
* **双表面协同**：统一支持以阶段列状态驱动的 **Roadmap 看板**（Reviewing / Unstarted / Active / Completed / Canceled）以及宏观知识视角的 **Atlas 规划图**。
* **纯追加、防覆盖安全导入**：提供专用 JSON 导入流水线，服务端单事务强校验；具备中英双语（`titleEn`/`titleZh`、`summaryEn`/`summaryZh`）严格对等保证与右上角悬浮毛玻璃反馈。
* **所有权感知的动态视图**：Owner 登录态下可自由进行条目拖拽、状态调整与直观管理；访客态呈现轻量沉浸的只读全景。

### 4. 📊 开发者指标与 AI 消耗仪表盘 (`@incept/dashboard`)
* **AI 算力与开发成本洞察**：无缝集成 `ccusage` 工具链，在私有控制台内直观可视化呈现 Claude Code 与 AI 编程助手的 Token 吞吐量、会话轮次与日度支出。
* **GitHub 提交热力图联动**：支持配置 Personal Access Token，同步滚动 52 周与各自然年度的真实贡献热力图。
* **写作与内容沉淀度量**：实时聚合已发布文章总量、写作单元（字数）以及内容版本迭代历史。

### 5. 🛡️ 物理隔离的 Owner 鉴权与受限访问控制 (Security & Access)
* **创作者与管理员彻底分离**：站长 Owner 账户与日常内容作者严格解耦，系统完全关闭公网开放注册入口。
* **多因素安全防御**：支持 TOTP 双因子动态口令、受信任设备指纹风控（`OwnerDevice`）、基于会话的挑战审批流水线、应急一次性恢复码与访问限流防爆破（`AuthRateBucket`）。
* **临时 Pro 兑换凭证**：支持通过 CLI 签发具备有效期限、最大兑换次数与设备哈希锁定的专属访问码（Shared Codes），安全分享受限资源。

### 6. 🤖 原生 Multi-AI 并行协作工作流 (Agentic Worktrees)
* **多 Agent 协同支持**：内置专属 Git Worktree 编排脚本（`pnpm wt:new`、`wt:adopt`、`wt:status`），自动化派生隔离分支与独立的 PostgreSQL 数据库 Schema，避免多 AI 编程助手并发执行时的状态冲突。
* **两类文档分层治理**：严谨划分「AI 任务工作流日志（`docs/current-task/`）」与「人类长效架构决策与手册（`docs/runbooks/`、`docs/decisions/`）」。

---

## 🏗️ 架构设计 (Architecture)

Incept 采用基于 **pnpm workspace** 的清晰分层架构，确保核心业务边界分明、依赖单向流转：

```mermaid
graph TD
    classDef app fill:#1e293b,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;
    classDef pkg fill:#0f172a,stroke:#34d399,stroke-width:1.5px,color:#f8fafc;
    classDef infra fill:#18181b,stroke:#a78bfa,stroke-width:1.5px,color:#f8fafc;

    App["apps/web (Next.js 16 App Router)"]:::app

    PkgDB["packages/db<br>(Prisma & Data Layer)"]:::pkg
    PkgMusic["packages/music<br>(Hexagonal Audio Engine)"]:::pkg
    PkgRoadmap["packages/roadmap<br>(Kanban & Atlas Domain)"]:::pkg
    PkgDashboard["packages/dashboard<br>(ccusage & Telemetry)"]:::pkg

    InfraPG[(PostgreSQL 16)]:::infra
    InfraContent[("Local Content Root<br>(Markdown & Media)")]:::infra

    App --> PkgDB
    App --> PkgMusic
    App --> PkgRoadmap
    App --> PkgDashboard

    PkgMusic --> PkgDB
    PkgRoadmap --> PkgDB
    PkgDB --> InfraPG
    App -.-> InfraContent
```

### 目录与工作区职责

```text
Incept/
├── apps/
│   └── web/                   # Next.js 16 站点主应用、路由、布局与挂载注册表 (Mount System)
│       ├── src/app/           # App Router 路由体系 ([locale], api 等)
│       ├── src/features/      # 业务领域切片 (docs, music-player, roadmap, dashboard 等)
│       ├── src/components/    # 基础与自适应 UI 组件库
│       └── src/mount/         # 运行时贡献挂载注册表 (Floating Overlays, Providers)
├── packages/
│   ├── db/                    # PostgreSQL 数据模型、Prisma Migration、发布与鉴权数据层
│   ├── music/                 # 遵循六边形架构的音频引擎、播放器 React 组件与导入工具
│   ├── roadmap/               # 路线图与规划图领域模型、看板组件及中英双语对等校验
│   └── dashboard/             # 开发者指标、Claude Code (ccusage) 运行时与数据转换工具
├── docs/                      # 架构决策 (decisions)、运行手册 (runbooks) 与任务上下文
├── scripts/                   # Multi-AI Worktree 脚本、内容导入校验与运维脚本
└── deployment/                # 单机生产 Docker Compose、Nginx 配置与证书轮换守护脚本
```

---

## 🚀 快速上手 (Quick Start)

### 1. 环境准备
确保本机已安装符合要求的运行环境：
* **Node.js**：`>= 24.15.0 < 25`
* **pnpm**：`10.30.3`
* **Docker** & **Docker Compose**（用于运行本地 PostgreSQL 实例）

### 2. 安装项目依赖
在仓库根目录执行：
```powershell
pnpm install
```

### 3. 启动本地数据库
参考 [本地 PostgreSQL 运行手册](docs/runbooks/zh/local-postgres-docker-setup.md)，使用 Docker 启动 PostgreSQL：
```powershell
docker compose --env-file .env.docker up -d
```

### 4. 配置环境变量
在 `apps/web/.env.local` 中配置本地私有密钥与独立内容目录：
```env
# 数据库连接
DATABASE_URL="postgresql://incept_app:incept_dev_pass@localhost:5432/incept?schema=public"

# 外部内容与媒体源目录 (脱离 Git 跟踪)
DOCS_CONTENT_ROOT="D:\\Incept-content"
MUSIC_CONTENT_ROOT="D:\\Incept-content\\music"

# Owner 站长鉴权密钥 (生成随机 64 位十六进制字符)
OWNER_SECRET_SALT="your_secure_random_salt_here"

# (可选) GitHub 提交记录同步 Token
GITHUB_ACTIVITY_TOKEN="ghp_xxx"
```

### 5. 执行数据迁移与客户端生成
```powershell
pnpm db:deploy
pnpm db:generate
```

### 6. 初始化种子数据 (可选)
如果需要初始化路线图或基础数据用于预览：
```powershell
pnpm roadmap:seed
pnpm music:mock-audio
```

### 7. 启动本地开发服务器
```powershell
pnpm dev
```
启动后在浏览器中打开 `http://localhost:3000` 即可访问站点。系统当前主导的核心业务入口包括：
* **Docs 知识库与文章阅读**：`http://localhost:3000/zh/docs`
* **路线图与全景规划**：`http://localhost:3000/zh/roadmap`
* **开发者指标与 AI 消耗**：`http://localhost:3000/zh/dashboard`
* **站长工作台与草稿审核**：`http://localhost:3000/zh/studio`（需 Owner 登录）

*(注：根路径 `/` 的旧版 Home 界面已冻结待重构，建议直接访问上述核心功能页体验。)*

---

## 🛠️ 常用指令 (Common Commands)

### 常用开发与构建
```powershell
pnpm dev                    # 启动 Next.js 本地开发服务器
pnpm build                  # 构建生产版本应用
pnpm lint                   # 全局代码规范检查
pnpm typecheck              # 全局各包严格 TypeScript 类型检查
pnpm test                   # 运行全工作区单元测试与集成测试
```

### 数据库管理 (`packages/db`)
```powershell
pnpm db:deploy              # 将当前未执行的 migration 应用于数据库
pnpm db:migrate             # 创建新的 Prisma migration (开发环境)
pnpm db:generate            # 重新生成 Prisma Client 类型定义
pnpm db:studio              # 启动 Prisma Studio 可视化数据查看面板
```

### Docs 内容系统
```powershell
# 试运行检查 Markdown 格式与媒体路径 (不产生任何写操作)
pnpm docs:import --file 2026-10-15/article.docs.md --dry-run

# 创建导入草稿 (生成预览地址，需在 Owner 网页中核验并正式落库)
pnpm docs:import --file 2026-10-15/article.docs.md

# 运行内容合规与代码高亮专项检查
pnpm docs:check-markdown-like
pnpm docs:check-media
pnpm docs:check-code-highlighting
```

### 音乐播放系统 (`packages/music`)
```powershell
pnpm music:manifest         # 从 MUSIC_CONTENT_ROOT 目录派生生成曲库清单
pnpm music:import           # 执行音频元数据同步与数据库入库
pnpm music:mock-audio       # 生成本地测试用轻量音频切片
pnpm music:cleanup          # 清理不再被清单引用的临时音频镜像
```

### 权限与安全管理
```powershell
pnpm auth:grant --help      # 查看 Pro 临时兑换码签发帮助与参数选项
pnpm auth:owner             # 管理或重置站长 Owner 凭证与 TOTP 配置
pnpm auth:revoke-owner-sessions # 一键吊销所有当前已激活的站长登录会话
```

### Multi-AI 协作 (Worktree)
```powershell
pnpm wt:new <feature-name>  # 派生新工作树、配置隔离 DB Schema 并就绪依赖
pnpm wt:status              # 查看当前所有活跃 AI 工作树状态
pnpm wt:remove <name>       # 安全移除已合并的工作树并清理资源
```

---

## 📚 文档体系 (Documentation)

项目拥有系统化的内部架构决策与运维手册，统一收录于 `docs/` 目录中：

| 文档入口 | 核心职责与阅读指引 |
| :--- | :--- |
| **[Docs Index](docs/INDEX.md)** | 文档库全景索引，定义 AI 任务日志与人类长效文档的双层管理准则 |
| **[Docs 内容导入操作手册](docs/runbooks/zh/docs-content-import.md)** | Markdown-like 正式文章撰写、媒体相对路径规范与两阶段发版实操 |
| **[音乐内容导入手册](docs/runbooks/zh/music-content-import.md)** | 批量导入音频文件、曲库编号规则与元数据同步指南 |
| **[路线图导入规范指南](docs/runbooks/zh/roadmap-content-import.md)** | 路线图与规划图 JSON 导入规范、字段校验逻辑与防覆盖原则 |
| **[本地 PostgreSQL 运行手册](docs/runbooks/zh/local-postgres-docker-setup.md)** | Docker 环境下数据库实例的编排、数据持久化与灾备初始化 |
| **[单机生产发布与恢复](docs/runbooks/zh/production-deployment.md)** | Linux 生产主机环境、Docker Compose、Nginx 强安全反向代理与 TLS 轮换方案 |
| **[数据层架构规则](docs/decisions/zh/db-layer-architecture-rules.md)** | Prisma 数据模型边界、只读约束与严禁越界访问的技术底线 |
| **[Multi-AI 协作指南](docs/runbooks/zh/multi-ai-worktrees.md)** | 依托 Git Worktree 实现多个 AI 助手并发作业的工程规范 |


