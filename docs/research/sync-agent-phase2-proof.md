# Incept Sync Agent Phase 2：设备凭据、安全上传与有界执行验收

日期：2026-10-17（Asia/Singapore）。HEAD `aef64f4`，分支 `codex/production-readiness`。依据本轮用户附件执行；Phase 1 的本地准入有效。生产、默认读取切换、Windows Agent、WSS 和 Phase 3–6 均未执行。

## 1. 阶段结论

| 阶段 | 结果 | 证据及剩余条件 |
|---|---|---|
| P2-A 身份 | PASS | 全新隔离 PostgreSQL 的真实 Prisma 迁移；UUID、摘要凭据、Owner 门禁、并发登记、轮换/吊销、跨设备拒绝、运行角色权限与日志测试通过 |
| P2-B 上传 | PASS | 真实 HTTP→PG 鉴权→Worker→Phase 1 SQLite；分块/回执/100次重试、近512KiB合法页、401/403/409/413/429、三窗口兼容、修订与回滚栅栏通过；Next harness 经真实代理接通 |
| P2-C 执行 | CONDITIONAL | 单进程受限 Worker、持久页/回执恢复、超时取消、busy、容量守卫及 Next API harness 资源测量通过；完整 Incept Web 的打包/并发容器验收待补 |
| P2-D 证据 | BLOCKED | 自动化、真实 PG/HTTP、三窗口零差异、API harness 768MiB压力与回滚预案具备；**完整 Incept Web 构建与普通业务页面并发验收**受缓存镜像缺少构建依赖阻断 |

**整体停止在 Phase 2 验收门槛。** 用户/规划 AI 需先处理完整站点构建环境并复核本报告，再决定下一步。现有默认 Dashboard、人工 Import 与 Owner/TOTP 继续走原路径。

## 2. 工作树与交付范围

开始时已存在 Operations/导航的4个 tracked 修改及2个新目录，以及 Phase 0/0B/0C/1 未跟踪成果。没有 reset、stash、切分支、提交或部署；本轮未操作 Operations、站点导航或旧研究报告。初始状态保存在 `.scratch/sync-agent-phase2/status-before.txt`。

本轮修改：

- `packages/db/prisma/schema.prisma`：AgentDevice、OwnerAccount 关系。
- `packages/db/src/client.ts`：schema revision 与本 schema 的 HMR 缓存类型，避免其他工作区的旧 generated client 类型合并。
- `packages/db/package.json`：`./agent` 私有服务导出。
- `packages/dashboard/package.json`：Node-only `./sync` 导出。
- `packages/dashboard/tools/build-runtime.mjs`：保留原 collection worker，同时构建 sync worker/executor。
- Phase 1 `src/adapters/local/imports/sync/store.ts`：只加有界 busy 重试计数器；原事务/资格/计价算法不变。
- `apps/web/next.config.ts`：sync route 的 worker 文件追踪。
- `apps/web/src/features/settings/account/owner-account-panel.tsx`：挂载最小设备面板。

本轮新增（以下 `src/` 按所在包区分）：

| 路径 | 用途 |
|---|---|
| `packages/db/prisma/migrations/20261017010000_sync_agent_devices/migration.sql` | 仅 PG 设备元数据表、约束与索引 |
| `packages/db/src/agent/index.ts` | 凭据生命周期、不可逆摘要、权限与版本复核 |
| `packages/dashboard/src/sync/{protocol,capacity,executor,worker-entry,index}.ts` | Node Worker、队列、容量和调用协议 |
| `packages/dashboard/src/__tests__/phase2/executor.test.ts` | 7项 Worker/容量/恢复测试 |
| `packages/dashboard/tsconfig.phase2.json` | 新 runtime/测试专用 TS |
| `packages/dashboard/tools/sync-agent-phase2-{benchmark,maintenance}.mjs` | 真实 HTTP 合成基准；显式离线迁移命令 |
| `packages/dashboard/tools/phase2/{harness-start.sh,loop-metrics.mjs,nginx.conf}` | 可复现隔离 Next API/代理/指标夹具 |
| `apps/web/src/server/sync/{http,controller,next}.ts` | 流式边界、鉴权控制器、Next Cookie/Origin适配 |
| `apps/web/src/server/sync/__tests__/{http,integration}.test.ts` | 3项纯流测试、15项真实 PG/HTTP/Worker 集成 |
| `apps/web/src/app/api/dashboard/sync/[[...path]]/route.ts` | 单一 Node catch-all 路由，GET/POST/PUT/PATCH/DELETE |
| `apps/web/src/features/settings/account/sync-devices-panel.tsx` | Owner 登记/改名/轮换/吊销/显式 scope 绑定，一次性凭据展示 |
| `apps/web/tsconfig.sync.json` | 新 Web runtime/UI/测试专用 TS |
| 本文件与 `sync-agent-phase2-benchmark.json` | 证据、风险、原始资源数字 |

旧 v1 SQLite schema、collector、loader、refresh/snapshot-store、人工 Import 路由、安全门禁、Docs/Music、Compose/Caddy/Nginx 生产文件均未修改。

## 3. 真实调用链与配置

```text
Next route (默认 SYNC_DISABLED)
  → 每请求 authenticateAgent(Bearer) → PostgreSQL 当前摘要/撤销/版本/来源权限
  → 后端构造 SyncActor(device, 已认证deviceId)
  → 实际字节限制 / 严格字段 / 设备速率限制
  → 有界队列；派发前再鉴权，拒绝排队期间已撤销/轮换的旧凭据
  → 单一 Worker Thread
  → CompatibleSyncService.begin / stage / commit
  → 独立 v2 SQLite WAL/FULL 事务
  → 持久 receipt / dataRevision → HTTP 成功响应
```

Owner 入口单独使用原 `getCurrentViewer`、`requireRecentOwnerSession`（5分钟）、变更 Origin 校验和 security audit。设备路径不读取 Owner Cookie，不接受客户端 actor/role/deviceId 授权上下文。授权头不会发送到 Worker。每次新请求及队列派发均查询当前 PG 状态；已开始的 SQLite 事务可以完成，结果按持久回执恢复。

默认 `INCEPT_SYNC_ENABLED` 未设置即404；显式启用为 `1`。必须给出 `INCEPT_SYNC_DATABASE_FILE` 绝对路径，拒绝与已配置 v1 imports 路径相同，底层继续拒绝把非 sync DB 初始化为 v2。没有默认 HOME/生产 v2 路径。`INCEPT_SYNC_WORKER_FILE` 仅供受信部署配置指定绝对 worker 文件，不接收 payload 路径。

`INCEPT_SYNC_MAX_QUEUE` 默认16，允许1–64；`INCEPT_SYNC_TIMEOUT_MS` 默认30000，允许100–120000。容量阈值见第6节。新配置没有写入正式 Compose 或任何环境文件。

当前读路径开关策略：上传开关独立于读取；默认 usage loader 始终为 v1。Shadow 对照由隔离测试驱动，不给 `usage` 接临时 compat DB。未来生产读模式开关及 revision/snapshot 失效对接须另行实施并验收；关闭上传开关即可停用本轮外部入口。

## 4. 设备 Schema、身份与管理

AgentDevice 字段：`id`（UUID）、`ownerAccountId`、`name`、`tokenHash`、`tokenHint`、`credentialVersion`、`allowedSources`、`createdAt/updatedAt/lastUsedAt/revokedAt/rotatedAt`。Owner FK 为 Restrict；tokenHash 唯一索引；Owner+revokedAt 索引；DB 检查 hash 格式、有效来源数组、版本正数及名称长度。

Token 格式 `isync_` 加32字节 CSPRNG base64url 密钥，完整密钥256bit。PG保存 SHA-256 摘要及短识别尾码；原文只出现在创建/轮换响应。列表、审计、错误和指标均不返回原文。UI仅内存展示，关闭/切后台即清除，不使用 URL、localStorage 或 analytics。Owner 浏览器仍用自己的安全会话，TOTP不下发设备。

轮换在 PG 事务内更新摘要、版本和时间并审计，旧 Token 随即失效，新的 Token 可继续本设备已有 staging。吊销重复调用保持已撤销时间，拒绝从已吊销设备直接轮换复活。不同 Owner 浏览器会话可管理同一 Owner 设备；最近验证和 credentialVersion 在事务内再次检查。

**修复的兼容问题：** 原型初稿用 CUID，真实旧 Import 的 UUID 校验使七来源兼容测试失败。现改为 UUID；Owner 可用可选 `legacyDeviceId` 显式登记旧 v1 UUID，重复登记409。此操作仅绑定设备身份；来源 scope、旧事件 adoption 和疑义历史仍按 Phase 1 Owner 决策处理，不按名称/时间近似认领。没有修改旧 v1 校验或统计断言。

scope 由 Owner 显式绑定 device/source/session/origin，Device Token 只可更新已登记且来源允许的 scope。自动发现的新 session 如何在 Owner 授权设备命名空间内登记，是 Phase 3 开始前需规划 AI 明确的输入；本轮没有开放设备管理任意 origin 的权限。`requireAgentCredentialVersion` 为未来已认证长连接提供版本/撤销复核接口，尚无 WSS。

真实 PG 测试还创建最小运行角色：可使用迁移表的 CRUD，CREATE/DROP 被拒绝；角色在测试后撤销。测试没有使用或加载生产 DATABASE_URL。

## 5. API、边界与回执

以下均以 `/api/dashboard/sync` 为前缀，响应 `Cache-Control: no-store`，含随机 requestId；错误不带 stack、SQL、请求体或源文件路径。

| URL / 方法 | 权限 | 行为 |
|---|---|---|
| `/devices` GET/POST | 最近验证的 Owner；POST需Origin | 安全列表；登记/一次性 Token；允许显式旧 UUID |
| `/devices/:id` PATCH/DELETE | Owner + Origin | 改名/吊销 |
| `/devices/:id/rotate` POST | Owner + Origin | 轮换并一次性展示新 Token |
| `/devices/:id/scopes` POST | Owner + Origin | 绑定 source/session/origin，校验来源权限 |
| `/status` GET | Owner | 容量、队列、revision、失败码和设备回执计数；无事件详情 |
| `/batches` POST | Device | `{header}`，独立鉴权，begin/resume |
| `/batches/:batchId/pages/:offset` PUT | Device | `{records}`，按 Phase 1 页hash/offset/累计大小验证并持久保存 |
| `/batches/:batchId/commit` POST | Device | 空body或`{}`；等待Worker事务回执；review返回409和持久冲突receipt |
| `/batches/:batchId` GET | Device | 仅本设备staging nextOffset/过期状态或持久receipt和revision |

HTTP batchId 限 URL-safe `[A-Za-z0-9_-]{1,128}`，begin时就检查，避免接受后无法查询。URL query 一律拒绝；Device 请求不能带actor/role等额外字段，也不能以 Bearer 访问 Owner 设备管理。

| 层 | 限制 |
|---|---|
| HTTP header包装body | 144KiB实际读取字节 |
| HTTP page包装body | 544KiB实际读取字节 |
| 管理/可选空commit body | 4KiB；流读取10秒超时408，半读流不当成空commit |
| Phase 1 核心 | header≤128KiB；records≤500且≤512KiB；generation≤250000；staging≤128MiB；TTL24h |
| 每设备 | 180请求/分钟；最多2个执行/等待请求；4个有效在途batch |
| 总队列 | 默认含运行中最多16个请求；硬配置上限64 |

实际流读取同时检查 Content-Length 和读取到的字节，不依赖客户端长度声明；JSON包装预留空间仍低于普通代理1MiB。近512KiB/500条合法页经真实HTTP到达Worker；chunked无长度超限413；501条413。隔离 Nginx 对1048577字节请求真实返回413。当前源码的 Compose 实际选择Nginx，`client_max_body_size 1m`；Caddy保留的fallback也是1048576。两份生产配置均未改。

错误分类：未认证401；设备/来源/Owner权限403（隐藏细节）；payload/offset/过期/缺页和review409；字段/未知版本/非法事件400；body超限413；速率/队列/batch上限429；body读取超时408；SQLite busy、结果未知、容量或后端故障503，并提供可重试场景的Retry-After。旧校验器ImportError被翻译为`INVALID_TRANSFER`，不会把业务校验错误暴露成SQL/stack。

成功以 `receipt.status=committed` 为准。没有202、内存job ID或先成功后落库流程。排队本身没有durable accept响应；超时/断连/Worker终止返回错误或连接终止，调用方先查status，再按相同batch/payload恢复。已有页、旧父CAS、同batch不同payload、同页不同payload、未知collector、受控修订、截断及rollback fence均复用Phase 1。

## 6. Worker、容量、离线作业

沿用现有单独esbuild Worker的构建方式，新增 `dist/dashboard-sync-worker.mjs` 和 `dist/sync-executor.mjs`；原 collection worker 保留。Next真实产物的 route NFT 清单已检查 `tracedSyncWorker=true`，API harness 在 `next start` 中成功加载Worker。

每个Next进程/显式v2路径仅一个全局executor、一个writer Worker；所有SQL热路径在该Worker。全局上传队列与每设备队列有界；派发前复核凭据。取消或执行超时先等待Worker终止释放DB，再运行下一项；进程重启从SQLite staging/receipt恢复，不恢复未durable接收的内存等待项。多实例共享同一v2 DB尚未纳入部署模型，离线维护要求关闭上传并停写；SQLite CAS与有限busy仍作为竞争保护。

busy_timeout25ms、3次额外重试沿用Phase 1。新增计数器供Owner状态查询。指标包括queue/running、完成/失败、最近失败码、最近write/commit耗时、busy、进程RSS、Worker isolate heap、DB/WAL/SHM、staging逻辑字节、可用磁盘和dataRevision。线程共享进程RSS，指标没有伪称独立Worker RSS。

容量对象是 `DB+WAL+SHM`，staging逻辑大小另列，不重复加入磁盘总数。默认：

- ≥1GiB使用量预警；≥2GiB标记人工评审；由 `INCEPT_SYNC_WARN_BYTES/REVIEW_BYTES` 配置。
- 可用空间<5GiB预警；<2GiB拒绝新begin/page，503 `INSUFFICIENT_STORAGE` + Retry-After60；由 `INCEPT_SYNC_WARN_FREE_BYTES/REJECT_FREE_BYTES` 配置。
- 容量警报不删除已提交历史、audit、receipt、provenance或旧v1。`cleanup`只处理Phase 1的过期staging。
- 低盘测试注入statfs结果/阈值，未填充或改动真实卷。测试VFS剩余空间仅为隔离环境读数，生产40GB规划需运行时重新检查。

离线命令：`INCEPT_SYNC_MAINTENANCE=1` 且上传开关关闭，显式传入v2路径、只读v1副本及每次1–10批次。命令在Worker里调用既有幂等迁移；一次退出即暂停，再次运行跳过已迁移批次。`adopt`为同一受信Worker协议的Owner操作，由隔离集成调用验证；没有公开长迁移/认领HTTP入口。原v1副本继续作恢复和正确性oracle。

## 7. 自动化与真实集成结果

| 检查 | 结果 | 性质 |
|---|---|---|
| 起始Dashboard | 32文件442项通过，32.47秒 | 实际现有基线 |
| 最终Dashboard | 33文件449项通过，32.60秒 | 含全部P0/0B/0C/P1；新增7项Worker测试 |
| Sync专项 | 2文件18项通过，6.87秒 | 15项真实PG/HTTP/Worker；3项纯流读取测试 |
| Owner/TOTP+账户UI | 7文件34项通过，16.30秒 | 含原10项；原有DB mocks/纯逻辑/UI测试，未改期望 |
| 原Owner真实PG | 1文件28项通过，28.70秒 | 新建单独 `incept_owner_auth_sync_phase2` 库运行，未跳过 |
| Dashboard专用/src/node/P0/0B/0C/P1/P2 | 7个配置exit0 | 新旧runtime/测试均覆盖 |
| Web sync专用、DB TS | 各exit0 | 不依赖完整Web已有诊断 |
| 完整Dashboard TS | 36条既有诊断，逐行差异0 | 同根目录before/after保留 |
| 完整Web TS | 296→111条，新增诊断行0 | 旧generated client全局类型合并由本schema缓存类型隔离；未重构Docs/Music |
| 变更lint | exit0，0错误/0警告 | 关闭无关Next页面目录规则，保留其他规则 |
| 空白检查 | `git diff --check`通过 | 其他Agent文件仅有原有CRLF提示 |

真实PG套件固定校验回环地址、库名和`current_database()`，只在显式测试URL下运行。测试库由已缓存 `postgres:16-alpine` 新建，未安装依赖、未加载生产env。无URL时的skip是显式环境门槛；本报告列出的15项集成和28项Owner测试均已实际执行。

HTTP测试服务器的Owner Cookie读取适配器是测试框架桥接，但会查询真实PG安全会话并调用真实recent-session校验；Device Token、PG、队列、Worker、SQLite没有mock。Next API harness额外验证原 `next/headers` Cookie读取、Origin和实际路由。异常脱敏一例注入测试错误；低盘/超时夹具是合成注入，未冒充磁盘故障实测。

覆盖还包括：并发创建/重复吊销、旧Token失效、排队期间撤销、来源与设备错绑、随机凭据不进console/audit、缺页/乱序/同batch异payload、100次commit重试、持久revision、Worker退出/重开、SQLite锁耗尽后恢复、4batch限制、TTL、JSON半流超时，以及Owner显式旧UUID重复登记。

### 三窗口全对象对照

合成七来源经真实collector导出统计形状，日期为45天前/15天前/前一日。真实旧loader作oracle；两份v1批次经Worker分次迁移、重放，再逐来源通过HTTP begin/page/commit与Owner精确认领。每步比较：totals/costs、sources/models、daily/monthly、projects/sessions，以及legacy来源/批次显示；集合/并列顺序规范化，不修改值。

| 窗口 | total tokens | sessions | cost USD | 全对象差异 |
|---|---:|---:|---:|---:|
| 7d | 910 | 7 | 0.001015 | 0 |
| 30d | 1820 | 7 | 0.002030 | 0 |
| all | 2730 | 7 | 0.003045 | 0 |

旧v1 rollback后独立v2继续有效；未认领/疑义范围和价格策略沿用Phase 1。HTTP新增验证Codex `50,100,200→50,120,200→50,120,220` 的200/200/220及费用，截断review保留220，Owner rollback到200后设备新批次仍被fence阻挡。单点100→120、弱身份/两世界/其他受控修订继续由完整Phase 1回归覆盖。

## 8. 可复现命令

使用已安装 `.cmd` 和已缓存Docker镜像；脚本夹具在仓库 `packages/dashboard/tools/phase2/`。根目录日志为 `.scratch/sync-agent-phase2/`；包含随机测试数据库凭据的env/URL文件保持ignored，不提交、不展示。

```powershell
# 根目录，先按本轮方式创建全新隔离PG，写入随机测试凭据到ignored pg-url.txt
$env:DATABASE_URL = (Get-Content .scratch/sync-agent-phase2/pg-url.txt -Raw).Trim()
./packages/db/node_modules/.bin/prisma.cmd validate --schema packages/db/prisma/schema.prisma
./packages/db/node_modules/.bin/prisma.cmd generate --schema packages/db/prisma/schema.prisma
./packages/db/node_modules/.bin/prisma.cmd migrate deploy --schema packages/db/prisma/schema.prisma
node packages/dashboard/tools/build-runtime.mjs
$env:TEMP = 'D:/Desktop/code/code/Incept/.scratch/sync-agent-phase2/tmp'
$env:TMP = $env:TEMP

# cwd packages/dashboard
./node_modules/.bin/vitest.cmd run
foreach ($c in @('src','node','phase0','phase0b','phase0c','phase1','phase2')) {
  ./node_modules/.bin/tsc.cmd --noEmit -p "tsconfig.$c.json"
}

# cwd apps/web；DATABASE_URL仍是上面专用sync库
$env:INCEPT_SYNC_TEST_DATABASE_URL = $env:DATABASE_URL
./node_modules/.bin/vitest.cmd run src/server/sync/__tests__
./node_modules/.bin/vitest.cmd run src/server/auth/__tests__/sensitive-imports.test.ts src/server/auth/__tests__/sensitive-action.test.ts src/server/auth/__tests__/owner-security.test.ts src/features/settings/account/__tests__
./node_modules/.bin/tsc.cmd --noEmit -p tsconfig.sync.json

# 原Owner真实PG：使用已新建/迁移的另一专用库，不与sync套件并发清理同一库
$env:INCEPT_AUTH_TEST_DATABASE_URL = $env:DATABASE_URL.Replace('/incept_sync_phase2?','/incept_owner_auth_sync_phase2?')
$env:DATABASE_URL = $env:INCEPT_AUTH_TEST_DATABASE_URL
$env:INCEPT_AUTH_ENCRYPTION_KEY = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
./node_modules/.bin/vitest.cmd run src/server/auth/__tests__/owner-db.integration.test.ts

# 根目录，保留同cwd完整诊断，before是任何本轮修改前捕获的文件
./packages/dashboard/node_modules/.bin/tsc.cmd --noEmit -p packages/dashboard/tsconfig.json *> .scratch/sync-agent-phase2/dashboard-types-after.txt
Compare-Object (Get-Content .scratch/sync-agent-phase2/dashboard-types-before.txt) (Get-Content .scratch/sync-agent-phase2/dashboard-types-after.txt)
./apps/web/node_modules/.bin/tsc.cmd --noEmit -p apps/web/tsconfig.json *> .scratch/sync-agent-phase2/web-types-final.txt
./packages/db/node_modules/.bin/tsc.cmd --noEmit -p packages/db/tsconfig.json
./apps/web/node_modules/.bin/eslint.cmd --config apps/web/eslint.config.mjs --rule '@next/next/no-html-link-for-pages: off' apps/web/src/server/sync apps/web/src/app/api/dashboard/sync apps/web/src/features/settings/account/sync-devices-panel.tsx apps/web/src/features/settings/account/owner-account-panel.tsx apps/web/next.config.ts packages/db/src/agent packages/db/src/client.ts packages/dashboard/src/sync packages/dashboard/src/__tests__/phase2 packages/dashboard/tools/build-runtime.mjs packages/dashboard/tools/sync-agent-phase2-maintenance.mjs packages/dashboard/tools/sync-agent-phase2-benchmark.mjs packages/dashboard/tools/phase2/loop-metrics.mjs packages/dashboard/src/adapters/local/imports/sync/store.ts
git -c core.fsmonitor=false diff --check

# Next API harness：新容器只读挂载源码到/fixture-src，运行harness-start.sh，CI=1禁止自动安装
# 新建仅测试网络/PG/代理，代理用tools/phase2/nginx.conf；Next runtime限制768m且swap同为768m
# 每次重启后重新查询随机回环端口，然后运行客户端；参数均指向本轮隔离资源
node packages/dashboard/tools/sync-agent-phase2-benchmark.mjs (Get-Content .scratch/sync-agent-phase2/http-base.txt -Raw).Trim() .scratch/sync-agent-phase2/pg-url.txt docs/research/sync-agent-phase2-benchmark.json incept-sync-phase2-harness3-01a1447b

# 离线迁移例：停用上传/停写后，传入独立v2 DB和一致性v1副本绝对路径
$env:INCEPT_SYNC_MAINTENANCE='1'
$env:INCEPT_SYNC_ENABLED='0'
node packages/dashboard/tools/sync-agent-phase2-maintenance.mjs <absolute-v2-db> <absolute-v1-copy> 1
```

## 9. 性能、资源与构建边界

完整数值见 [benchmark JSON](sync-agent-phase2-benchmark.json)，最终测量起点 `2026-10-17T01:09:56.603Z`。Windows客户端→隔离Nginx→Linux Next16.4.0/Node24.21.0→真实PG→Worker→独立SQLite。Next运行时cgroup硬限制768MiB，MemorySwap同值；实际检查OOMKilled=false。PG另一个256MiB容器、代理另一个32MiB容器，均不计入Next预算。每规模1次，不能当稳定分位基准。

| 事件 | pages | 上传wall ms | commit wall ms | 服务进程CPU ms | 累计cgroup采样峰值 MiB | 采样进程RSS MiB |
|---:|---:|---:|---:|---:|---:|---:|
| 700 | 2 | 178.30 | 49.34 | 173.14 | 135.96 | 140.55 |
| 7000 | 14 | 894.09 | 312.10 | 774.52 | 227.62 | 197.39 |
| 15700 | 32 | 1832.35 | 648.96 | 1445.69 | 309.43 | 221.05 |
| 70000 | 140 | 8189.19 | 3253.73 | 6610.28 | 634.71 | 243.30 |

两设备各15.7k同时上传总wall3224.79ms，两份receipt分别revision5/6；普通harness页面29次采样，失败0，P50=4.34ms，P95=11.47ms。结束时累计cgroup采样峰值658.38MiB，进程RSS252.52MiB；主事件循环累计P99=10.72ms、最大114.10ms（含冷启动/空闲期）。指标每250ms采样，Worker heap是操作后值；cgroup含文件缓存，RSS采样时点不同，二者不作相减。实际硬限制和OOM状态单独核验。

各规模使用不同设备/scope，最后共124800可见事件。最后DB222.83MiB、WAL176.40MiB、SHM0.34MiB，总399.57MiB，未完成staging=0。保留WAL而未为数字好看强制checkpoint/删除；文件总量是测试序列累计值。Phase 1的288重合v1批次、磁盘放大与费用结果随449项回归保留，本轮没有用独立Windows进程RSS代替容器测量。

**完整站点阻断：** 缓存发布镜像只有生产依赖，完整Web重建缺 `@tailwindcss/postcss` 和Dashboard peer构建解析。没有安装包。初次harness的Next还尝试自动补TypeScript开发依赖，现有modules配置冲突使其失败；随后夹具设置CI=1禁止自动安装，使用JS入口复用真实TS业务模块。harness构建时跳过类型预检，九项实际源码TS检查在宿主独立执行。API route NFT/next start/真实Cookie和Worker成立；完整Incept页面、其余Worker及整站峰值仍须有可构建环境补验。最小未满足项是完整站点构建依赖环境及其768MiB并发测试。

Windows Prisma DLL被共享进程占用时，未终止其他Agent进程；在本db包的ignored独立目录生成同版本客户端，只刷新JS/类型并保留已加载native engine。Linux隔离容器中正常生成成功。此类环境故障与业务失败都保留在scratch日志，旧断言没有删除或改写。

## 10. 已修问题与未解决事项

已修：测试服务器URL桥接重复路径；空HTTP body与chunked读取边界；超时半流误判空commit；非法v1派生事件错误分类；schema缓存类型合并；CUID/v1 UUID不兼容；新测试rollback调用签名。原统计断言、近512KiB边界和旧测试期望均保持。

未解决/准入依赖：

1. 提供已有构建依赖的隔离完整Web环境，或另行批准补齐本地依赖，再执行原站点build/start、普通页面与两设备上传并发、整站cgroup768MiB和停止/重启验收。
2. 原完整Web111条诊断仍在；新增诊断行0，专用代码和DB检查均通过。后续整站类型修复独立安排。
3. Phase 3前确定新session/origin登记策略；当前必须Owner明确绑定，已有v1 UUID只能Owner显式选择，后续adoption仍逐范围审阅。
4. 历史保留造成的磁盘增长、长期审阅频率、完整站点剩余内存及多实例写者模型尚待后续真实负载评估；本轮没有静默历史清理。

## 11. 生产迁移与回滚预案（仅制定，未执行）

1. 先核实运行时空闲空间与DB/WAL/SHM预算；选择维护窗，关闭上传并排空队列，暂停人工Import写入以固定迁移边界。
2. 对旧v1使用SQLite一致性backup生成独立副本，包含WAL内已提交内容；若停机文件级备份，DB/WAL/SHM在同一停写边界成组处理。另保存PG元数据、v2一致性backup、定价/映射配置指纹及恢复校验和；禁止仅复制正在写入的主DB文件。
3. 在shadow v2中按有限批次迁移，二次重放应无新增；已有v1仍保留。登记真实凭据后执行明确adoption/review；显示任何未解释统计或provenance差异即阻断切换。
4. 双读逐字段比较7d/30d/all及价格/批次状态，核验回滚、防复活和revision。未来读开关默认v1，只有新授权及零差异验收后才接v2；缓存键需接dataRevision及原有配置维度。
5. 发布前复核实际代理body/超时、worker追踪产物、权限、单writer部署和完整容器内存；本轮不修改/重载任何代理或Compose。
6. 回滚时关闭上传入口并停写，默认读回v1；保留v2账本及未发送Agent outbox（未来阶段）供审阅。若恢复DB，用一致性backup成组恢复并核验receipt/revision，不把旧active快照覆盖成自动复活。后端metadata迁移为加法表，停用代码即可保留审计与设备数据，不要求删除表。

本轮测试资源均有独立 `incept.test=sync-phase2-01a1447b` 标签，收尾停止这些测试容器，保留容器文件系统/测试库及ignored日志供复核；未操作其他容器。停止后需按报告重新启动测试资源并更新随机回环端口。

## 12. Phase 3 输入契约（待授权）

- 设备ID使用后端返回的UUID；已有v1身份由Owner显式指定，语法与旧v1完全相同。自动出现的新session/origin授权策略先由规划AI决定。
- Device Token用`Authorization: Bearer`，仅在受信设备安全存储中持有；不使用Owner Cookie/TOTP、URL参数或浏览器localStorage。
- 持久outbox保存派生header与完整页边界，遵守128KiB/500条/512KiB/128MiB限制；每分钟180请求意味着大代需按Retry-After分时恢复。
- 只有`receipt.status=committed`推进本地已确认cursor/lineage；`review-required`保留旧视图并进入审阅。ACK丢失、断连或`RESULT_UNKNOWN`先GET本batch状态；已提交后重复page遇404也先读receipt。
- 429/503保留outbox并按Retry-After退避；401需要Owner处理轮换/吊销，不自动回退到Owner认证；相同batch必须保持相同payload。
- 使用dataRevision识别云端已提交可见版本。本轮没有采集循环、Windows安装/自启、WSS或远程sync-now任务。

**最终结论：P2-A PASS；P2-B PASS；P2-C CONDITIONAL；P2-D BLOCKED。生产触碰：否。Phase 3：等待单独验收与授权。**
