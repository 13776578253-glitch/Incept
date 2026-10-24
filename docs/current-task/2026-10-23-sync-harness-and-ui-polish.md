# Sync 事件收尾、水位门禁、托盘 / Dashboard 修复与 20261023 发版

更新：2026-10-24 00:15（Asia/Singapore）。状态：**新镜像 `20261023` 已上线并验证通过；`deepseekHarness` 的开启被一条未执行的 Prisma 迁移卡住，明天执行迁移后即可完成。工作区有 2 个未提交的代码文件 + 本记录。**

## 1. PREFIX_LOST 事件收尾（`fa0af85`）

- 审阅 #21（zcode 9→12）、#22（antigravity 659→679）由 Owner 用 `resolve-review --accept` 接纳为后继代次，revision 684→685；随后四条回执把本地推进到 688。
- 提交内容：`acceptReview` + 4 个守卫（rolled-back lineage / manifest / parent / sequence hash）、agent 审阅与 held 续传、账本水位门禁与 CLI、模型注册表与定价回退。
- 当时的验证：dashboard 559 passed / 2 skipped，`test:ops` 153，typecheck 全套通过。

## 2. 权威账本水位（`87314ba`，已提交）

- `scripts/ledger-watermark.mjs` 支持 `check` / `generate` / `advance`。
- `generate` 拒绝降级（`WATERMARK_DOWNGRADE_REJECTED`）、拒绝覆盖损坏文件、拒绝库里不存在的锚点批次；`--force` 才能重新定基线。
- `check` 额外打印 Revision / Scopes / Tokens / Visible records / Anchor 与各自 floor。
- 新增 `deployment/ledger-watermark.md`；示例文件加“模板，勿拷贝”注释。
- 实测：WAL 账本在各种 `-wal` / `-shm` 组合下只读打开均通过；嵌套 `anchorReceipt` 写法会被门禁**静默忽略**，文档已统一为扁平字段。

### 生产水位现状（重要）

`/srv/incept/shared/sync/ledger-watermark.json` **早已存在**（2026-10-22 15:57 生成，含非标准字段 `schema`/`ledgerSha256`/`updatedBy`，门禁忽略未知字段）：

| 下限 | 当时 | 2026-10-24 实际 | 结论 |
| :--- | ---: | ---: | :--- |
| minRevision | 640 | 689 | ✅ |
| minScopes | 485 | 500 | ✅ |
| minTokens | 7,593,422,326 | 8,047,638,210 | ✅ |
| minVisibleRecords | 46,167 | 49,196 | ✅ |
| anchor | **未钉** | — | 跳过（见下） |

**锚点维度没有被生产文件启用**。为了证明锚点逻辑本身有效，用 `node:sqlite backup` 把生产库快照到 `/tmp/proof/`，配三份临时水位验证（生产文件未改动）：

| 用例 | 结果 |
| :--- | :--- |
| 锚点 = 最新回执 `d449f83b-…` | PASS，`Anchor batch … (verified)`，rc=0 |
| 同批次、hash 改错 | `ANCHOR_PAYLOAD_HASH_MISMATCH`，rc=1 |
| 库里不存在的批次 | `ANCHOR_RECEIPT_MISSING`，rc=1 |

若要生产也启用锚点，需在水位文件里补 `anchorBatchId` / `anchorPayloadHash`（本次按指示未改）。

已知小缺陷：`ledger-watermark.mjs check <db> <watermark>` 的第二个参数只用于打印，门禁仍按「DB 同目录」定位文件。下次构建修掉。

## 3. deepseekHarness 为什么没有数据

- 本机 `config.json` 的 `allowedSources` 只有 7 个来源；`captureHome` 在清单阶段就跳过 `.dsh/sessions`，且不报错。
- 历史上 9 个 harness 会话入账（rev 457–465，全部 committed）。
- 缺口：磁盘 53 个会话中 44 个未入账（约 3,092 条 usage / 5.3 亿 tokens）；`session-7a6aa922…`（当前会话）完全不在账本里。
- 线上镜像曾早于 `815f4d1`（2026-10-20），前后端都没有该来源 —— 20261023 镜像已修复这一层。

## 4. 托盘（`158aa82`，已提交）

- 「已授权来源」只读展示 + 「编辑来源」跳 Dashboard：设备令牌无权扩大自己的采集范围。
- 语言：中文 / English，写入 `tray-settings.json`；修掉 `ThemeManager` 整文件覆写导致主题与语言互相清空的问题（统一走 `TrayPreferences`）。
- 「重启 Agent」：`stop` → 等 daemon 写出 `running:false` → 重试启动直到 supervisor 存活；识别“Agent 以管理员权限运行”并给出提示（`AGENT_UNREACHABLE`，200ms 返回）。
- 反射测试 49 项全过（新增 6 项语言用例）。

## 5. Dashboard / Web（`e45d943`，已提交）

- 单设备时不再显示设备名，改为静态 `同步设备 · 设备在线`；设备下拉箭头改自绘。
- docs 条目表：`Route type` + `Kind` 合并为 `Type`，去掉彩色徽章（`Access role` 同步改纯文本）。
- 设备注册表单：去掉被截断的 v1 UUID 占位符，补名称占位与字段说明；设备卡片删掉冗余句。
- 远程 phase `offline` 改称「远程未响应 / Remote unreachable」，消除 `Online · Offline` 矛盾。
- 概览标题改为「用量构成」；模型吞吐量排行收起时不再把页面滚到标题。
- 同步时间线精简为「采集 / 提交 / 刷新」。
- 新增 `docs-library-table.test.tsx`（列结构、Type 合并、无胶囊、note 追加）。

## 6. 20261023 发版记录

| 步骤 | 结果 |
| :--- | :--- |
| 构建 | `docker build --platform linux/amd64`，tag `incept-v4-release:20261023`，镜像 `sha256:12660041447f…ffe0ac`，1.52 GB |
| 镜像内容核验 | `acceptReview` ×2、`columns.type` / `remote.unreachable` 命中 .next chunk、`/app/scripts/ledger-watermark.mjs` 存在 |
| 传输 | `docker save` → 383.7 MB tar，sha256 `1ae94227…1e3bd`，scp 后服务器校验一致 |
| 载入 | `docker load`，服务器镜像 ID 与本机完全一致 |
| env 变更 | `.env.production` 的 `INCEPT_APP_IMAGE` 换成新 ID；备份 `.env.production.bak-pre-20261023T0005` |
| 切 app | `sh ./deployment/compose.sh up -d --no-deps --wait --wait-timeout 120 app` → Healthy，rc=0 |
| 切网关 | 同上 `sync-gateway`（app 健康后才执行）→ Healthy，rc=0 |
| 验证 | 两容器均 `healthy`、`RestartCount=0`、镜像 ID 一致；`production_configuration_invalid` 0 条；gateway `/healthz` 200；外部 `/api/health/ready` **200**；首页 307；rev 689 未受影响；本地 Agent `remoteOnline=true` |

回滚：`INCEPT_APP_IMAGE` 改回 `sha256:707ec8ab…`（`incept-v4-release:gate-20261022` 仍保留），再跑同样两条 `up -d`。

**注意**：`/srv/incept/current/deployment/compose.sh` 没有执行位，必须用 `sh ./deployment/compose.sh …` 调用。

## 7. 当前阻塞：`BACKEND_UNAVAILABLE` = 缺一条迁移

现象：UI 保存来源返回 `503 BACKEND_UNAVAILABLE`。

根因（应用日志 00:07:28 / 00:07:47）：

```
Invalid `prisma.agentDevice.update()` invocation
PostgresError 23514: violates check constraint "agent_devices_sources_check"
Failing row: {codex,commandcode,claudeCode,geminiCli,antigravity,opencode,zcode,…}
```

- 数据库约束仍只允许 **7** 个来源；仓库里的迁移 `20261020010000_deepseek_harness_source` 把它放宽到 8 个（含 `deepseekHarness`）。
- `prisma migrate status` 确认：**只差这一条**未执行。
- 路由最外层 catch 把任何异常都变成 503 泛化错误（诊断性改进见 §9）。

修复（未执行，等确认）：

```bash
cd /srv/incept/current
sh ./deployment/compose.sh --profile ops run --rm --no-deps migrate
```

预期 `Applying migration 20261020010000_deepseek_harness_source` → `All migrations have been successfully applied`。不需要重启 app。风险低（纯放宽约束，毫秒级 ACCESS EXCLUSIVE 锁）；回滚需先移除设备上的 `deepseekHarness` 再改回 7 来源。

## 8. 明天（2026-10-24）的顺序

1. 执行上面的迁移，并核对 `pg_get_constraintdef` 已含 `deepseekHarness`。
2. 网页端 设置 → 账户 → 同步设备 → `Edit sources` → 勾 `deepseekHarness` → 保存（应成功）。
3. 托盘 → **重启 Agent**（Agent 为普通权限，按钮可用）。
4. 观察首轮采集：`issues` 是否出现 `deepseekHarness:COLLECTOR_INCOMPLETE`；`session-9e520384`（v3+v4 双份）的 `INTERVAL_ISOLATED` 属 prefix 覆盖、不隔离整会话；预计 44 个会话 / 约 3,100 条记录分批上传。
5. 提交 §9 里的 2 个未提交文件（建议单独一个 `fix(web): keep the bind form inside the card and log sync failures`）。
6. 可选清理：`/srv/incept/incoming/incept-20261023.tar`（384 MB）与 `/data/sync/v4-dryrun-*.db`；保留 `v4-preaccept-20261023.db` 作审计。

## 9. 未提交的改动（明天一起提交）

- `apps/web/src/features/settings/account/sync-devices-panel.tsx`：绑定来源那一行改为 `flex w-full flex-wrap + min-w-0 + basis-*`，窄屏换行而不是把「Confirm binding」挤出卡片。
- `apps/web/src/server/sync/next.ts`：兜底 catch 增加 `{"event":"sync_request_failed",name,message}` 日志，避免 503 无法定位。

验证：`web typecheck` 通过；`src/features/settings` 8 个测试文件 39 项通过。

## 10. 环境事实

| 项 | 值 |
| :--- | :--- |
| 服务器 | `root@43.155.136.83`（SSH 走 ssh-agent，密钥 `~/.ssh/incept_ed25519`） |
| 数据目录 | `INCEPT_DATA_DIR=/srv/incept/shared`，容器内 `/data`；账本 `/data/sync/v4.db` |
| 发布布局 | `/srv/incept/current` → `/srv/incept/releases/82c613b`（含 `deployment/`、`scripts/`） |
| env | `/srv/incept/.env.production`（0600，含密钥，勿打印） |
| 代理 | Caddy；覆盖文件 `/srv/incept/compose.content-20261014.yml` |
| 数据库 | `postgres:16-alpine`，库 `incept`，超级用户 `incept_migrator`（容器内 socket 免密） |
| Prisma CLI | 镜像内 `/app/packages/db/node_modules/.bin/prisma`（根 `node_modules/.bin` 不存在） |
| 本地 Agent | 计划任务 `InceptSyncAgent-003492A2A077778A` 启动；重启后托盘未自启（启动快捷方式存在），已手动拉起 |

## 11. 关键命令备忘

```bash
# 迁移（待执行）
cd /srv/incept/current && sh ./deployment/compose.sh --profile ops run --rm --no-deps migrate

# 迁移状态（只读）
cd /srv/incept/current && sh ./deployment/compose.sh --profile ops run --rm --no-deps \
  --entrypoint sh migrate -c "cd /app/packages/db && ./node_modules/.bin/prisma migrate status"

# 生产门禁自检（只读；不修改水位）
docker run --rm -v /srv/incept/shared:/data:ro --entrypoint node <image> \
  /app/scripts/ledger-watermark.mjs check /data/sync/v4.db

# 本地：托盘构建与回归
pwsh -File apps/sync-tray/tools/build.ps1
pwsh -File apps/sync-tray/tools/test.ps1
```
