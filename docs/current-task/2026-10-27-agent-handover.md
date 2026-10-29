# Incept 项目对接报告（交接给下一位 AI）

更新：2026-10-27 16:35（Asia/Singapore）。写给接手的 AI：先读完本文，再动手。

> **2026-10-28 release update — read this first:** `main` has been merged into `fix/sync-safety` at `fb75fa8`, so the roadmap surface fix (`8e5e084`) and the sync remediation now share one release line. The latest envelope-semantics image is `sha256:83d90694…` (tag `20261029-sync7`, release `1433891`); `/api/health/ready` is 200 and sync is at revision 1113 with 0 reviews and 0 incomplete staging. Review #36 was metadata-only (`sessionTitle`) and was accepted as a rebase successor. The status paragraphs below describe the 2026-10-27 state and are retained only as history; use `2026-10-28-sync-roadmap-release.md` and `2026-10-28-sync-upload-remediation.md` for the current state.

> **Post-cleanup update:** `main` is 16 commits ahead of `origin/main` and not pushed; the working tree is clean. P1-A (`786ef96`), P2–P6 (`cf1f9e1`) and the cleanup/docs commits are in place. Production remains `20261027`; P1/P2/P6 are not deployed, and the P3 reboot check is still pending. P5 is accepted. Six worktrees are removed and four branches remain. See `2026-10-27-cleanup-round.md` for the current state.

## 0. 一句话现状

生产在线且健康（Next.js 16.4.3，镜像 `20261027`），仓库 `main` 领先 `origin/main` 16 个提交（未 push）；**没有阻塞性故障**，剩下的是部署/压测、性能优化、若干小 bug 和运维清理。

## 1. 项目是什么

个人站点 + 工具集合（文档、音乐、仪表盘、路线图/规划图、同步采集）。pnpm monorepo：

```
apps/web          Next.js 16.4.3 App Router 主站（唯一对外服务）
apps/sync-gateway 独立 Node 服务，承载设备 WSS 长连接
apps/sync-agent   本机采集器（把 AI 工具用量写进 outbox）
apps/sync-tray    Windows 托盘（C# WinForms，管理 sync-agent）
packages/roadmap  路线图/规划图（domain/ports/adapters/react 分层）
packages/dashboard 用量看板 + SyncExecutor（同步执行器）
packages/db       Prisma schema 与迁移
scripts/          运维 CLI（水位、备份、导入等）
deployment/       Compose / Caddy / systemd / 发布脚本
```

技术要点：PostgreSQL 16（业务数据）+ SQLite（同步账本 `/data/sync/v4.db`，WAL）。同步协议有 512KB 分页、manifest/generation/receipt、设备白名单 `agent_devices.allowedSources`、启动时的**权威账本水位门禁**。

## 2. 生产环境事实

| 项 | 值 |
| :--- | :--- |
| 主机 | `root@43.155.136.83`（SSH 走公钥 + ssh-agent，无密码） |
| 系统 | Debian 13 (trixie) / 内核 6.12.111 / **2 vCPU · 1.9GB RAM · 4GB swap** |
| 域名 | `https://43-155-136-83.sslip.io`（Caddy 2.11.7 自动证书，容器内 80/443） |
| 部署根 | `/srv/incept`；`current` 是符号链接（现指向 `releases/973e714`） |
| 数据目录 | `INCEPT_DATA_DIR=/srv/incept/shared`（容器内 `/data`） |
| env | `/srv/incept/.env.production`（**0600，禁止打印/复制进 Git**） |
| 当前镜像 | `incept-v4-release:20261027` = `sha256:88aeaa4cc572…`（app 与 sync-gateway 同一镜像） |
| 容器 | `incept-app-1`、`incept-sync-gateway-1`、`incept-proxy-1`(caddy)、`incept-postgres-1`，全部 healthy |
| 磁盘 | 39G 用 32G（**81%**，剩 7.7G） |
| 数据库 | 容器内 `postgres:5432`，超级用户 `incept_migrator`，**不发布宿主端口** |

运维入口统一走 `sh deployment/compose.sh`（自动带上 Caddy overlay、project name 与 env file），必须在 `/srv/incept/current` 或对应 release 目录里执行。

## 3. 发布流程（照抄）

服务器**禁止构建**（2GB 内存）。本机构建 → 传镜像 → 服务器只 load。

```bash
# 本机（Windows，Docker Desktop，linux/amd64）
docker buildx build --platform linux/amd64 --load -t incept-v4-release:<日期> .
docker image save -o incept-<日期>.tar incept-v4-release:<日期>
# 传：镜像 tar + release-<sha>.tar.gz(deployment/ + scripts/) + manifest.json
```

```bash
# 服务器
cd /srv/incept/incoming && sha256sum -c -          # 先校验
docker image load -i incept-<日期>.tar            # 记下 image ID
tar -xzf release-<sha>.tar.gz -C /srv/incept/releases/<sha>
cd /srv/incept/releases/<sha> && sh deployment/compose.sh config --quiet

cd /srv/incept && cp -p .env.production .env.production.bak-pre-<时间>
cd /srv/incept/current && sh deployment/compose.sh stop app
sh deployment/compose.sh --profile ops run --rm migrate
# 改 .env.production 的 INCEPT_APP_IMAGE=sha256:<新 ID>，并把 current 指向新目录
cd /srv/incept/current && sh deployment/compose.sh up -d --wait --wait-timeout 120 app
# app healthy 之后
sh deployment/compose.sh up -d --wait --wait-timeout 120 sync-gateway
sh deployment/compose.sh up -d --no-deps --force-recreate proxy   # 让 Caddy 重新解析 app 地址
```

回滚：`cp` 回 env 备份、`current` 指回上一 release、`up -d --wait` 同样的服务、再 recreate proxy。**旧镜像和旧 release 目录一律保留**。

## 4. 本地开发环境（有坑，务必照做）

- `pnpm dev`（Node 24.21 / pnpm 10.30.3）。
- 本机数据库在 Docker 容器 `incept-postgres` 里，**没有发布端口**；宿主 5432 又被别的进程占着。为此起了一个 socat 代理容器 `incept-pg-proxy`，把容器库映射到 **127.0.0.1:15432**。
- 因此本地必须用覆盖的 DATABASE_URL 启动，否则页面 500（`Can't reach database server at 127.0.0.1:5432`）：

```powershell
$line = Get-Content apps\web\.env.local | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
$url  = $line.Substring('DATABASE_URL='.Length).Trim().Trim('"')
$env:DATABASE_URL = $url -replace ':5432/', ':15432/'
pnpm dev    # http://localhost:3000
```

- 机器**装了 TUN 模式代理**：HTTP(S) 出口是代理 IP，SSH 走真实家宽 IP。代理偶尔会把 SSH 握手重置（`kex_exchange_identification: read: Connection reset by peer`），**不是服务器问题，别去改服务器防火墙或 sshd**，等一会儿/换节点即可。
- **本机没有可用的 headless 浏览器**（沙箱限制 Chrome/Edge 写 profile），所以 UI 改动无法自动截图，只能靠单元测试 + 人工肉眼验收。
- `next dev` 每次启动都会重写 `apps/web/next-env.d.ts`（`.next/types` → `.next/dev/types`）。**这个文件不要提交**，提交前 `git checkout -- apps/web/next-env.d.ts`。

## 5. 待办问题（按优先级）

### P1 · 单 worker 串行导致高负载时 dashboard 刷新失败
- 定位：`packages/dashboard/src/sync/executor.ts`（单 worker thread，`maxQueue 16`、`perDevice 2`、`timeoutMs 30_000`）；实例化在 `apps/web/src/server/sync/next.ts`。
- 现象：同步提交与 `projection` 操作抢同一个 worker，高负载时 `/api/dashboard/usage` 超时/失败（历史日志里 Caddy 记录过 `499 @20s`）。
- 方向：projection 单独 worker / 缓存快照 / 优先级队列。改动面较大，**先测再动**。

### P2 · 水位 CLI 第二个参数不生效
- `scripts/ledger-watermark.mjs`：`check <db> <watermark>` 的第二个参数只用于打印，门禁仍按「DB 同目录」定位文件。已写进 `deployment/ledger-watermark.md` 的已知缺陷。

### P3 · 托盘重启后不自启
- `apps/sync-tray`（C#，`csc.exe` 编译，`tools/test.ps1` 跑反射测试）。计划任务 `InceptSyncAgent-<id>` 存在，但开机后不会自动拉起 agent。

### P4 · 磁盘清理
- `/srv/incept/incoming` 三份镜像 tar 共 2.4G；Docker 里另有 6 个 `incept-v4-release:*` 镜像各约 1.5G。删掉 2 个旧 tar + 2 个旧镜像可回收约 4–5G（回滚只需保留最近两代）。

### P5 · 路线图「+」的视觉验收
- `973e714` 刚上线：空列（Backlog/Planned）时，工具条 Import 左侧出现圆形「+」。代码与测试都过了，但**没人肉眼看过实际观感**。需要 Owner 登录后确认。

### P6 · 依赖对齐（低优先）
- `apps/web` 的 `eslint-config-next` 仍是 `16.4.0`，`next` 已 `16.4.3`。仅 lint 期依赖，不在安全公告范围。

## 6. 红线（不要做）

1. **不要在服务器上 build / install / 跑 dev**（2GB 内存，会拖垮生产）。
2. **不要 `docker compose down -v`**（会删数据卷）。
3. **不要打印或提交 `/srv/incept/.env.production` 的内容**；需要核对时只 `grep` 单个非敏感键。
4. **不要改服务器 sshd / 防火墙**，除非用户明确要求。
5. **不要跳过水位门禁**：`/srv/incept/shared/sync/ledger-watermark.json` 已存在且通过，重生成要走 `ledger-watermark.mjs` 的受控流程（拒绝降级、拒绝覆盖损坏文件）。
6. 提交遵循 `fix(web): …` / `docs: …` 风格；提交前 `git diff --cached --name-status` + `--check`；**每轮工作写一份 `docs/current-task/<日期>-<主题>.md`**（用户明确要求过，不要省）。

## 7. 存档位置

- 生产发布与恢复：[docs/runbooks/zh/production-deployment.md](../runbooks/zh/production-deployment.md)
- 最近三轮发布记录：
  - [2026-10-27 路线图「+」移动](../finish-task/2026-10-27-release-20261027.md)
  - [2026-10-25 Next 16.4.3 安全升级](../finish-task/2026-10-24-nextjs-16.4.3-security-upgrade.md)
  - [2026-10-25 路线图建卡修复](../finish-task/2026-10-24-roadmap-create-and-editor.md)
- 同步链路历史（harness、水位、499 超时、托盘）：[2026-10-23-sync-harness-and-ui-polish.md](../finish-task/2026-10-23-sync-harness-and-ui-polish.md)
- 水位门禁说明：[deployment/ledger-watermark.md](../../deployment/ledger-watermark.md)

## 8. 交接时最快的自检

```bash
curl -s -o /dev/null -w "ready %{http_code}\n" https://43-155-136-83.sslip.io/api/health/ready
curl -s https://43-155-136-83.sslip.io/api/dashboard/usage | head -c 160     # updatedAt 应在几分钟内
ssh root@43.155.136.83 'docker ps --format "{{.Names}} {{.Status}}"'
ssh root@43.155.136.83 'cd /srv/incept/current && docker exec incept-app-1 node /app/scripts/ledger-watermark.mjs check /data/sync/v4.db /data/sync/ledger-watermark.json | head -5'
```
