# Phase 3 实施与验收

日期：2026-10-17。结论：**PASS（本地 Windows 功能验收）**。

按本轮授权完成 Windows Agent、设备/source 授权后的受控自动登记、持久上传和生命周期。Phase 2E 的 768 MiB 极限负载余量列入上线前资源治理。本轮使用合成 HOME、独立 SQLite、专用本地 PostgreSQL 和测试 HTTPS；生产触碰：**否**。未安装 Windows 登录任务，未进入 Phase 4。

## 实施结果

| 项目 | 结果与实际行为 |
| --- | --- |
| Windows 应用 | `apps/sync-agent`；Node 24 ESM 便携双 bundle，无运行时 npm 依赖安装 |
| 七来源 + fallback | 调用真实 collectors；一致 SQLite snapshot、JSON/JSONL 完整解析、读前后/目录稳定性检查；单来源半写保留旧版本，其余来源继续 |
| 定时/本地命令 | `daemon` 每 300 秒检查采集；`run-once`、`sync-now`、`status`、`stop`、`bind`、`supervise` 可运行；采集单飞 |
| Windows 生命周期 | named pipe 单实例、正常退出、退出时停止采集 Worker、supervisor 有界崩溃重试、父进程消失检测；实际 Start/Stop.ps1 已执行验证 |
| 登录自启 | 当前用户、普通权限、Hidden/IgnoreNew 的安装/卸载脚本；默认 dry run，实际注册要求显式 `-ConfirmInstall` |
| 安全绑定 | HTTPS `/agent` 校验真实设备，隐藏输入/stdin，CurrentUser DPAPI + 当前用户 DACL；Token 不进入参数、URL、config 或日志 |
| Durable outbox | SQLite WAL/FULL，完整计划父链与分页持久化；只有校验通过且再次 GET 确认的 committed receipt 才原子推进 confirmed lineage |
| 自动登记 | 服务端从真实设备身份生成 canonical origin，设备仅提交 source/session；限 allowlist、全局归属、历史检查、配额、事务审计与幂等 admission receipt |
| 历史保护 | 截断/删除/弱身份覆盖/v1 重合保留上一 generation；review 阻断对应后继；rollback fence 与 Phase 1 判定继续生效 |

每轮扫描来源以发现晚到历史；只为变更的 session 建立新 generation。上传采用 Phase 1 的完整 session observation 分页契约，服务端复用不可变 observation；本轮未另造只传时间尾部的协议。

## 架构与权限

`Windows HOME → 私有临时 snapshot → collector Worker → 本地 outbox → HTTPS resolve/begin/pages/commit/status → 服务端 Sync Worker/SQLite → committed receipt → 本地确认事务`。

- 临时原始 snapshot 仅在受保护目录内存在，Worker 完成、超时或退出后清理；重启清理遗留的本 Agent capture 目录。wire 仅使用已有 v2 规范化事件与 digest 证据，不携带原型 raw capsule，不要求服务端重放 collector。
- `originId = hash(['incept-origin/1', source, sessionId])`，包含 source/native session，**不包含设备命名空间**。服务端在单写事务内检查既有全局 source/session 归属，登记 origin/scope、receipt 与 device actor 审计；不会伪造 Owner actor。
- Owner 在原 Settings 设备创建时选择 source allowlist。新 session 无需逐个确认；同源历史缺失、新 session 与旧 origin 疑似轮转时保守保留并报告。既有人工 scope 绑定仍保留；非 canonical 的旧绑定返回明确人工审阅状态。
- 成功登记额度：每设备 20/min、每 device/source 1000/day、每设备总数 20000；重复 resolve 不重复计数。HTTP 原有限流与有界 Worker queue 继续生效。真实新 session 频率仍需后续运行观测。
- 每次请求使用真实 PostgreSQL 设备 Token；队列出队时重新检查版本和 allowlist，分页/commit/status 还对存储 header 检查当前 source 权限。设备自报 actor/device/origin 的额外字段被拒绝。
- 未迁移的真实 v1 store 以只读方式参与登记/commit 历史防线；也检查已迁移 shadow 的跨设备与弱身份跨 session 重合。现有 v1 数据不被自动认领、迁移或切换读取。新 v1 批次在登记后到达时仍于 commit 检查。
- review admission 以固定 conflict code 持久记录并审计；合法历史修订仍使用 Phase 1 核心规则。只有 Owner 的显式既有审阅流程可解除历史/rollback 问题，Agent 不提供自动解除。

## 真实运行与回执

Windows + Node `v24.21.0`，本地 PostgreSQL 16，迁移只施于 `incept_sync_phase2`、`incept_sync_phase3`、`incept_owner_auth_phase3`。使用临时 localhost/IP SAN 证书和 `NODE_EXTRA_CA_CERTS`，TLS 校验开启；设备鉴权、近期 Owner session 和设备管理使用真实 DB 实现。HTTP server 直接运行 Next 路由共用 controller，完整 Web 功能由本轮全量回归覆盖。

合成七来源首次各 1 条，追加后各 2 条：

- 14 份 committed receipt；confirmed scopes = 7；云端唯一可见事件 = 14；本地 outbox = 0。
- 服务端首次 commit 成功后主动断开 ACK：本地确认数保持 0，重启再查询原 batch 收据后恢复，云端无重复。
- 首次页请求注入 503，重启服务端 Worker 与本地状态：从持久 stage/offset 继续，最后 receipt 数 14。
- 最新回执 `dataRevision=14`、`status=committed`、`outcome=updated`、`code=since-enrollment`；batch 为 `ef4f5b78-b22a-4a87-99e7-440f319d4c53`，manifest 为 `9c7543ab07f96221b653607c7eb125892ea81d21c3df68ac572b0db2733bb989`。完整脱敏回执见同目录 `sync-agent-phase3-evidence.json`。
- 真正等待五分钟，无 `sync-now` 干预：追加至第二次 receipt 观测间隔 **300832 ms**；2 receipts / 1 confirmed scope；Agent 心跳 RSS **77,615,104 bytes（约 74.0 MiB）**。这是一轮合成 Windows 功能观察，不设新的容量门槛。
- daemon 重复启动只保留一个实例；杀掉其子进程后 supervisor 自动重建；本地 `sync-now` 上报追加；`stop` 正常退出；随后 `run-once` 保持 2 receipts。实际 Start.ps1/Stop.ps1 也完成启动/退出。
- 安装/卸载脚本通过 Windows PowerShell AST 解析与默认 dry run；**没有调用 Register-ScheduledTask**。登录重启的实际任务安装由用户确认后执行。

## 测试、类型和命令

以下命令从仓库根运行，唯 Dashboard/Music core 标明包工作目录。环境变量仅指向上述专用数据库，具体密码/Owner key/Token 不进入报告。完整输出保存在忽略的 `.scratch/sync-agent-phase3/`。

| 精确命令 / 前置 | 结果 |
| --- | --- |
| `node apps/sync-agent/tools/build.mjs` | PASS；agent + collector Worker + 测试 library |
| `node packages/dashboard/tools/build-runtime.mjs` | PASS；现有 Dashboard/Sync Worker |
| `node --test apps/sync-agent/tests/*.test.mjs` | **11/11 PASS**，Windows DPAPI/ACL 与脚本测试均实际运行 |
| 设置 `DATABASE_URL=INCEPT_AGENT_TEST_DATABASE_URL` 为专用 phase3 DB、`NODE_EXTRA_CA_CERTS` 为测试 CA，执行 `node apps/web/node_modules/vitest/vitest.mjs run --root apps/web src/server/sync/__tests__/agent.integration.test.ts` | **3/3 PASS**；五分钟用例在快速最终重跑中显式 skip |
| 同上，加 `INCEPT_AGENT_FIVE_MINUTE_TEST=1` | 真实五分钟用例已单独通过；该次完整日志包含一个随后修正的 v1 fixture 失败，未将整次运行计为全绿 |
| 工作目录 `packages/dashboard`：`node node_modules/vitest/vitest.mjs run` | **449/449 PASS**，33 files；Phase 0/0B/0C/1/2 全保留 |
| 指向 phase2/owner 专用 DB，随机测试加密 key：`node apps/web/node_modules/vitest/vitest.mjs run --root apps/web` | **160 PASS / 4 explicit skip**，含真实旧 Phase 2 HTTP 与 Owner/TOTP；跳过的新 Agent 测试由上一专用命令执行 |
| `node apps/web/node_modules/vitest/vitest.mjs run --root packages/music --exclude src/__tests__/cli-smoke.test.ts` | **195/195 PASS** |
| 工作目录 `packages/music`：`node --import tsx --test 'src/core/__tests__/**/*.test.ts'` | **73/73 PASS** |
| `node apps/web/node_modules/vitest/vitest.mjs run --root packages/roadmap` | **71/71 PASS** |
| `node --test scripts/production-*.test.mjs` | **3/3 PASS** |
| `node node_modules/typescript/bin/tsc --noEmit -p apps/sync-agent/tsconfig.json` | PASS / 0 diagnostics |
| 同上 `-p packages/dashboard/tsconfig.src.json` / `tsconfig.node.json` | 各 PASS / 0 diagnostics |
| 同上 `-p packages/dashboard/tsconfig.phase2.json` / `apps/web/tsconfig.sync.json` | 各 PASS / 0 diagnostics |
| 同上 `-p packages/dashboard/tsconfig.json` | 既有 **36** diagnostics；与 Phase 2E 保存的全输出逐行差异 **0** |
| 同上 `-p apps/web/tsconfig.json` | 既有 **111** diagnostics；新增/移除诊断位置+TS code 各 **0** |
| changed-file ESLint（下列完整文件集合） | PASS / 0 warnings / 0 errors |
| `git -c core.fsmonitor=false diff --check` | PASS |

Web 全诊断文本与 Phase 2E 的逐行对照有 30 条对称差异，来自 Prisma 类型展开中的属性顺序/表示变化；111 个诊断位置与 TS code 完全一致，新 Sync/Agent 专用检查为零。未改写无关 Web/Prisma 诊断或关闭构建检查。该完整输出及 diff、`type-summary.json` 保存在 scratch。

Lint 精确命令：

```powershell
node apps/web/node_modules/eslint/bin/eslint.js --config apps/web/eslint.config.mjs --rule '@next/next/no-html-link-for-pages: off' apps/sync-agent/src apps/sync-agent/tools apps/sync-agent/tests packages/dashboard/src/agent packages/dashboard/src/sync/admission.ts packages/dashboard/src/sync/worker-entry.ts packages/dashboard/src/sync/protocol.ts packages/dashboard/src/sync/executor.ts packages/dashboard/src/sync/index.ts apps/web/src/server/sync/controller.ts apps/web/src/server/sync/next.ts apps/web/src/server/sync/__tests__/agent.integration.test.ts apps/web/src/features/settings/account/sync-devices-panel.tsx
```

仅为包/Node 源码关闭不适用的 Next pages-directory 定位规则，保留其余原配置。没有修改 ESLint 配置文件。

覆盖重点：Codex `50/100/200 → 50/120/200 → 50/120/220` 总量 `200/200/220`；单点累计修订由原 Phase 1 回归覆盖；Gemini 截断旧 200 保留、JSONL 半写、SQLite 删除、原生/index 双表示、弱身份改名逃逸、真实设备跨源/跨设备权限、并发 resolve 幂等、限额、ACK 丢失、Worker 重启、100 次同 batch 重试及 v1 adoption/rollback。

7d / 30d / all 的旧 loader 全对象对照差异均 **0**，由实际旧 Phase 2 HTTP adoption 测试复验；旧 Import Preview/Commit/rollback、Owner/TOTP 测试通过。

### 失败记录与修复

- 沙箱 Vitest worker 无法读取临时转换缓存；Windows 当前用户 DACL 后，受限沙箱也无法访问该私有目录。相同测试在普通本地 Windows 用户环境通过，未放宽 ACL。
- 第一次从仓库根指定 Dashboard `--root` 时，两个进程 fixture 的 `process.cwd()` 路径不符；改在包官方工作目录运行，449 项通过，未改历史断言。
- 新安全用例先后触发了正确的 v1 冲突、export UUID 校验和 PG source 非空约束。修正合成 fixture 的独立 event ID/UUID，以及用合法单 source allowlist 测试收紧；最终 HTTPS 三项全绿。
- 恢复执行时本地 Docker 引擎停止，最终重跑一度 PG 不可达。恢复已安装 Docker，只启动标签匹配的本轮容器、刷新随机 loopback 端口后，全部最终 HTTPS 检查通过。
- 新实现的 TypeScript/ESLint 问题（actor closure narrowing、显式 any、unused imports）已修复，专用检查清零。

## 改动与工作树保护

起点：`codex/production-readiness`，HEAD `aef64f45deabfcc379d38829c48dd103557970b0`。原工作树包含 11 个 tracked 修改及 Phase 0–2/Operations 等未跟踪成果；未 reset/stash/提交或改分支。

新增：

- `apps/sync-agent/{package.json,tsconfig.json,README.md}`
- `apps/sync-agent/src/{cli,collect-worker,credentials,engine,lifecycle,state,transport}.ts`
- `apps/sync-agent/tools/build.mjs`
- `apps/sync-agent/windows/{Bind,Common,Install,Invoke-Agent,Start,Stop,Uninstall}.ps1`
- `apps/sync-agent/tests/{agent.test,helpers,windows.test}.mjs`
- `packages/dashboard/src/agent/capture.ts`、`packages/dashboard/src/sync/admission.ts`
- `apps/web/src/server/sync/__tests__/agent.integration.test.ts`
- 本 proof 与 `sync-agent-phase3-evidence.json`

调整既有本地代码：`sync-devices-panel.tsx`、Sync controller/next、Dashboard sync executor/index/protocol/worker-entry；`pnpm-lock.yaml` 仅加 workspace importer，无依赖版本变化。对 Phase 2E 的 991 文件源哈希清单核对仅这 8 个已有文件变化；Operations、导航、Owner 面板、Prisma schema、部署配置等平行成果保持。

## 使用、回滚与后续

使用步骤见 `apps/sync-agent/README.md`。本地便携产物为 `.scratch/sync-agent-phase3/incept-sync-agent-win-node24.zip`，只含两个运行 bundle、Windows 脚本和说明，不含 Node 安装包、测试 oracle、状态目录或凭据。bundle 哈希保存在 evidence JSON。

停用：执行 Stop.ps1，保持 `INCEPT_SYNC_ENABLED` 默认关闭；将新 Agent 源码/便携目录撤回即可。保留本地 state 与独立 v2 SQLite 以恢复。若用户以后确认安装过自启，使用归属校验的 `Uninstall.ps1 -ConfirmUninstall` 移除该任务；卸载保留 outbox。v1 默认读取及旧批次不受此停用影响。

验收收尾已确认本轮合成 Agent 残留进程为 0，并仅停止标签 `incept.test=sync-phase3-01a1447b` 匹配的测试 PostgreSQL 容器；隔离证据与便携 ZIP 保留。

已知边界：压缩归档、无证据轮转、换库、弱身份覆盖、Antigravity alias/BLOB 修订和未知 reader/collector 版本均需审阅。首次观察前已消失的历史保持“未知”；首次基线仅为 observed。历史审阅仍使用 Phase 1 维护 service，专用 Owner 审阅与 Agent 恢复 UX 后续补齐。超大日志和整站 768 MiB 余量按授权列入上线前资源治理，本轮保留固定资源上限与超限错误。

Phase 4 依赖：WSS Gateway、设备在线/吊销连接、持久远程 Job、鉴权内部调度、远程 `sync_now` 与网页真实回执/dataRevision 联动。继续复用本轮 `SyncEngine.run()`、outbox 和 HTTPS，不改变历史资格规则。
