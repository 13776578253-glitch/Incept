# Incept Sync Gateway / Phase 4

独立 Node 24 服务，承载已认证设备的 WSS 出站连接；命令只有 `sync_now(jobId)`。Agent 继续复用 Phase 3 的采集器、outbox 和 HTTPS API。Job 存于 PostgreSQL；Gateway 的连接表只表示当前 socket，不从历史 lastSeen 推断在线。

## 本地构建与配置

```powershell
node packages/dashboard/tools/build-runtime.mjs
node apps/sync-agent/tools/build.mjs
node apps/sync-gateway/tools/build.mjs
```

使用锁定的 Node `>=24.15 <25`、pnpm `10.30.3`。Gateway 复用现存 Next `16.4.0` 内锁定的 WebSocket 实现，构建后只运行便携 bundle，无新外部依赖版本。禁止把生产 `.env` 复制进隔离环境。

Web 配置（仅隔离环境显式启用）：

| 配置 | 用途 |
| --- | --- |
| `INCEPT_SYNC_ENABLED=1` | 原安全上传入口 |
| `INCEPT_SYNC_REMOTE_ENABLED=1` | Owner Job、设备在线状态、内部认证 RPC |
| `INCEPT_SYNC_DATABASE_FILE` | 全新独立 v2 SQLite 绝对路径 |
| `INCEPT_DASHBOARD_IMPORTS_FILE` | 原 v1 store，保持独立 |
| `INCEPT_DASHBOARD_HOME` | 隔离云端 HOME |
| `INCEPT_DASHBOARD_OVERRIDES_FILE` | 隔离价格/映射配置 |
| `INCEPT_SYNC_RPC_KEY` | 独立随机 32-byte 以上十六进制服务密钥，不是 Device Token |
| `INCEPT_SYNC_GATEWAY_INTERNAL_URL` | Docker 内部 Gateway HTTP 地址 |
| `INCEPT_SYNC_READ_MODE=v1|shadow|v2` | 默认 v1；shadow 仅对账；v2 仅向 Owner 显示统一投影 |
| `INCEPT_SYNC_POLL_MS` | 云端网页读取间隔，限制 300000–600000，默认 300000 |

Gateway 使用相同 RPC key，另配置 `INCEPT_SYNC_WEB_INTERNAL_URL`；默认只监听 `127.0.0.1:3101`。在专用 Docker 网络中显式用 `INCEPT_GATEWAY_HOST=0.0.0.0`，不发布该端口。所有公网 WSS 走现有 TLS 代理的 `/api/sync/ws`；Web `/api/internal/sync/*` 和 Gateway `/rpc/*` 必须在公网代理直接拒绝。

`compose.isolated.yml` / `nginx.isolated.conf` 是独立本地样例，不修改生产 Compose/Nginx/Caddy。先用本轮 frozen build 产物提交为专用本地镜像；通过忽略的 env 文件提供 `INCEPT_PHASE4_IMAGE`、`INCEPT_PHASE4_PG_PASSWORD`、`INCEPT_PHASE4_AUTH_KEY`、`INCEPT_PHASE4_RPC_KEY`、`INCEPT_PHASE4_TLS_DIRECTORY`、可选 loopback TLS 端口和 read mode。明确选择唯一 project：

```powershell
docker compose --project-name incept-phase4-local --env-file <isolated-env-file> -f apps/sync-gateway/compose.isolated.yml up -d postgres
docker compose --project-name incept-phase4-local --env-file <isolated-env-file> -f apps/sync-gateway/compose.isolated.yml run --rm migrate
docker compose --project-name incept-phase4-local --env-file <isolated-env-file> -f apps/sync-gateway/compose.isolated.yml up -d app gateway proxy
```

初始化隔离 `/data/home`、空 overrides 及 Owner fixture 后使用。TLS 证书需匹配访问的域名/IP；测试 CA 可通过 Node `NODE_EXTRA_CA_CERTS` 显式信任，禁止关闭证书校验。

## Windows 与网页

Owner 先授权设备/source。在 Windows 以隐藏输入绑定并启用远程：

```powershell
& .\apps\sync-agent\windows\Bind.ps1 -Endpoint 'https://isolated-incept.test' -HomeDirectory 'D:\synthetic-home' -EnableRemote
& .\apps\sync-agent\windows\Start.ps1
```

Token 只经 TLS 首个受限 auth 消息发送，随后由 HMAC 私有 RPC 向 Web 实际鉴权。默认 30 秒心跳、5 秒首次认证上限、消息 4 KiB、100 连接、发送缓冲 16 KiB；未授权/轮换/吊销或认证后发送非白名单消息会关闭连接。Web→Gateway dispatch/status 和反向鉴权都有方法/路径/body digest/时间/随机 nonce 绑定的 HMAC，30 秒窗口及有界重放缓存。

网页仍用原 Refresh now：选择设备 → `POST /api/dashboard/sync/jobs` → bounded poll → 确认提交 → 读取 `minRevision` 对应统计。普通 Owner 有效 session 即可刷新；设备创建/轮换等操作仍需近期验证。离线 Job 立即终止，在线 Job TTL 180 秒；同设备在途任务合并，12/min 的持久触发限额。前台最多等待 180 秒，关闭网页保留任务。

只有服务端确认设备、策略版本、committed receipts、当前 lineage 摘要及新 revision 后才成功。扫描没变化且没有待传、冲突、部分失败时为 `completed_no_change`。partial / review / offline / expired 明确显示。客户端先持久记录 Job，再采集；结果也先落盘后通知，ACK 丢失可按原 Job 重发。旧批次回执可恢复确认，但不会被当作此次新增数据。

## 统一读取与回滚

v2 读取复用 Phase 1 `readSyncView` 和旧 summarizer；不把两个 loader 的统计相加。启用前，使用既有受控维护服务把 v1 不可变批次完整迁移到独立 shadow；精确认领或歧义审阅沿原契约。若 v1 有新批次或 rollback 尚未镜像，读取报 `SYNC_PROJECTION_UNAVAILABLE`，保留旧展示，先同步 shadow。v2 不缓存统计，直接在一致读取中校验最小 revision，价格与映射每次按原规则加载。

默认仍为 v1；若上传 v2 但读取还是 v1/shadow，网页明确显示“已同步到 v2，当前仍显示旧视图”。停用时恢复 read mode=v1、remote enabled 关闭、停止本地 Gateway/Agent；所有旧 Import、Owner/TOTP、Docs/Music 保留。自启安装仍须用户显式确认，本轮不注册任务。

验收命令与真实 WSS/HTTP/SQLite/PG 证据见 `docs/research/sync-agent-phase4-proof.md`。生产上线、768 MiB 整站资源治理与真实代理部署继续单独审阅。

Phase 5 使用正式 Compose 的 `sync` profile，经现有 Nginx 443 的 `/api/sync/ws` 接入，Gateway 无宿主机公开端口。Web/Gateway 共同只读挂载 RPC key 文件；生产模板默认开关关闭、读取 v1。`deployment/compose.sh` 在 remote 开关为 1 时自动启用 profile。心跳只表达采集/上传进度；Job 成功由服务器核验 receipt、lineage 与可读 revision。密钥轮换、单设备 canary 限制和停用命令见 `docs/runbooks/sync-agent-production-rollout.md`。
