# Incept Windows Sync Agent

Windows 当前登录用户的便携 Node.js 应用。默认每 300 秒扫描一次，复用 Dashboard 的七来源 collectors，通过 HTTPS 上传 v2 manifest/分页数据。Dashboard 的默认 v1 读取与人工 Import 保持原状。

## 构建与绑定

需要 Windows、Node.js `>=24.15.0 <25`，以及仓库锁定的 pnpm `10.30.3` 构建环境。已有依赖时，从 Monorepo 根目录执行：

```powershell
node apps/sync-agent/tools/build.mjs
```

便携目录包含 `dist/agent.mjs`、`dist/collect-worker.mjs` 和 `windows/`。在目标 Windows 上运行这些产物仅需 Node 24，无需运行时安装 npm 包。测试用 `library.mjs` / `test-fixtures.mjs` 无需分发。

在 Windows 构建机上生成不包含状态、凭据或日志的发布 ZIP：

```powershell
node apps/sync-agent/tools/package-windows.mjs
```

输出为 `apps/sync-agent/dist/package/incept-sync-agent-win-node24.zip`，命令同时打印 SHA256。

以下命令以 Monorepo 根目录为工作目录；若使用交付 ZIP，在解压目录运行时将 `apps/sync-agent/` 前缀去掉，例如 `node dist/agent.mjs status`、`& .\windows\Start.ps1`。

先在**隔离测试站点**显式开启 `INCEPT_SYNC_ENABLED=1`，配置全新、独立的 `INCEPT_SYNC_DATABASE_FILE`，并运行现有 PostgreSQL 迁移与 Dashboard worker 构建。保持 v1 store 独立。Owner 在 Settings → Token 同步设备中验证身份、选择来源并登记设备；已有 v1 身份需使用原设备 UUID，历史重叠随后走审阅。

使用 HTTPS 地址绑定，Token 通过隐藏输入框进入子进程 stdin：

```powershell
& .\apps\sync-agent\windows\Bind.ps1 -Endpoint 'https://isolated-incept.test' -HomeDirectory 'D:\synthetic-home'
node apps/sync-agent/dist/agent.mjs run-once
node apps/sync-agent/dist/agent.mjs status
```

`-HomeDirectory` 应指向已授权的来源 HOME；上例只使用合成目录。默认状态目录为 `%LOCALAPPDATA%\Incept\sync-agent`，可用脚本 `-StateDirectory` / CLI `--state` 指定仓库外的专用目录。状态目录拒绝 Git 仓库及根目录符号链接，Windows DACL 仅授权当前用户；设备 Token 以 CurrentUser DPAPI 密文保存。URL、参数、日志和 config.json 均不保存 Token。

凭据轮换后，对相同 endpoint/device/HOME/state 重新运行 Bind.ps1。切换设备或 HOME 必须使用新的 state，原 outbox 保留用于恢复。DPAPI 密文依赖原 Windows 用户和系统密钥；恢复时保留完整状态目录。

## 手动运行与自启

```powershell
& .\apps\sync-agent\windows\Start.ps1
node apps/sync-agent/dist/agent.mjs sync-now
node apps/sync-agent/dist/agent.mjs status
& .\apps\sync-agent\windows\Stop.ps1
```

`Start.ps1` 隐藏启动 supervisor；daemon 使用 OS named pipe 保证单实例，崩溃后由 supervisor 以有界退避恢复。`stop` 中止网络等待、停止采集 Worker，保留持久 outbox。系统休眠后恢复时，下一次 tick 按墙钟时间判断是否到期。`sync-now` 是本地命令，多个等待请求合并为一次采集。

以下命令默认只显示说明，实际注册/移除登录任务需要用户主动添加确认参数：

```powershell
& .\apps\sync-agent\windows\Install.ps1
# 用户确认后：Install.ps1 -ConfirmInstall
& .\apps\sync-agent\windows\Uninstall.ps1
# 用户确认后：Uninstall.ps1 -ConfirmUninstall
```

任务限当前用户登录态、普通权限、隐藏窗口和 IgnoreNew；不更改机器级执行策略。卸载停止本 Agent、移除归属匹配的任务，保留 outbox 和凭据供恢复。本轮验收没有注册计划任务。

## 持久性与诊断

- `state.db`：WAL + FULL 同步；不可变待传批次、分页记录、计划父版、已确认 lineage、回执和本地命令。
- 每页最多 500 条 / 512 KiB；仅云端匹配的 **committed receipt** 经再次 GET 验证并在本地事务落盘后，才推进已确认 lineage、清理对应 outbox。
- 网络/5xx/429 保留原批次并退避，下次采集周期或 `sync-now` 续传。暂存过期仅在服务端明确报告后更换 batch ID；manifest 身份保持。401 保留数据，重新绑定有效凭据后继续。
- 历史删减、父版冲突、歧义修订、v1 adoption 等进入 review，旧云端 generation 保留；本地 review 及其后继不会自动推进。Owner 应通过既有 Phase 1 审阅/维护 service 处理；本应用不提供绕过栅栏的“清空重试”。
- `status` 输出采集、上报、确认、最后错误时间、outbox 数量、确认 scope 数和心跳；日志只有时间/固定错误码，滚动上限约 2 MiB。退出码：0 成功或重复启动，1 命令/配置失败，2 单轮结束仍有待传或审阅批次。
- Worker 超时 45 秒、V8 old heap 256 MiB；源文件 256 MiB、单轮输入 512 MiB、单 generation 128 MiB、本地待传记录 256 MiB 的固定保护。超限保留历史并报告，后续资源治理可将其改为可配置的流式预算。

当前证明自动接受：七来源正常追加、受控 Codex 累计修订及已有规则允许的原生键更新。压缩归档、换库、无桥接轮转、Antigravity BLOB/alias 变化、弱身份覆盖、未知格式与版本沿审阅规则处理。首次完整读取标记 `baseline-observed`，随后由父 manifest 和持久回执形成 `since-enrollment` 连续性。

## 测试

```powershell
node apps/sync-agent/tools/build.mjs
node --test apps/sync-agent/tests/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit -p apps/sync-agent/tsconfig.json
```

真实 HTTPS/PG/Windows 生命周期验收位于 Web 的 `src/server/sync/__tests__/agent.integration.test.ts`，需要专用 `incept_sync_phase3` 数据库、迁移及 `.scratch/sync-agent-phase3/tls/` 测试 CA。以 `NODE_EXTRA_CA_CERTS` 信任该 CA；不关闭 TLS 校验。设置 `INCEPT_AGENT_FIVE_MINUTE_TEST=1` 执行真实五分钟定时测试。环境 URL、Owner key、Token 均由隔离环境注入，禁止提交。

Phase 4 已接入 Gateway/WSS、持久远程 Job、吊销连接及网页 Refresh 联动。使用 `Bind.ps1 -EnableRemote` 或 CLI `bind --remote` 显式启用；默认保持原本地模式。远程 Job 先保存到 `state.db`，执行复用同一 `SyncEngine.run()`；上传暂时失败时，在 Job TTL 内保留原 cursor 续传，完成后才上报结果。详见 `apps/sync-gateway/README.md` 和 `docs/research/sync-agent-phase4-proof.md`。

## Phase 5 灰度与历史审阅

首批限定一台经 Owner 授权的设备，云端新批次上限 20,000 条。429/503 依 Retry-After 延后，原 outbox 保留。完整部署、备份、影子对照与回滚命令见 `docs/runbooks/sync-agent-production-rollout.md`。

Agent 停止后，可用 `node dist/agent.mjs export-review --batch BATCH --state STATE` 导出仅含派生用量的私有审阅文件，交给 Owner。Owner 核对设备、来源、manifest 和 legacy 批次后执行维护 CLI 的 `adopt-exact` 或 `adopt-reviewed`。随后用 `node dist/agent.mjs resume-reviewed --batch BATCH --confirm-reviewed --state STATE` 恢复：只有服务器当前 head 与 committed receipt 都匹配，才推进 lineage。回滚栅栏和不匹配 head 继续阻止恢复。审阅文件属于私有数据，用后妥善清理。

ZIP 含 `dist/`、`windows/` 和本说明；目标 Windows 需 Node 24.15–24.x，不需 npm 安装。解压至固定用户目录后运行 `windows/Bind.ps1 -EnableRemote`、`windows/Start.ps1`，以 `node dist/agent.mjs status` 核查。登录自启仅在用户明确执行 `windows/Install.ps1 -ConfirmInstall` 时安装。
