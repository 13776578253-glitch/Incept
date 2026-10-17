# Incept Sync Agent Phase 2E：完整站点构建与并发验收

日期：2026-10-17，Asia/Singapore。分支 `codex/production-readiness`，起始 HEAD `aef64f45deabfcc379d38829c48dd103557970b0`。依据本轮 Phase 2E 指令，只操作隔离本地环境。

## 验收结论

| 项目 | 结论 | 证据与门槛 |
|---|---|---|
| P2-C 执行与资源 | **BLOCKED** | 完整站点下上传、普通页面、有限队列、安全与恢复检查通过；重复 70,000 条上传的内核峰值 **768.0625 MiB**，比配置值高 **65,536 bytes**，`memory.events.max=64`，约 10% 内存余量未满足 |
| P2-D 完整站点证据 | **PASS** | frozen 安装、原配置完整构建、清空 `.next` 再构建、生产依赖裁剪、正式启动、两类 Worker tracing、真实页面及设备 API 的完整证据已补齐 |
| 整体 | **BLOCKED** | 构建依赖阻断已解除，剩余阻断是 768 MiB 容量门槛；停止在 Phase 2E |

OOM kill 为 0，非故障窗口请求错误为 0，12 份 committed receipt 均保留。按严格峰值门槛报告 BLOCKED；首轮 655.19 MiB 和重启后的较低峰值均保留，不取其中较低值覆盖重复负载结果。Phase 3 只有第 9 节的设计草案，没有实现。

## 1. 工作树保护与本轮文件

开始时已有 11 个 tracked 修改，以及 Phase 0–2、Operations 和导航等未跟踪成果；完整清单保存在 ignored 的 `.scratch/sync-agent-phase2e/status-before.txt`。没有 reset、stash、切分支、提交或覆盖这些成果。构建快照包含当前 Operations 页面及导航。

起始 991 个源码/文档文件逐文件 SHA-256 对照，结束时原文件变化 **0**。`pnpm-lock.yaml` 安装前后与工作树均为 `353e77ea088f0916159fce3e458463235eed1649a655935048e9cbb94a26ae68`。生产 Dockerfile、Compose、Nginx/Caddy、Owner/TOTP、v1 Import、默认 loader、Docs/Music 业务文件均保持起始内容。

本轮仅新增：

| 文件 | 用途 |
|---|---|
| `docs/research/sync-agent-phase2e-fullsite-proof.md` | 本报告与 Phase 3 设计草案 |
| `docs/research/sync-agent-phase2e-benchmark.json` | 原始请求/资源数值、计量口径、依赖清单、完整 TS 诊断及逐行差异 |
| `packages/dashboard/tools/phase2e/snapshot.py` | 排除 env、日志、旧依赖/产物和本机数据的源码快照 |
| `packages/dashboard/tools/phase2e/fullsite-build.sh` | frozen 安装、Prisma、Worker、类型检查与完整 Next build |
| `packages/dashboard/tools/phase2e/runtime-prepare.sh` | 按正式 Dockerfile 离线裁剪生产依赖及检查 NFT |
| `packages/dashboard/tools/phase2e/monitor.mjs` | 仅测试的 100ms cgroup/Next RSS/CPU/事件循环采样 preload |
| `packages/dashboard/tools/phase2e/fixtures.mjs`、`seed.mjs` | 打包已有 correctness oracle；生成独立 v1、Owner、Docs/Music 合成 fixtures |
| `packages/dashboard/tools/phase2e/client.mjs` | 真实完整站点的上传、页面、安全、恢复、三窗口对照客户端 |
| `packages/dashboard/tools/phase2e/nginx.conf` | 独立本地 HTTP Nginx 测试入口 |
| `packages/dashboard/tools/phase2e/checkpoint-probe.mjs` | 显式隔离 SQLite WAL 维护试验，检查 revision/行数不变 |
| `packages/dashboard/tools/phase2e/collect-results.mjs` | 汇总已有脱敏数值并按实际峰值计算门槛结果 |

所有脚本均为验收工具；没有挂到业务运行时或正式 package scripts。原始 env、Owner Cookie、设备凭据、合成完整请求体只留在 ignored scratch/专用数据卷；报告与 benchmark 不含这些材料。

## 2. 构建环境与产物

复用本机缓存镜像 `incept:fix-20261016-1a29a92` 的 Node/pnpm 工具链，在 `/phase2e` 解压独立源码快照并重新安装。源码包 991 个文件、6,881,280 bytes，SHA-256 `a8767bb3860a4535f997bcc5104b2ac8fe450d2eaefb8da6a58ebfbd04bf9f7b`，env 文件数 0。

| 项目 | 实测 |
|---|---|
| 系统 | Debian 12 bookworm；Docker Desktop / WSL2 Linux 6.6.87.2，x86_64 |
| 构建工具 | Node 24.21.0、pnpm 10.30.3，匹配 `packageManager`；Prisma 6.19.3 |
| Web | Next 16.4.0 / Turbopack、React 19.2.8、TypeScript 5.9.3 |
| 缺失构建依赖 | `@tailwindcss/postcss`、`tailwindcss`、`@tailwindcss/node`、`@tailwindcss/oxide` 均为 4.2.4；另含 Linux 原生构建依赖、测试/lint/TS 工具 |
| 安装 | registry.npmjs.org；原锁 frozen、ignore-scripts；559 个实际包目录，初次 29.7s；相对缓存 runtime 补齐 374 个包版本 |
| 依赖清单 | benchmark 的 `build.dependencyInventory.missingPackages` 保存全部 374 个精确 name/version，来源与锁 hash 一并记录 |
| 生产依赖 | 依照正式 Dockerfile 保存 Prisma engine、移除隔离副本 node_modules，再 `--prod --offline --frozen-lockfile --ignore-scripts` 安装 185 个包；未下载新版本 |

先执行 `pnpm db:generate` 和 dashboard worker build，再运行完整工作区检查与 `pnpm build`。Next 的 TypeScript 检查保持启用，没有 `ignoreBuildErrors` 或临时页面替换。完整构建 exit 0；另在工具容器删除 `/phase2e/apps/web/.next` 后，从无 Next build cache 状态再次构建 exit 0：编译 4.5s、TypeScript 8.3s、19 个静态页生成 118ms。

构建有 **17 条 tracing warning**，涉及现有动态文件访问、Docs 路径、Dashboard 路径和 generated Prisma。原配置存在全项目追踪范围扩大的问题；本轮记录，不改这些模块。

实测运行产物：

| 产物 | 大小 / tracing |
|---|---|
| `apps/web/.next` | 26,690,060 bytes；BUILD_ID `k6JGjM4RQIao4yXhnLXGS` |
| `dashboard-usage-worker.mjs` | 113,457 bytes；usage route NFT 440 个文件，包含该 Worker |
| `dashboard-sync-worker.mjs` | 73,856 bytes；sync catch-all NFT 439 个文件，包含该 Worker |
| `sync-executor.mjs` | 8,038 bytes |

启动使用裁剪后的完整产物与 **`node scripts/production-start.mjs`**，其内部运行 `next start apps/web`。没有使用 `tools/phase2/harness-start.sh`。正式启动配置校验通过，Next Ready 108ms；真实收集 Worker 与 Sync Worker 均经请求实际加载。

## 3. 隔离环境与计量口径

资源统一标签 `incept.test=sync-phase2e-01a1447b`，专用 network、全新 PG、v1/v2 数据卷与本机随机端口。数据库仅 `incept_sync_phase2` 和 `incept_owner_auth_phase2e`；数据库迁移只执行于这两个新建测试库。App 没有直接发布端口，Nginx 仅绑定 `127.0.0.1`。

| 服务 | 实际限制 / 差异 |
|---|---|
| App | `memory.max=805306368`，768 MiB；`memory.swap.max=0`，2 CPUs，UID 1000、只读根目录、cap-drop ALL；两个 64MiB tmpfs；正式生产启动入口 |
| Node | 正式 Compose 同款 `--max-old-space-size=256 --max-semi-space-size=8`，另加测试 monitor preload；Sync Worker 沿用现有代码的 resourceLimits |
| PG | PostgreSQL 16.13，256 MiB，shared_buffers=128MB、max_connections=100、work_mem=4MB；独立计量。生产 Compose 为 384 MiB、64MB/20/2MB，本轮未改生产配置 |
| Nginx | 1.28-alpine，96 MiB；真实 Nginx 1MiB body limit、usage 2r/s + burst5、连接20、100s proxy timeout、覆盖 forwarded headers；测试 HTTP，生产模板另有 TLS/登录限流/音乐上传等规则 |
| 宿主 | Docker VM 8 CPUs、25,201,696,768 bytes；load generator、构建工具容器在目标 App cgroup 之外 |

默认 Dashboard 始终读 v1；只有测试 App 显式 `INCEPT_SYNC_ENABLED=1`，`INCEPT_SYNC_DATABASE_FILE=/data/sync/sync.db` 是新建独立库，与 v1 `/data/dashboard/imports.db` 分离。生产配置未增加此开关。

`memory.peak` 取内核生命周期峰值；`memory.current/stat/events` 同时记录，包含该 cgroup 计费的文件缓存。preload 每100ms采样；客户端在真实请求完成后读取最近样本。资源原始元组列名与全部请求耗时在 benchmark 内。进程 RSS 是 Next 进程及其线程共享的 RSS；启动包装进程约48.5MiB另列，不把 Worker heap 当独立 RSS。

事件循环用10ms分辨率，100ms重置；“P99”列为各采样区间 P99 的最大值。Worker heap 是真实 Owner status 中最近操作报告值；CPU 是整个页面采样窗口的 Next 进程累计 CPU 差值，包含线程。P50/P95 用排序后 `floor(N*q)` 项。每个页面窗口至少30s，完整消费响应体；上传 wall 从 begin 至已核实 committed receipt，排除客户端 fixture 构造时间。

重启会重置 cgroup 生命周期并改变文件缓存计费归属；因此保留重启前最坏峰值。`baseline-process-cold` 是实际重启后的进程冷基线，文件系统缓存仍热；早期名为 `baseline-cold` 的文件在资源预检之后采集，属于热基线。

## 4. 完整页面、权限与正确性

实际访问页面：`/en`、`/zh`、`/en/dashboard`、`/zh/dashboard`、`/en/settings`、`/zh/settings`、`/en/operations`、`/zh/operations`、`/en/docs`、`/zh/docs/phase2e-guest`、`/en/tools/playback`。Owner Settings 包含当前设备面板；另实际访问 `/api/dashboard/sync/devices`、`/status`、`/api/auth/owner/state`、`/api/dashboard/usage?range=30d`、`/api/music/tracks`。合成 Docs 详情与真实 WAV 媒体有效；21 个引用资源/媒体请求均200，包括 Next JS/CSS、图标和媒体。页面为真实 SSR HTML/静态资源 HTTP 验收，UI交互另由已有 Web 测试覆盖。

合成 Owner 通过原密码→TOTP→原离线一次性批准→`next/headers` Cookie 路径登录，最近验证到期返回428后，按原 TOTP 重新验证再继续测试。

| 检查 | 结果 |
|---|---|
| 无 Token / 已吊销 | 401 / 401 |
| Device 调 Owner 管理、跨设备、Owner 跨 Origin | 403 / 403 / 403 |
| body 自报 Owner actor | 400 |
| 同 batch ID 不同 payload | 409 |
| guest 旧 Import / guest private Docs / Owner private Docs | 404 / 404 / 200，沿用原门禁 |
| guest 强制 Dashboard refresh | 403 |
| 1,048,577 bytes 经真实 Nginx | 413 |
| 近512KiB合法页 | **522,013 bytes**，HTTP200，真实落入 staging |
| 100次同批 commit 重试 | receipt 完全相同；revision不变 |
| 设备速率 | 第181次返回429，Retry-After=58 |
| SQLite 真正持有写锁 | 503 `SQLITE_BUSY_EXHAUSTED`，Retry-After=2；旧 revision 与 staged offset=1保留；释放锁后提交成功 |

恢复实验：真实完整 App 在700条批次已持久化前500条后 SIGKILL；恢复状态 `staging,nextOffset=500`，无 receipt；补齐后 committed。再于提交之后 SIGKILL/restart，同 batch/payload 重试返回完全相同的 generation、manifest、revision11 receipt。仅 committed receipt 计为成功。SQLite事务中断/无半提交 generation 的细粒度故障继续由保留的 Phase1真实子进程回归覆盖。

故障注入与一次独立探针大批次的尾部采样重叠，原始 `stress-independent` 中有 **3 次502**（2个普通页、1个status），均发生在故意杀进程期间；该批70,000条此前已提交。保留原始样本和重启前峰值；另采集无故障干扰的完整 `steady-before → stress-steady → steady-after` 窗口。

### v1 / v2 三窗口对照

完整站点的独立 v1 fixture 为7来源各3条，共21条，全部位于同一天。真实旧 loader 与线上形态 `/api/dashboard/usage` 比较整个 JSON 对象，只排除采集时钟 `checkedAt`，保留其余字段与数组和值：

| 窗口 | total tokens | sessions | cost USD | 全对象差异 |
|---|---:|---:|---:|---:|
| 7d | 2730 | 7 | 0.003045000000000001 | 0 |
| 30d | 2730 | 7 | 0.003045000000000001 | 0 |
| all | 2730 | 7 | 0.003045000000000001 | 0 |

已上传的304,902个v2可见记录未混入默认v1读取。另一份原有七来源/多日期真实 PG+HTTP+Worker adoption 回归也通过：7d/30d/all分别910/1820/2730 tokens、费用0.001015/0.002030/0.003045，全对象差异均0。该套件还覆盖迁移二次重放、精确认领、旧v1 rollback、Codex修订与rollback fence。

## 5. 并发、延迟与内存

三轮均为两个独立授权测试设备，各15,700条、各32页；持续请求上述完整页面/API。数字为原始未四舍五入值的展示摘要，完整数值见 JSON。

| 轮次 | 两设备上传 wall ms | commit ms | 页面/API样本 / 错误 | 全请求P50 / P95 ms | 内核峰值 MiB | 采样窗口CPU ms |
|---|---|---|---|---|---:|---:|
| warm1 | 2973.46 / 2981.28 | 596.18 / 1262.64 | 262 / 0 | 11.28 / 27.00 | 338.29 | 6673.40 |
| warm2 | 2907.33 / 2912.86 | 713.05 / 1363.04 | 255 / 0 | 10.75 / 22.85 | 406.64 | 6171.30 |
| warm3 | 3278.58 / 3284.92 | 780.22 / 1511.46 | 261 / 0 | 12.13 / 27.30 | 346.85 | 7023.18 |

warm3之前有一次真实进程重启，未重置数据库。进程冷基线257请求、错误0、P95 29.62ms，内核峰值164.95MiB；第一条普通页面请求与其余冷/热样本均保存在JSON。

| 大批次 | 上传 / commit ms | 页数 | 全请求样本/错误 | 普通页面并发证据 | 内核峰值 MiB |
|---|---|---:|---|---|---:|
| 首次70,000 | 8341.09 / 3506.30 | 140 | 236 / 0 | 上传期间33页，P95 28.49ms | 655.1875 |
| 重复70,000，独立普通页/API探针 | 8403.60 / 3646.30 | 140 | 303 / 3次故意重启502 | 上传期间74页，错误0，P95 25.08ms；故障在提交后尾部窗口 | **768.0625** |
| 无故障稳态再测70,000，重启之后 | 14361.62 / 9646.07 | 140 | 322 / 0 | 上传期间127页，P95 23.81ms，最大56.58ms | 360.2031 |

独立探针将普通页面循环与可能排队的 status/API循环并行，确认 commit期间普通页面持续成功。最终稳态相同普通页面：压力前266样本P95 **23.56ms**，压力中265样本P95 **22.97ms**，压力后266样本P95 **23.27ms**，各错误0。同期全部请求P95为23.97 / 24.37 / 23.28ms；Owner status最大等待 **9576.40ms**，受单writer队列影响，普通页面未随之等待。

资源问题集中在重复写入后的文件缓存及WAL：最坏样本 `memory.stat` 为 anon=242,704,384、file=537,935,872、kernel=23,175,168 bytes；有 `pgscan_direct=3009`、`pgsteal_direct=2985`，`memory.events.max=64`，OOM/oom_kill均0。Next进程RSS峰值327.77MiB；最坏cgroup峰值不能用这个RSS替代。

首次大批次后cgroup从655.18MiB仅回落至653.15MiB，后续空闲/页面窗口末636.50MiB；没有足够稳定余量覆盖下一次同类上传。重启之后的较低计费与360.20MiB复测峰值分别记录，容量裁决仍使用重启前768.0625MiB。所有被采样的队列均有界，末尾 `queueLength=0,running=false`，没有积压增长；全窗口事件循环最大72.55ms（含故障恢复），无故障稳态最大15.79ms。Worker heap最近报告最高约28.25MiB，不作为精确分配峰值。

最终隔离SQLite：DB **594,841,600 bytes**、WAL **203,573,352 bytes**、SHM **393,216 bytes**，合计798,808,168 bytes；304,902条可见v2记录、12份receipt。另有一份有意保留的合法近512KiB页，500条staging、522,001逻辑bytes，属于未提交fixture。

显式空闲 WAL TRUNCATE 试验将203,573,352 bytes WAL降至0；revision12、所有receipt、可见行、staging数量全相同。该窗口App cgroup前后均321,388,544 bytes，未测得即时内存下降。因此此实验提供磁盘回收与一致性证据，容量问题仍待修复与复测。

### 约2GiB整机预算

PG独立内核峰值158,298,112 bytes（150.96MiB），Nginx14,594,048 bytes（13.92MiB）。与最坏App峰值相加约 **932.95MiB**；生产配置硬上限768+384+96=1248MiB，2GiB余800MiB供OS等。该合计是预算估算：本次Docker VM约24GiB，PG配置不同，TLS成本及整机内存争用待下一次专门验收。App自身的约10%余量问题已经构成阻断。

## 6. 回归、类型诊断与精确命令

以下命令在仓库根目录或容器 `/phase2e` 执行；随机URL/密钥只由ignored文件注入。原始输出保存在 `.scratch/sync-agent-phase2e/`，benchmark 保存诊断完整行与差异数组及关键日志hash。

| 命令 | 结果 |
|---|---|
| `git -c core.fsmonitor=false status --short`、`git branch --show-current`、`git rev-parse HEAD` | 保留起始工作树和分支 |
| `NODE_ENV=development pnpm install --frozen-lockfile --ignore-scripts --store-dir /phase2e-store` | exit0，559包，lock不变 |
| `pnpm db:generate`；`pnpm --filter @incept/dashboard build:runtime` | 各exit0，真实Prisma/两Worker |
| `pnpm --filter web typecheck`；`pnpm typecheck` | 全新Linux环境各exit0；Web与Dashboard完整诊断均0 |
| `NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 pnpm build` | exit0；原配置完整Next构建 |
| `rm -rf /phase2e/apps/web/.next` 后同一build命令 | 仅容器内隔离目标；无build cache复建exit0 |
| `CI=true NODE_ENV=production pnpm install --prod --offline --frozen-lockfile --ignore-scripts --store-dir /phase2e-store` | exit0，185包；Prisma engine保留；`.next`无断链 |
| `pnpm db:deploy` | 仅两个全新测试PG库迁移成功 |
| `pnpm lint` | exit0，0 errors、12个已有warnings，含Operations/Docs等；未修旁支 |
| `pnpm test` | exit0：Dashboard **449/33文件**，Web **132/26文件**，Roadmap **71/7文件**，Music Vitest **195/24文件** + Node core **73** |
| `pnpm --filter web exec vitest run src/server/auth/__tests__/owner-db.integration.test.ts`，显式独立Owner URL及随机key | **28/28**通过；全工作区初跑这28项因未设该专用URL跳过，已单独全跑 |
| `pnpm test:ops` | **3/3**通过 |
| `node node_modules/typescript/bin/tsc --noEmit -p <config>`，dashboard `tsconfig.phase0/phase0b/phase0c/phase1/phase2.json` 和Web `tsconfig.sync.json` | 6项各exit0；src/node/full由完整`pnpm typecheck`覆盖 |
| `./node_modules/.bin/tsc.cmd --noEmit -p packages/dashboard/tsconfig.json`（本机before/after） | **36→36**；新增行0、移除行0 |
| `./node_modules/.bin/tsc.cmd --noEmit -p apps/web/tsconfig.json`（本机before/after） | **111→111**；新增行0、移除行0 |
| `./apps/web/node_modules/.bin/eslint.cmd --config apps/web/eslint.config.mjs --rule '@next/next/no-html-link-for-pages: off' <phase2e全部mjs>` | exit0，0错误/0警告；该Next页面规则只对仓库根目录的工具文件关闭；完整Web lint仍用原规则 |
| `git diff --check`；新增6个mjs的`node --check`、2个sh的`sh -n`、Python标准库`compile` | 均exit0；原有内容保持；仅原有文件CRLF提示 |

本机旧依赖/生成物环境的36/111条诊断完整保留；相同源码在fresh lockfile依赖与Prisma生成后的Linux环境为0。本轮没有为此改Web/Prisma业务源码。

运行容器的关键实际参数：

```powershell
# 标签固定为本轮专用值；下列 env 文件仅存随机测试配置。
docker run -d --init --name incept-sync-phase2e-app-01a1447b `
  --label incept.test=sync-phase2e-01a1447b `
  --network incept-sync-phase2e-01a1447b --network-alias phase2e-app `
  --memory 768m --memory-swap 768m --cpus 2 --read-only `
  --security-opt no-new-privileges:true --cap-drop ALL --user 1000:1000 `
  --workdir /phase2e --env-file .scratch/sync-agent-phase2e/runtime.env `
  --mount type=volume,source=incept-sync-phase2e-data-01a1447b,target=/data `
  --mount "type=bind,source=$PWD/packages/dashboard/tools/phase2e,target=/phase2e-test-tools,readonly" `
  --tmpfs /tmp:uid=1000,gid=1000,mode=1777,size=64m `
  --tmpfs /phase2e/apps/web/.next/cache:uid=1000,gid=1000,mode=0700,size=64m `
  --entrypoint node incept-sync-phase2e:runtime-01a1447b scripts/production-start.mjs
```

客户端在独立 tools 镜像容器运行，挂同一专用volume到 `/fixture`、ignored证据目录到 `/test`，独立于App限额。实际入口：

```text
node packages/dashboard/tools/phase2e/client.mjs login initial
pnpm auth:owner approve --challenge <synthetic-challenge-id> --output /test/private-approval.json
node packages/dashboard/tools/phase2e/client.mjs approve initial
node packages/dashboard/tools/phase2e/client.mjs assets initial
node packages/dashboard/tools/phase2e/client.mjs baseline process-cold
node packages/dashboard/tools/phase2e/client.mjs round warm1   # 同样运行warm2、warm3
node packages/dashboard/tools/phase2e/client.mjs stress large
node packages/dashboard/tools/phase2e/client.mjs security boundary
node packages/dashboard/tools/phase2e/client.mjs busy retryable
node packages/dashboard/tools/phase2e/client.mjs recovery-prepare restart
docker kill --signal KILL incept-sync-phase2e-app-01a1447b
docker start incept-sync-phase2e-app-01a1447b
node packages/dashboard/tools/phase2e/client.mjs recovery-resume restart
# 再kill/start，然后recovery-verify；只操作本轮App。
node packages/dashboard/tools/phase2e/client.mjs reauth before-steady
PHASE2E_INDEPENDENT_PROBES=1 node packages/dashboard/tools/phase2e/client.mjs baseline steady-before
PHASE2E_INDEPENDENT_PROBES=1 node packages/dashboard/tools/phase2e/client.mjs stress steady
PHASE2E_INDEPENDENT_PROBES=1 node packages/dashboard/tools/phase2e/client.mjs post steady-after
node packages/dashboard/tools/phase2e/client.mjs parity fullsite
PHASE2E_MAINTENANCE=1 node packages/dashboard/tools/phase2e/checkpoint-probe.mjs
```

`fullsite-build.sh` 与 `runtime-prepare.sh` 保留准确构建/依赖命令。快照生成使用Python标准库；没有新增依赖。`collect-results.mjs` 从本轮ignored测量文件生成正式benchmark，拒绝用示意数值替代实测。

## 7. 失败日志与修正记账

| 分类 | 原始情况 | 处理与结果 |
|---|---|---|
| 构建环境 | 首次install阶段的 `NODE_ENV=development` 泄漏到build，出现 `/_global-error` prerender/useContext错误 | 保留首次日志；安装后显式切production；原配置构建与无缓存复建均成功 |
| 下载环境 | 锁定 `@swc/core-linux-x64-gnu@1.15.32` 一次ECONNRESET | pnpm按原锁重试成功；依赖版本无改动 |
| Owner测试配置 | 独立28项第一次漏设测试加密key，28项失败 | 保存 `owner-real-missing-test-env.txt`；补随机测试key后28项全通过 |
| 合成fixtures | Docs顶层误用blocks、Music缺曲库、媒体URL/文件名未遵循原canonical规则 | 只修测试seed；原业务不变。原预检数据单列；最终真实页面与21资源全通过 |
| 压力客户端 | 初稿只接收200，设备创建实际201；guest Import原门禁为404 | 按现有响应契约修客户端，未改服务端/历史测试 |
| 最近Owner验证 | 后续窗口开始前原5分钟验证过期，428 | 保留失败记录；真实reauthenticate后完整重采稳态窗口 |
| oracle配置 | 初稿oracle未指定显式v1文件，读到空默认位置 | 指向同一隔离fixture，完整对象断言保持；三窗口全0差异 |
| 容量 | 重复负载768.0625MiB、限额事件64 | 保留，构成本轮剩余阻断；没有放宽断言或提高App限额 |

## 8. 最小后续行动与回滚

优先开展一轮 **Phase 2容量修复与复测**，保持v1读取与默认SYNC_DISABLED：

1. 对长期存活的同一App、同一不断增长的隔离DB连续重复70000事件，核查文件缓存/DB/WAL归属与峰值；不靠重启形成低基线。目标峰值不超过768MiB，且稳定余量约76.8MiB。
2. 设计有界、可恢复的WAL checkpoint/截断策略，避开提交事务与活跃reader。checkpoint失败不得改变committed receipt；补busy、崩溃与读一致性测试。本轮手动试验只释放WAL磁盘，内存收益需实测。
3. 为内存压力增加有界准入/队列约束，明确429/503及Retry-After；保留已有staging/receipt。现有16项队列、单writer与磁盘容量守卫仍需联动内存指标验证。
4. 将轻量Owner状态/容量展示与长commit等待解耦，附指标采样时间；复测9.58秒状态等待。分析SQLite热路径与I/O，使大历史下commit仍落在现有30秒有界期限内。
5. Worker继续保持单writer与分页；针对cgroup文件缓存占比测试SQLite cache/WAL策略及进程内存预算。仅调Worker heap不足以覆盖本次约513MiB文件缓存。
6. 最终用生产等价PG参数、TLS代理及约2GiB整机限额复测，用户/规划AI复核后再决定后续阶段。

回滚本轮：停止本轮标签容器即可；默认业务没有切到v2，也没有生产配置/数据库需要回滚。原始v1 fixture、独立v2数据卷、构建镜像和ignored证据保留供复现；清理不操作旧Phase2或其他容器。测试凭据在收尾时仅对本轮PG撤销，之后停止本轮资源。

收尾实测：本轮PG撤销28个合成设备及3个合成浏览器session，真实接口确认Owner变guest、设备管理403、已撤销设备401。另以同一完整产物启动无Sync开关的短时独立实例，返回404 `SYNC_DISABLED`，v2数据库未初始化。最后核对标签后停止本轮全部8个容器，均为exited；数据卷与镜像保留，其他资源保持。

生产触碰：**否**。没有生产SSH、生产数据库读写/迁移、镜像部署、生产Compose/Nginx/Caddy改动、真实设备注册、Windows自启、常驻Agent、WSS或默认读路径切换。

## 9. Phase 3 新 session/origin 登记契约草案（设计）

### 产品建议与已有契约

本轮用户推荐的产品语义：Owner首次批准设备和source allowlist；该可信设备随后发现的新session，可在已授权device+source命名空间内由服务端自动登记。Owner管理设备来源权限、审阅历史冲突；正常新增session不逐个点击。

当前Phase2实现仍是Owner-only `/devices/:id/scopes`。本节列出下一轮需要编码验证的技术方案，不改变现有Owner-only机制。首次所见仍为 `baseline-observed`；服务端已持久确认父版之后才声明 `since-enrollment`。v1交叠、跨设备origin、改名/换库、弱身份歧义、adoption与Owner rollback fence继续沿Phase0C/1。

### 建议调用链

```text
Owner批准Device + canonical sources
 → 每请求认证设备/credentialVersion/source allowlist
 → server resolve原生session anchor、既有binding/alias、历史冲突与quota
 → 同一SQLite事务：受控scope绑定 + admission receipt + audit
 → 返回canonical scope/origin + manifest所需的登记凭据
 → 设备持久保存该绑定并生成完整SessionManifest
 → 原begin/page/commit父版CAS与完整性验证
 → 同事务切换可见generation、committed receipt、dataRevision
```

### 权限接口与稳定标识

- PG的Owner设备登记/来源变更接口保留，记录授权版本；Device不能调用Owner管理。设备凭据鉴权之后才构造服务器授权上下文，不接受body中的Owner actor、任意deviceId、来源别名或绑定所有权。
- 新增窄权限的device scope resolve/admit接口；复用认证与限流，新增内部受控登记操作。不能把Owner-only `register` 接口简单套上伪造Owner actor。
- 命名空间由认证结果的Owner、device UUID、canonical source派生；原生session/native anchor经来源专用校验。Token计数、时间、行号、相似路径不参与稳定跨代身份。弱身份需要持久origin注册和session generation，疑义仍审阅。
- 保留既有origin全局唯一归属及旧alias映射。给origin加新device前缀不得绕过已有所有权检查；已绑定其他设备的origin拒绝自动接管。来源更名、DB替换/压缩、Antigravity alias/BLOB变动、未知collector版本仍进入明确适配/审阅。
- 推荐两步：resolve返回canonical scope/持久登记receipt，设备据此计算manifest hash，再begin。当前严格v2字段校验不能悄悄加入ticket；需要显式协议版本或已定义扩展，同时保留已登记scope的现有v2客户端兼容。

### 事务、回执、审计与撤销

- scope绑定、命名空间冲突检查、登记幂等receipt、登记配额和audit放同一SQLite `BEGIN IMMEDIATE` 事务；拆出可组合的内部函数，避免register/begin嵌套事务。
- 登记receipt只表示元数据绑定，不推进已确认generation/cursor。可见切换、同步receipt和dataRevision继续由原commit原子完成，Manifest scope/hash/父版校验不变。
- PG设备授权与SQLite不具备跨库原子事务。建议鉴权时带credential/policy版本，派发前再次核对；明确已开始事务的完成边界。撤销/来源收紧后拒绝新请求及排队项，保留历史binding、receipt与审计。
- 同一resolve请求重试不重复消耗配额；并发首次登记只生成一个binding与receipt。建议初始配额候选：每设备每分钟4个、突发8个、每source每日500个、设备总量20000；均需下一轮根据真实session频率验证，来源频率当前未知。
- 审计保留设备、source、scope/origin摘要、授权版本、parent、admission/commit关联、冲突码与限流结果；不保存token、正文、路径明文或会话标题。

### 历史与必须补的边界测试

既有v1精确重合先走adoption/review，未认领批次维持唯一读取视图；新命名空间不能静默另计同一历史。弱身份/换库/原生键歧义保留上一有效generation，Owner rollback栅栏由显式Owner动作解除。

必须验证：跨device/Owner抢占、actor/source伪造、来源allowlist收紧与credential轮换/吊销、排队期间授权变更；并发resolve和quota幂等；canonical scope与manifest哈希不符；v1交叠/alias历史认领；无证据轮转/换库；弱记录覆盖；未知collector；父版CAS；rollback后禁止自动复活；登记成功但begin未成功/崩溃；绑定+staging/commit故障点；ACK丢失及同batch异payload。

本草案需用户/规划AI审阅，技术点需实际编码与隔离测试。当前容量阻断先处理，未进入Phase3。

**整体结论：BLOCKED。**
