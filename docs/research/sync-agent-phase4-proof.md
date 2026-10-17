# Incept Sync Agent Phase 4 实施与验收

日期：2026-10-17。工作树：`codex/production-readiness`，起点 HEAD `aef64f45deabfcc379d38829c48dd103557970b0`。依据本轮 Phase 4 连续开发授权实施；Phase 0C/1 的历史资格、adoption、rollback 和 Phase 2/3 的鉴权、outbox 契约继续有效。

**Phase 4 功能开发：PASS。生产发布准入：继续单独审阅。** 已在真实 Windows Agent、独立 Gateway、PostgreSQL、HTTPS/WSS 与完整 Next production 站点中完成远程刷新。生产配置、生产数据库、默认 v1 读取未改；未注册 Windows 登录任务，未进入后续阶段。

结构化结果见 [sync-agent-phase4-evidence.json](sync-agent-phase4-evidence.json)。完整命令输出、初始 status、类型基线、隔离环境文件保存在忽略目录 `.scratch/sync-agent-phase4/`；其中环境文件及测试 TLS 私钥不作为交付附件。

## 1. 实际调用链与默认行为

```text
Owner 有效 session + Origin/CSRF
  → POST /api/dashboard/sync/jobs (202 + durable jobId)
  → PostgreSQL SyncJob / 同设备在途合并
  → HMAC 私有 Gateway RPC
  → 既有 TLS 入口 /api/sync/ws → sync_now(jobId)
  → Windows state.db 先持久保存 Job
  → daemon single-flight → 同一个 SyncEngine.run()
  → 原 HTTPS pages/commit → GET committed receipt → 本地确认 lineage
  → 持久保存 completion → HTTPS complete
  → 服务端核实 device/policy/receipt/current lineage/dataRevision
  → Job terminal → 网页 GET usage?minRevision=N
  → readSyncView → 原 summarizeUsageEvents → 原 Dashboard 图表
```

当前部署代码的默认代理为 Nginx；本轮另建 `apps/sync-gateway/compose.isolated.yml` 和 `nginx.isolated.conf`。专用站点只在 host loopback TLS 18444 提供入口，Gateway/Web/PG 均无 host 发布端口。公网入口对 `/api/internal/sync/*`、`/rpc/*` 返回 404。

`INCEPT_SYNC_ENABLED`、`INCEPT_SYNC_REMOTE_ENABLED` 都需显式打开；`INCEPT_SYNC_READ_MODE` 默认 `v1`。Owner-only `shadow` 返回原 v1 并对账；`v2` 使用统一投影。普通用户/Pro 保留旧权限和读取。原人工 Preview/Commit/rollback、Owner 管理动作近期验证、Docs/Music、Operations 导航保持。Refresh 使用有效 Owner session，不要求每次重新输入密码/TOTP。

云端数据轮询默认 300 秒，配置范围 300–600 秒；页面隐藏暂停、恢复可见后继续。Agent 仍按独立的 300 秒时钟采集。本地未启用远程模式时继续原 `refresh=1`；远程模式的手动刷新先等 Job，再读取统计。v1/shadow 模式完成上传后明确提示“已同步到 v2，当前仍显示旧视图”。

## 2. 持久性、权限与资格

### Job / PostgreSQL

新增 `SyncJob` / `sync_jobs`：Owner/device、请求幂等键、credentialVersion/policyHash、activeKey、状态、TTL/时间、startRevision/dataRevision、completionHash/result/errorCode。迁移为 `20261017020000_sync_jobs`，仅在新建隔离 PG 执行。现存设备 ID 是 TEXT，Job ID 是 UUID，外键及 Prisma 映射据此实现。

- Owner+idempotencyKey 唯一；device 行锁串行创建；非空 activeKey 唯一，使同设备只存在一个在途 Job。SQL CHECK 绑定 activeKey 与 active/terminal 状态。
- TTL 180 秒；离线立即 terminal，不保留上线后执行的陈旧命令。创建限额 12/min/device，轮询请求也执行过期清理。
- queued → dispatched → running → terminal；开始/完成在行锁事务中验证状态，完成 hash 相同可重放，不同 payload 拒绝。
- terminal 区分 completed / completed_no_change / partial / review_required / offline / expired / cancelled / failed。收到 socket 指令不算入库成功。
- 服务端重新验证当前设备凭据/来源策略、committed receipt 的设备/来源、startRevision 之后的变化，以及云端可见 scope 的 lineage 摘要。旧回执可用于恢复，只有新的有效变化才计入本次 changed。
- 吊销/轮换事务取消在途任务；管理控制器立即 kick 旧 socket。Gateway 同时按当前 PG 版本/策略周期核对，鉴权不可用则关闭连接。
- 创建/完成进入现有 SecurityAudit。设备无权调用 Owner Job/管理接口或伪造 Owner actor。

### Gateway / RPC

独立 Node 24 应用复用锁内 Next 16.4.0 的 `compiled/ws`，bundle 后独立运行。TLS 校验正常开启；测试使用匹配 loopback SAN 的测试 CA，并通过 `NODE_EXTRA_CA_CERTS` 信任。Device Token 只经首个受限 auth frame 发送，URL/query/subprotocol/日志均不承载 Token。

限制：100 WS / 128 总连接、5 秒认证超时、4 KiB 消息、16 KiB 发送缓冲、120 消息/min、30 秒心跳；不启用压缩。命令只有 `sync_now`，绑定 jobId、expiry、当前 connectionId。一设备一连接；连接替换、断线、Gateway 重启后在线状态按当前 socket 重新建立。

Web↔Gateway 双向 RPC 使用独立高熵 hex key，签名绑定方法、路径、时间、nonce、body digest；30 秒时窗、timing-safe 比较、有界 4096 nonce 缓存、5 秒请求超时及回复体限制。重放缓存随进程重启清空；命令另由当前连接 ID、durable Job、过期与结果幂等约束。内部接口仅专用网络可达且代理阻断。

### Windows / outbox

`RemoteLink` 复用 Phase 3 DPAPI、单实例 daemon、collector Worker、HTTPS transport 和 durable outbox。`remote_jobs` 保存待执行任务、原 receipt cursor、状态、次数、重试时间及不可变 completion。先落盘再执行；结果先落盘再通知；丢 ACK 按原结果重发。重复 WSS 通知不反复唤醒采集；本地/定时/远程通过同一个 single-flight 调度。

远程连接有退避/抖动、75 秒接收 watchdog、HTTP pending Job 恢复发现。上传暂时中断时保留原 cursor 并在 TTL 内重试；有 pending outbox 时不冻结成功 completion。Agent/Next/Gateway 重启都能恢复。超过 TTL 保留 outbox，由原采集周期继续恢复数据，旧 Job 明确过期。来源解析失败为 partial，历史删减/歧义为 review；旧有效 generation 保留。

### 统一投影

v2 使用 `readSyncView` 一次取得可见事件，复用原 summarizer、pricing、mapping、native 优先与 v1 adoption。采用旧 v1 不可变 membership 的顺序，保持等费用行的原 DTO 排序；顺序键不参与身份或自动认领。没有把 v1/v2 两份统计相加。

启用前须经既有维护 service 完整迁移 v1 shadow。若原 v1 有新批次/rollback 未镜像，checksum/status 检查拒绝陈旧投影并保留旧显示，不在请求 hot path 复制 DB 或偷偷迁移。投影每次读取 revision、价格与映射，不缓存统计；`minRevision` 未可见时失败。rollback 栅栏、未知格式、截断、轮转无桥接、弱身份与历史交叠继续原审阅路径。

## 3. 真实 Windows 与完整站点证据

### 真实 WSS/HTTPS/PG 远程集成：7/7

测试用独立 Gateway 子进程、真实 TLS TCP/WSS、真实 Windows CLI/DPAPI/SQLite/collector Worker、隔离 PG 鉴权；HTTP Owner 为独立客户端。

| 场景 | 结果 |
| --- | --- |
| 七来源 baseline → append；5 次点击合并 | 同一 Job；回执 7 → 14；revision 14；7d/30d/all 均 1820 tokens |
| 未变化 / 同结果 completion 重放 / 不同结果重放 | completed_no_change / 幂等 / 拒绝 |
| completion ACK 丢失 → Agent 重启 | 原 Job 恢复，21 份回执，revision 21，无重复 |
| Gateway 子进程退出重启；Web listener/Worker 重建 | 当前在线先消失，重连并恢复任务 |
| JSONL 半行 / Gemini 历史删减 | partial / review_required；旧可见 2730 保留 |
| 未授权、CSRF、跨设备、伪造 actor、RPC nonce 重放、Token query、过期 | 全部拒绝或过期 |
| 吊销/凭据轮换 | 等待任务取消，旧凭据 401，旧 WSS 断开 |

最终成功 Job `a568ede1-7a8c-415c-bf6c-21ef3fe68f48`：startRevision=7、dataRevision=14、7 份本次 batch 引用，issues/pending/review=0；Windows confirmedScopes=7、outbox=[]。完整脱敏字段见 JSON。

### 完整 production Next + Nginx + Gateway + Windows：1/1

从 frozen 全站产物实际运行 `pnpm --filter web start`；未使用 API harness 代替站点。Windows Agent 经 Nginx TLS/WSS 与独立 Gateway 连接，Owner Cookie 由隔离 fixture 创建、经真实 session/CSRF 鉴权，Token 由实际设备 API 创建并仅经 stdin 绑定。

- Job `a574bb7d-5f66-4b85-9079-62c695eba9ea` completed，revision 9。保留前次 fixture 历史 baseline 910，追加后 7d/30d/all 均 1170；每次查询要求 minRevision=9。
- 新 Job `e8f850cd-891e-463e-8135-92a85e622b40` 在途时实际 `docker restart` Next app 容器；恢复后 completed，revision 10，总量 1300。测试重跑使用不同 session，不删除已提交历史。
- `/en/dashboard`、`/zh/dashboard`、`/en/settings`、`/en/operations`、`/en/docs`、`/en/tools/playback` 全部 200。
- 公网 private RPC 404；无 Owner Cookie 查询 Job 403。真实数据与页面请求经过完整站点。
- UI 行为另由 React 测试验证：Job 终态前不读 usage，终态后传 minRevision，重复触发合并，v1 反馈 stored_v2，隐藏/恢复轮询。此处实际端到端采用独立 HTTP 客户端触发，并非人工浏览器点击验收。

## 4. 正确性与全量回归

所有命令在 Monorepo 根目录执行，特殊 cwd 单列。隔离 PG URL 从忽略文件注入，不将其内容写入报告。

| 精确测试命令 | 最终结果 |
| --- | --- |
| `node apps/web/node_modules/vitest/vitest.mjs run --root packages/dashboard` | 35 文件，455 PASS，含 Phase 0/0B/0C/1/2、旧 Import、refresh 与新增投影 |
| `node apps/web/node_modules/vitest/vitest.mjs run --root apps/web` | 160 PASS，12 显式 skip（需要专用环境的 3 个集成文件，另行运行如下） |
| `node apps/web/node_modules/vitest/vitest.mjs run --root apps/web src/server/sync/__tests__/remote.integration.test.ts --reporter verbose` | 设置 `DATABASE_URL`、`INCEPT_REMOTE_TEST_DATABASE_URL` 为新 `incept_sync_phase4`，设置测试 CA；7 PASS |
| `node apps/web/node_modules/vitest/vitest.mjs run --root apps/web src/server/sync/__tests__/fullsite.integration.test.ts --reporter verbose` | `INCEPT_FULLSITE_PHASE4_URL=https://127.0.0.1:18444`，`INCEPT_FULLSITE_PHASE4_APP_CONTAINER=incept-phase4-01a1447b-app-1`，测试 CA；1 PASS |
| `node apps/web/node_modules/vitest/vitest.mjs run --root apps/web src/server/sync/__tests__/agent.integration.test.ts --reporter verbose` | 专用 `INCEPT_AGENT_TEST_DATABASE_URL` / `incept_sync_phase3`、测试 CA；3 PASS，真实 5 分钟计时 1 skip（沿用 Phase 3 已通过证据） |
| `node apps/sync-agent/tools/build.mjs`；`node --test apps/sync-agent/tests/*.test.mjs` | 12 PASS；含 Windows DPAPI/DACL、脚本默认不安装和新增 transient upload/cursor/ACK 测试 |
| `node apps/sync-gateway/tools/build.mjs`；`node --test apps/sync-gateway/tests/*.test.mjs` | 2 PASS |
| `node apps/web/node_modules/vitest/vitest.mjs run --root packages/music --exclude src/__tests__/cli-smoke.test.ts` | 195 PASS；CLI smoke 沿现有验证方式单独处理 |
| cwd=`packages/music`：`node --import tsx --test 'src/core/__tests__/**/*.test.ts'` | 73 PASS |
| `node apps/web/node_modules/vitest/vitest.mjs run --root packages/roadmap` | 71 PASS |
| `node --test scripts/production-*.test.mjs` | 3 PASS |

Music CLI 单独 smoke 未重跑；未修改 Music。Owner/TOTP 原回归随 Web 全量在独立 `incept_owner_auth_phase4` 数据库运行，安全上传原集成在独立 `incept_sync_phase2` 运行。测试源没有删除断言或改写旧期望。

投影专测 3 PASS：真实旧 loader 是 oracle；跨 45/15/当前天事件、同源重叠双 v1 批次、迁移第二次重放=0、精准 adoption 前后，**7d/30d/all 全对象差异均 0**。对照排除新增 `sync` 元数据和读取时钟 `checkedAt`；成本、model/source/project、trend、provenance、其余元数据与顺序均比较。真实 native collector 与 legacy/v2 同现的优先级对照也通过。陈旧 v1 mirror / 不可满足 minRevision 为明确失败用例。

## 5. 类型、lint、完整构建

专用检查最终均 exit 0：

```powershell
node node_modules/typescript/bin/tsc --noEmit -p apps/sync-agent/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p apps/sync-gateway/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.sync.json
node node_modules/typescript/bin/tsc --noEmit -p packages/dashboard/tsconfig.src.json
node node_modules/typescript/bin/tsc --noEmit -p packages/dashboard/tsconfig.node.json
```

本机完整 Web 检查 `tsc --noEmit -p apps/web/tsconfig.json`：旧/新均 111 条，按文件位置+TS code 比较新增/消失均 0，完整原始文本逐行差异也为 0。Dashboard `tsc --noEmit -p packages/dashboard/tsconfig.json`：旧/新均 36 条，完整诊断逐行差异 0。脱敏摘要在 evidence JSON；原始诊断保留 `.scratch`。本机 Prisma JS/types 已生成，随后相同 engine DLL 因占用出现 EPERM；未终止其他 Agent/服务，干净 Linux 环境完整生成及全部类型检查通过。

变更 lint exit 0。实际命令为以下数组展开；从仓库根指定原 Web ESLint 配置，仅关闭与这些 Node/跨包路径无关的 `no-html-link-for-pages`：

```powershell
$lintFiles = @(
 'apps/sync-gateway/src','apps/sync-gateway/tools','apps/sync-gateway/tests',
 'apps/sync-agent/src','apps/sync-agent/tests','apps/web/src/server/sync',
 'apps/web/src/app/api/internal/sync','apps/web/src/app/api/dashboard/usage/route.ts',
 'apps/web/src/features/settings/account/sync-devices-panel.tsx','apps/web/next.config.ts',
 'packages/db/src/agent/jobs.ts','packages/db/src/agent/index.ts','packages/db/src/client.ts',
 'packages/dashboard/src/sync','packages/dashboard/src/react/hooks/remote-refresh.ts',
 'packages/dashboard/src/react/hooks/use-dashboard-window.ts',
 'packages/dashboard/src/react/components/dashboard-toolbar.tsx',
 'packages/dashboard/src/react/token-dashboard-feature.tsx','packages/dashboard/src/next/dashboard-page.tsx',
 'packages/dashboard/src/domain/types.ts','packages/dashboard/src/__tests__/remote-refresh.test.tsx',
 'packages/dashboard/src/__tests__/phase2/projection.test.ts',
 'packages/dashboard/tools/phase4/seed.mjs','packages/dashboard/tools/build-runtime.mjs')
node apps/web/node_modules/eslint/bin/eslint.js --config apps/web/eslint.config.mjs --rule '@next/next/no-html-link-for-pages: off' @lintFiles
git -c core.fsmonitor=false diff --check
```

干净构建：Node **24.21.0**、pnpm **10.30.3**、Next **16.4.0**。`packages/dashboard/tools/phase4/{snapshot.py,fullsite-build.sh}` 只打包源码，不带 `.env`/日志/凭据/真实数据。隔离构建复用 Phase 2E 镜像内锁定 store：

```sh
NODE_ENV=development pnpm install --offline --frozen-lockfile --ignore-scripts --store-dir /phase2e-store
pnpm db:generate
pnpm --filter @incept/dashboard build:runtime
pnpm --filter @incept/sync-agent build
pnpm --filter @incept/sync-gateway build
pnpm --filter web typecheck
pnpm typecheck
pnpm --filter @incept/sync-agent typecheck
pnpm --filter @incept/sync-gateway typecheck
pnpm build
```

559 个包复用，下载 0；全部检查及正式 Next build exit 0，保留原构建检查。安装前后锁 hash 同为 `240858d8599a922a6f252cd0783e0b8c1337a26ef40c8667a5ec8c5012143a01`。本轮仅为 Gateway 增加既有 Next 固定版本的 workspace importer，没有新增外部包版本。全站产物含页面、路由、独立 collect/sync Worker、完整 tracing。最终 Agent 的 transient upload 修复晚于全站快照；Windows 最终 bundle 重新 build/typecheck/12 测试，并用于上面的完整 production 站点实测；Web/Gateway 运行时代码与完整构建快照一致。

构建 evidence 在 `.scratch/sync-agent-phase4/build-final-evidence/`；本地镜像 `incept-sync-phase4:local-01a1447b`，未推送。隔离启动精确命令见 Gateway README，验收 project 为 `incept-phase4-01a1447b`；环境变量只在忽略的 `compose.env` 注入。

## 6. 资源记录与失败处理

本轮只记录轻量功能验收，不重跑 70k/768 MiB 极端基准。实际 cgroup v2 采样：

| 独立容器 | current MiB | peak MiB | memory.max MiB | OOM kill |
| --- | ---: | ---: | ---: | ---: |
| Gateway | 31.09 | 39.75 | 128 | 0 |
| App | 159.64 | 191.91 | 768 | 0 |
| PostgreSQL | 41.53 | 45.96 | 256 | 0 |
| Nginx | 10.81 | 15.08 | 64 | 0 |

App peak 的区间从测试中的 Next 容器重启算起。独立 Windows Gateway 子进程 RSS 73,232,384 bytes，Agent 心跳 RSS 75,874,304 bytes。CPU/负载基线仍沿 Phase 2E，不将此次轻负载样本替代上线容量验收。Phase 2E 的极限内存余量继续作为生产资源治理事项。

实施中的实际失败及修复：

- 首次 Job 外键误用 UUID，现存设备列为 TEXT；修正 schema/migration，failed migration 仅在专用 PG resolve，最终全新 Compose PG 从头迁移通过。
- projection 引入 collector 的 `server-only` marker 导致 Worker 启动失败；显式 Node worker bundle 处理 marker 后通过真实线程与全站测试。
- Next 内置 ws 的 ESM bundle 需要 `createRequire`/`__dirname`；修正打包后独立子进程运行通过。
- 重复命令曾反复唤醒已持久 Job；改为仅新插入通知，断 ACK/重试证明无重复采集计数。
- 完整站点镜像继承 shell entrypoint、仅 internal 网络的代理无法接收 loopback 发布请求；本地 Compose 显式 entrypoint 和仅代理 ingress 网络修正后真实 TLS/WSS 通过。
- 首次并行构建 I/O 时旧 100 次重试用例触及其 5 秒测试上限；未改旧用例，空闲后原 Web 全量命令重跑 160 PASS。
- lint 首次从 Web cwd 引用外部包路径被忽略；改为仓库根+原配置，最终 exit 0。测试 fixture 的排序/时钟差异以旧真实 loader 逐项定位，并修正投影兼容排序/更新时间；保留旧断言。

## 7. 本轮文件与并行修改保护

| 范围 | 新增/调整 |
| --- | --- |
| Gateway 独立应用 | `apps/sync-gateway/{package.json,tsconfig.json,README.md,compose.isolated.yml,nginx.isolated.conf,src/*,tools/build.mjs,tests/gateway.test.mjs}`；lock 新 importer |
| PG Job | `packages/db/prisma/schema.prisma`、新 Job migration、`src/agent/jobs.ts`、`src/agent/index.ts`、client schema revision |
| Web 调用层 | `apps/web/src/server/sync/{remote,next,controller,usage}.ts`、internal sync route、usage route、next tracing、device panel、remote/fullsite integration 测试 |
| Worker / 投影 | `packages/dashboard/src/sync/{rpc,projection,protocol,worker-entry,executor,index}.ts`、`tools/build-runtime.mjs` |
| Windows Agent | `src/{remote,state,engine,cli}.ts`、Bind.ps1、README、`tests/agent.test.mjs` |
| Dashboard | domain sync 元数据、SSR page、原 toolbar/feature/hook、remote-refresh helper、中英消息、remote-refresh 和 projection 测试 |
| 可复现工具 / 证据 | `packages/dashboard/tools/phase4/{snapshot.py,fullsite-build.sh,seed.mjs}`；本报告和 evidence JSON |

开始时的完整 `git status` 已保存。未 reset/stash/提交；Operations 目录、site-header、navigation、Owner account panel 等并行成果保留。生产 `deployment/`、Owner/TOTP 运行时代码、Docs/Music 业务未修改。隔离 fixture 的 Cookie/Token 不写提交文件或公开日志；打包仅便携 bundle、脚本和 README。

## 8. 运行、回滚和下一步

配置说明见 [Gateway README](../../apps/sync-gateway/README.md) 与 [Windows README](../../apps/sync-agent/README.md)。本地启用 remote/read v2 时必须使用新 SQLite、隔离 PG、测试 TLS；先 Owner 授权 device/source，再在 Windows `Bind.ps1 -EnableRemote`，手动 Start。`status` 显示 remoteOnline、最后 Job、采集/上报时间；无需安装计划任务即可验收。

回滚：Web remote flag 关闭、read mode 恢复 v1、停止独立 Gateway/Agent。保留 PG Job/审计、v1/v2 SQLite 和 Windows state/outbox；不删除持久数据或回放旧批次绕过 rollback 栅栏。新增 PG migration 本轮只存在于隔离数据库。

便携产物为 `.scratch/sync-agent-phase4/incept-sync-agent-win-node24.zip`，SHA256 `95725adffae0bb643e89d427352a63861f9b9a7ac72c8bc224cb7f98b2d15e60`。仅包含 `dist/agent.mjs`、`dist/collect-worker.mjs`、Windows 脚本及 README，无本地状态或凭据。

本轮标签化测试服务已停止，测试 Agent 残留进程为 0，镜像、卷和忽略的 evidence 保留供审阅重现。下一步由用户/规划 AI 审阅 Phase 4 后决定：生产密钥/TLS/网络配置、migration 角色、限额/Job TTL 的部署参数、768 MiB 资源治理及人工浏览器产品验收。历史审阅继续使用原 Phase 1 维护 service；本轮未新增绕过审阅的自动恢复入口。

**结论：Phase 4 功能开发 PASS；生产发布继续单独验收。**
