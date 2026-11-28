# Incept P1-3 隔离恢复演练、旧配置权限复核与回退清单

- **执行时间**：2026-11-28 17:10–17:12 UTC+8
- **演练对象**：已验证离机快照 `d5ef31712ac46e42459f6e358cbf171cbb1cafa38a8fab8fe152366df430ee3b`（仓库 `rclone:gdrive:Incept-Backups-v2`，对应 2026-11-28 03:05 完整本机备份 `2026-11-27T19-05-03.067Z-96629b37-ed67-42d3-89a6-70ea29b750c7`）
- **隔离边界**：独立目录 `/srv/incept/drills/p1-3-restore-drill`（`0700`）、独立 Compose project `incept-drill`、独立 PG 卷 `incept_drill_postgres_data`、仅绑定回环端口 `127.0.0.1:13099`，全程未触碰线上 `incept` 四个容器、线上 PG 卷、`/srv/incept/shared` 及 80/443 端口；演练结束后已完整清理并复核线上 4 容器持续健康。

---

## 1. 隔离恢复实测耗时与验收结果

端到端总演练耗时（含双镜像切换验证）：**165.1 秒（2 分 45 秒）**；单版本恢复至服务就绪的实际 **RTO**（Phase 1 + 2 + 3 + 4 + 5）：**约 89.6 秒（1.5 分钟）**。

| 阶段 | 执行内容 | 实测耗时 | 验收结果 |
| --- | --- | ---: | --- |
| Phase 1 · 离机拉取与校验 | `restic restore d5ef3171 --target ... --verify`（从 Google Drive `Incept-Backups-v2` 拉取 340 项 / 994.030 MiB 并逐文件哈希校验 315 文件） | **52.54 s**（恢复 40 s + 校验 2.92 s + 启动） | PASS，零 403/重试 |
| Phase 2 · 清单与哈希核验 | 核对 `database.dump`、`auth-key.json` SHA-256 与 `manifest.json` 及 `latest-offsite-receipt.json` 一致；检查 `data/`、`caddy/`（25 项）完整 | **0.30 s** | PASS |
| Phase 3 · 独立 PG16 恢复 | 启动空 `postgres:16-alpine`（确认 public 表 = 0），`pg_restore --no-owner --no-privileges --exit-on-error` + 授予 `incept_app` DML/序列权限 | **7.18 s** | PASS，恢复 31 张表、25 条 Prisma 迁移（最新 `20261123120000_add_docs_home_curation`），`docs_documents=22`、`music_tracks=12`、`roadmap_entries=23`、`agent_devices=1`、`owner_accounts=1` |
| Phase 4 · V4 / 水线 / 计费 / Owner 密钥 | 运行 `ledger-watermark.mjs check`、4 个 SQLite `PRAGMA quick_check`、使用恢复的 `auth-key.json` 对 `owner_accounts.totpCiphertext` 执行 AES-256-GCM 解密并验证 RFC 6238 TOTP 生成 | **17.37 s** | PASS（详见下文） |
| Phase 5 · 当前镜像启动与业务验收 | 以 `incept-v4-release:20261127-ac6a37d` 启动隔离 `app` + `sync-gateway` 并验收健康、Guest/Owner Usage、Owner 登录链路与设置页 | **12.25 s** | PASS |
| Phase 6 · 上一镜像回退兼容验收 | 将隔离栈切换为 `incept-v4-release:20261127-d128e3c`（共享同一份恢复后的 PG 与 `/data`）复验全部端点 | **12.15 s** | PASS |

### 关键数据核对明细

- **V4 账本与水线门禁**（`ledger-watermark.mjs check`）：
  - `Revision`: **4591**（水线下限 `4520`）
  - `Scopes`: **1,168**（下限 `1,157`）
  - `Tokens`: **18,624,877,695**（下限 `18,506,021,349`）
  - `Visible records`: **105,977**（下限 `105,456`）
  - 水线文件模式 `600`，`PRAGMA quick_check` = `ok`
- **Managed Billing**：
  - `managed-r4520.db`、`catalog-r4520.db`、`imports.db` 全部 `PRAGMA quick_check` = `ok`
  - `managed-r4520.db` `billing_checkpoint` 位于 revision **4591**（`asOf: 2026-11-27T16:57:56.203Z`），`all` 窗口 105,977 条 / 18,624,877,695 Tokens / `estimatedCostUsd = $3,455.48`，`30d` 窗口 `estimatedCostUsd = $1,192.81`
- **Owner 登录与 TOTP 解密**：
  - 使用离机恢复出的 `auth-key.json` 成功解密 `owner_accounts.totpCiphertext`（AES-256-GCM，AAD `incept-owner-totp-v1`），还原出 32 位合法 Base32 密钥并通过 RFC 6238 6 位动态码生成校验
  - `passwordHash` 保留 `scrypt:32768:8:3` 完整格式；隔离实例上 `POST /api/auth/owner/login` 正确验证并返回 `401`（错误口令拒绝）；使用隔离库写入的临时 `access_sessions`（`incept-access-session`）访问 `/zh/settings`（200，渲染 Owner 管理控制区）与 `/api/dashboard/usage?range=30d`（200，返回 `sync.dataRevision = 4591`）；访客模式 `/api/dashboard/usage?range=30d` 返回 200（`7,512,181,632` Tokens，不暴露内部 `sync` 字段）
- **演练发现的运维注意事项**：
  1. `/tmp` 在生产主机上是 **971 MiB tmpfs**，离机恢复解压后约 1 GiB，恢复演练与正式灾备**不可**将 `--target` 放在 `/tmp`，应使用 `/dev/vda3` 上的私有目录（如 `/srv/incept/drills/...` 或独立恢复盘）
  2. 当前离机备份启用了 `stagedUncompressed: true`（`INCEPT_OFFSITE_STAGE_DIR=/srv/incept/.restic-stage`），`restic restore` 还原出来的是已解包的 `data/`、`caddy/` 目录以及 `database.dump`、`auth-key.json`、`manifest.json`（而非 `data.tar.gz` / `caddy.tar.gz`），恢复时直接核验 `database.dump` 与 `auth-key.json` SHA-256、对 `data/` 执行 `chown -R 1000:1000` 并 `pg_restore` 即可

---

## 2. 回退清单（镜像、账本、水线与计费版本映射）

| 发布角色 | 镜像标签 | 完整镜像 ID（SHA-256） | 存在位置 | 对应 Release 目录 | 对应 V4 账本 Revision | 对应水线下限 (`minRevision`) | 对应计费版本 (`publication` / `managed` / `catalog` / `mappings`) | 配套回退数据位置 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **当前线上** | `incept-v4-release:20261127-ac6a37d` | `sha256:c55152e7f50f7091329a7a4a4f33d4abed61217bf0ce33fa70f90aa9956c3794` | 生产主机 + 本机 Docker | `/srv/incept/releases/20261127-ac6a37d`（`current`） | 当前实时 `4615`（今晨备份 `4591`） | `4520`（scopes `1157`, tokens `18,506,021,349`, visible `105,456`） | `owner-r4520.json` / `managed-r4520.db` / `catalog-r4520.db` / `mappings-20261126.json` | 实时 `/srv/incept/shared`；整站备份 `2026-11-27T19-05-03.067Z-...` + 离机快照 `d5ef3171` |
| **上一版本（已验证可无损回退）** | `incept-v4-release:20261127-d128e3c` | `sha256:ddc7fe8bff1f61aa1d416739e9ef45238261c2b754a06defae605c08ad8a37a3` | 生产主机 + 本机 Docker | `/srv/incept/releases/20261127-d128e3c` | 与当前库完全兼容（已在隔离演练 `rev 4591` 实测通过） | `4520`（同上） | `owner-r4520.json` / `managed-r4520.db` / `catalog-r4520.db` / `mappings-20261126.json` | 仅需切镜像与 `current` 指针，保留最新 PG 与 `/srv/incept/shared` |
| **Wave 2 上线初版** | `incept-v4-release:20261126-5e531ca` | `sha256:2cc987c171f461156b39a689b3ff625daa84525d96558b2da35eac6dbb584be8` | 本机 Docker（生产已清理镜像，需 `docker save/load` 补传） | `/srv/incept/releases/20261126-5e531ca` | `4520`–`4591` | `4520` | `r4520` + `mappings-20261126.json` | `/srv/incept/.env.production.before-d128e3c` |
| **Wave 2 前基线** | `incept-v4-release:20261126-fe7a5f7` | `sha256:b14ec57d4dd01d6f39d628bcc230ca4a06ba3be245c3b89d121dd5f05d27fc6a` | 本机 Docker（需 `docker save/load` 补传） | `/srv/incept/releases/20261126-fe7a5f7` | `4508`（scopes `1150`, tokens `18,390,022,740`, visible `104,852`） | `4508` | `owner-r4508.json` / `managed-r4508.db` / `catalog-r4508.db` / `mappings-20261126.json` | `/srv/incept/backups/release-wave2-20261126-20261126T162506Z/`（含 `v4.db`、`ledger-watermark.json`、`env.before`、`billing-r4508/`） |
| **Wave 1 前基线** | `incept-v4-release:20261119-hotfix2` | `sha256:2d827fed3f279e3892431b399f7ca7464d46f353a1ddd1826d23116a9a29d1ad` | 本机 Docker（需 `docker save/load` 补传） | 无单独目录（需结合对应 git 提交） | `4376`（scopes `1018`, tokens `17,407,832,116`, visible `96,510`） | `640`（`ledger-watermark.json`） | `owner-r3746.json` / `managed-r3746.db` / `catalog-r3746.db` / `mappings-20261119.json` | `/srv/incept/backups/release-20261126-20261126T085656Z/`（含 `postgres.dump`、`v4.db`、`imports.db`、`ledger-watermark.json`、`owner-r3746.json`、`env.before`） |

**基础设施固定镜像**：
- `postgres:16-alpine`：`sha256:4e6e670bb069649261c9c18031f0aded7bb249a5b6664ddec29c013a89310d50`
- `caddy:2.11.7-alpine`：`sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f`

> **边界提示**：`shared/dashboard/billing/` 当前仅保留 `r4520` 文件；若需回退至 Wave 2 前（`r4508`）或更早版本，必须同步从对应的 `backups/release-*/` 目录恢复配套 `v4.db`、旧 `ledger-watermark.json` 与对应计费文件，切勿将旧 `v4.db` 与 `minRevision: 4520` 的现用水平线混用。

---

## 3. 旧 staging 配置可读范围复核与密钥轮换决策

### 实测权限与登录审计结果

1. **已移除的 `0644` 文件**：`/srv/incept/.staging-app.env.raw` 与 `/srv/incept/.staging-app.env.clean` 已确认不存在（`stagingRawExists: false`, `stagingCleanExists: false`）。
2. **残留文件**：`/srv/incept/.staging-app.env`（创建于 10-18，权限 `0600 root:root`）仍在 `/srv/incept`，其 `INCEPT_AUTH_ENCRYPTION_KEY` SHA-256 前缀（`cfe69d53198b`）与当前 `/srv/incept/.env.production` 一致，但仅 `root` 可读。
3. **主机账号与 SSH 登录边界**：
   - 可登录 Shell 账号仅有 `root`（`uid=0`）与 `lighthouse`（`uid=1000`）；系统用户 `incept`（`uid=999`）为 nologin。
   - `sshd -T`：`PermitRootLogin without-password`、`PubkeyAuthentication yes`、`PasswordAuthentication no`。
   - `/home/lighthouse` 下**不存在 `.ssh` 目录**；`docker`、`sudo`、`adm`、`incept` 组均无非 root 成员。
   - 审阅全部 systemd journal SSH 认证记录（共 2,439 次 `Accepted`）：**100% 为 `root` 使用同一枚管理员 Ed25519 公钥**（`SHA256:p4i7DVzoJYiRnBSeOIVWXuMszi7EpORL7RgBw/Yj9J4`）登录，无任何其他用户或未知公钥成功登录。
4. **容器挂载边界**：
   - 四个运行容器仅挂载 `/srv/incept/shared`、`/srv/incept/secrets`、`/srv/incept/import-20261014/caddy` 与单个 `Caddyfile`，**均未挂载 `/srv/incept` 根目录**，容器内进程在历史暴露窗口内同样无法访问 `/srv/incept/.staging-app.env.{raw,clean}`。

### 密钥轮换结论

- **判断**：尽管两份已删除文件历史上曾为 `0644` 且 `/srv/incept` 为 `0755`，但主机上不存在其他具备登录能力的非 root 用户、无外部/容器可读挂载、无任何异常 SSH 会话，**无泄露迹象，不需要紧急停机轮换 `INCEPT_AUTH_ENCRYPTION_KEY`**。
- **建议动作**：
  1. ~~清理无用的 `/srv/incept/.staging-app.env`~~：**已于 2026-11-28 17:18 确认无引用后删除**（`/srv/incept/.staging-app*` 已清空，线上 4 容器健康）；`/srv/incept` 下过旧的 `.env.production.bak-*` 纳入 P3 清理。
  2. 若未来计划做预防性定期轮换，按受控流程执行：在维护窗口生成新 64 位十六进制密钥，重加密 `owner_accounts.totpCiphertext`（或通过 `pnpm auth:owner` + Aegis 重绑）并同步更新 `.env.production`，同时保留历史备份包内对应的原 `auth-key.json` 以便恢复旧快照。

---

## 4. 监控与告警扩展（代码已落地，待配置接收通道上线）

已在仓库扩展监控与告警链路并补齐测试：
- `scripts/production-monitor-proxy-log.mjs`：通过 systemd `ExecStartPre=+` 以 root 只读提取近 15 分钟 `incept-proxy-1` 日志中 `/api/dashboard/sync` 与 `/api/dashboard/sync/*` 的 `504` 计数，输出脱敏摘要至 `/srv/incept/monitor/sync-proxy-504.json`（不向 `incept` 用户开放 Docker socket）。
- `scripts/production-monitor.mjs`：覆盖五类探针——`health`（HTTPS `/api/health/ready`）、`disk`（剩余空间 `< 15%`）、`backup`（本机最新清单与离机最新已验证回执超时，默认 26h 以兼容 03:00–03:05 抖动与 ~5m 上传）、`sync_504`（近 15 分钟内出现同步 504 或采集器陈旧）、`snapshot_lag`（对比 `v4.db` `data_revision` 与 `snapshots.json` `sync.revision`，允许正常短暂重建，滞后超 300s 告警）。
- `scripts/production-alert.mjs`：允许 `sync_504`、`snapshot_lag` 事件类型，保持无隐私诊断字段与幂等 `eventId` 去重，并新增可选 `INCEPT_ALERT_WEBHOOK_FORMAT`（支持 `json` / `ntfy` / `feishu` / `bark` / `discord` / `slack`）。
- 生产部署时需同步修正 `/srv/incept/shared` 的 ACL mask（当前 `getfacl` 显示 `user:incept:r-x #effective:---`）以允许 `incept` 用户只读探测 `v4.db` 与 `snapshots.json`。
