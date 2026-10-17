# Incept Sync Agent Phase 1：增量存储与 v1 兼容层验收

日期：2026-10-16，Asia/Singapore。分支 `codex/production-readiness`，HEAD `aef64f4`。本轮遵守 [Phase 1 执行计划](../plans/incept-sync-agent-phase1-execution-plan.md)，并沿用 [Phase 0C 有限准入](sync-agent-phase0c-evidence.md)；旧计划中的暂停结论由本轮授权替代。

## 1. 阶段结果与停止位置

| 阶段 | 结果 | 验收证据 |
|---|---|---|
| P1-A | PASS | Node 可复用 v2 类型、严格校验、来源规则、冻结计价；当时完整 Dashboard 390 项通过 |
| P1-B | PASS | 规范化持久状态、generation 差量账本、staging、CAS、原子 receipt/revision、有限 busy retry；当时398项通过 |
| P1-C | PASS | 隔离 v1 迁移、精准认领、统一读取、旧价/回滚/来源引用；当时403项通过 |
| P1-D | PASS | 最终32文件、442项测试全部通过，新增61项；38次独立资源测量完成，最高新路径 RSS 302.72MiB |

最终回归包含全部阶段的最终实现以及原 Phase 0/0B/0C。三窗口全对象统计差异为0；既有36条完整 TS 诊断逐行未变。新增接口保持私有、未挂载，默认 Dashboard 仍走旧 loader/Import/快照路径。本轮到此结束，Phase 2–6 和生产切换均未开始。

## 2. 工作树与变更清单

开始工作树只有此前未跟踪的两份计划、研究文档及 Phase 0/0B/0C 成果；没有 tracked 修改。没有切分支、stash、提交或覆盖这些文件。本轮成果均为新增文件。收尾时其他工作产生了 `apps/web/src/components/layouts/site-header{,-mo}.tsx`、`apps/web/src/messages/{en,zh}/navigation.json` 的 tracked 修改及 `apps/web/src/app/[locale]/operations/`、`apps/web/src/features/operations/` 新文件；全部保留，不计入本轮交付。

以下路径除文档外，相对于 `packages/dashboard/`：

| 文件 | 用途 |
|---|---|
| `src/domain/sync.ts` | v2 scope、manifest、range、record、actor、receipt/conflict 类型 |
| `src/adapters/local/imports/sync/contract.ts` | 版本/大小/字段校验，源格式、父版、范围和记录资格；累计差量核验 |
| `.../sync/pricing.ts` | captured basis、recorded/calculated、nominal、API-equivalent、峰谷规则 |
| `.../sync/store.ts` | 独立 SQLite schema、staging、原子提交、不可变版本、回滚/重建、审阅与有界分页 |
| `.../sync/service.ts` | 私有 ingest、按字节/条数分页、dataRevision 读取版本约束 |
| `.../sync/legacy.ts` | 只读 v1 副本迁移、精确认领、审计与 legacy/provenance 物化投影 |
| `.../sync/read.ts` | 规范化统一读模型及实际热点 SQL |
| `.../sync/index.ts` | 为后续受信 Node 调用方预留的私有入口；未加入默认 package/HTTP 导出 |
| `src/__tests__/phase1/fixtures.ts` | 实际 collector capsule→派生证据的测试适配器，以及统计协议 fixtures |
| `src/__tests__/phase1/{contract,store,legacy,acceptance}.test.ts` | 共61项新增测试（9/8/9/35） |
| `src/__tests__/phase1/process-worker.ts` | 独立进程崩溃、丢 ACK 和 writer contention |
| `src/__tests__/phase1/benchmark-worker.ts` | 合成容量/兼容读取测量子进程 |
| `tools/sync-agent-phase1-benchmark.mjs` | 700/7k/15.7k/70k、1/288批次、认领前后，共38次测量 |
| `tsconfig.phase1.json` | 新代码/测试专用 TS 入口 |
| `docs/research/sync-agent-phase1-benchmark.json` | 完整数值、CPU/RSS/DB/WAL 和 EXPLAIN QUERY PLAN |
| 本文件 | 阶段、Schema、覆盖、性能、风险、回滚和后续依赖 |

没有修改旧 collector、`imports/{exporter,identity,matching,store,layer,service}.ts`、现有 domain imports、loader、refresh/snapshot-store、Owner/TOTP、Docs/Music、Prisma 或部署配置。

## 3. 实现契约与信任边界

### 3.1 私有 service

入口为 `src/adapters/local/imports/sync/index.ts`。构造必须显式传入绝对 SQLite 路径；没有默认 HOME、环境开关或 `/data` 路径。遇到已有非 sync 数据库立即拒绝，不把旧 v1 DB 当成新库初始化。

基本调用顺序是 Owner 注册 scope → `begin(header, actor)` → `stage(device,batch,offset,records,actor)` → `commit(...)`。`ingest` 是同进程便利入口，也遵守相同分页与幂等约束。`CompatibleSyncService` 另提供 `migrateV1`、`adopt`、`rollback`、`rebuild`、`reviews/reviewPage/resolveReview`、`legacyReviews`、`currentPage`。`readSyncView` 返回单一视图和持久 dataRevision。

`SyncActor` 是**受信服务端调用上下文**。本地测试使用显式桩；设备不能调用 Owner 注册/认领/重算/epoch/回滚/审阅操作，也不能使用另一设备 scope。本轮没有身份令牌、HTTP 上传入口或新的认证机制。Phase 2 必须在鉴权完成后构造 actor，不能从请求体直接采信 role/deviceId；Owner 入口继续接原敏感操作门禁。

### 3.2 v2 schema 与大小边界

- 严格字段白名单、source/reader 格式匹配、`version=2`、`collectorVersion=incept-collector/1`、已知 schedule；额外字段和未知版本拒绝。v1 validator 原样保留。
- scope=(device, source, session)，origin 独立绑定；强实体 ID 来自 scope+native key。Codex/弱身份属于 session 实体。observation hash 是不可变内容版本 ID，membership position 是代内位置，两者都不伪装成稳定请求身份。
- manifest 含父 generation/manifest hash、epoch、读取状态/三 root、哈希 locator/文件身份、范围 root、non-usage/schema envelope、旧范围保留见证、record count/sequence hash、basis/mappings hash。
- 每页最多500条、record 数组512KiB；header最多128KiB；完整 generation最多250000条、staging最多128MiB，24小时TTL。便利入口同时按条数和字节切页，长元数据501条的正例已验证。
- 空/乱序/缺失/变 payload 页、错误 scope、非法数值、超限和过期拒绝；中断从持久 nextOffset 恢复。`cleanup` 只清过期未完成 staging；已提交和隔离 proposal 的统计 observation 留在规范化历史中。
- Token 数值要求安全整数；完整 generation 跨页累计及所有可见 v2 scope 总和再次校验。持久 `token_total` 随提交、回滚和重建同步，超出安全整数范围返回 `TOKEN_TOTAL_OVERFLOW`。统一读取也校验 native/legacy/v2 合并总量。

不传 raw capsule 或对话全文，不在服务器重放真实 collector。派生 root/witness 由受信采集器按来源计算；服务端核对登记 scope、已知父版、证据结构、来源规则和旧成员保留。真实性前提与有限 observed-history 含义沿用0C。测试适配器继续用合成文件、SQLite backup 和真实 collectors 验证这些 vectors。

### 3.3 接纳和费用

首次正常基线标为 `baseline-observed`，后续合法变化为 `since-enrollment`。JSONL 检查原字节范围，JSON/SQLite 使用相应逻辑保留证据，物理文件缩小本身不判删除。所有 rotation witness 都要单独绑定服务端父范围；共存别名也不能绕过检查。

强键 usage/cost 修订保留原生键、时间及非 usage envelope；晚到旧时间的新键可以插入排序中。Codex 按累计序列重算完整 session，验证原点/点顺序/显式时间、非负单调计数和 delta。缺锚点改写、epoch/reset、弱旧行覆盖、Antigravity alias/BLOB、无桥接轮转、换库、未知 schema/envelope 或 reader/collector 变化进入审阅，旧 generation 保持。

普通设备不能隐式改变 raw model/envelope、captured basis 或 mappings。legacy/native 仍使用 receiver live override；v2按捕获 rates/aliases/schedule计价，Owner显式 `reprice` 形成独立版本。recorded、nominal、quota和API-equivalent保留区分；API报价缺失时API-equivalent为null，并保留missingPricing语义。CommandCode峰谷不改模型身份。

Owner `rebase` 要求新epoch和明确新基线，不复用丢失范围的假前缀证明。回滚后有lineage栅栏；普通上报不复活旧修订。审阅记录可分页读取和显式解决，proposal及审计保持可追溯。

## 4. SQLite Schema、事务及恢复

精确DDL在 `sync/store.ts::SYNC_SCHEMA` 和 `sync/legacy.ts`。所有表属于新独立 DB。

| 表组 | 主键/索引与作用 |
|---|---|
| `sync_meta` | schema_version=2、持久data_revision |
| `sync_origins / sync_scopes` | origin和scope唯一；绑定、head manifest/generation、visible generation、rollback fence、可见token_total |
| `sync_manifests / sync_generations` | 不可变header/版本；父代、冻结basis/mappings、rolled标记、版本token_total |
| `sync_entities / sync_observations` | 稳定实体与不可变内容版本分开；时间索引，不按旧计数hash覆盖实体 |
| `sync_changes / sync_current` | generation差量账本与当前membership；scope+position索引，未变成员不逐代复制 |
| `sync_staging / sync_stage_pages / sync_stage_records` | device+batch、offset/position复合主键，页hash、恢复offset、字节数、TTL |
| `sync_receipts / sync_audit` | device+batch唯一回执、payload hash、动作主体/引用/revision |
| `sync_reviews / sync_review_members / sync_review_resolutions` | 去重proposal、持久统计成员、Owner解决记录；不依赖临时staging留存 |
| `sync_legacy_batches / sync_legacy_members / sync_legacy_prices` | 旧rowid顺序、checksum、不可变来源hash、状态/receipt、metadata、membership、captured catalogs |
| `sync_adoption_decisions / sync_adoption_grants / sync_adoptions` | Owner决定、暂存授权、已激活逐引用映射；共用决定与每成员目标分开 |
| `sync_legacy_projection / sync_legacy_quarantine / sync_provenance` | 去重legacy variants、后到人工重合审阅、去重来源引用；热读不遍历所有历史membership |

WAL、synchronous=FULL、32MiB SQLite page cache、mmap关闭、临时排序用文件。busy_timeout默认25ms，最多3次重试，间隔5/10/15ms；上限可在明确范围内配置，耗尽返回 `SQLITE_BUSY_EXHAUSTED`。

最终sequence/count、父版CAS、资格、observation/delta、可见切换、adoption/provenance、审计、receipt和dataRevision在同一事务完成。暂存页从不参与read model。新manifest检查点可以保存而不增加无变化扫描的dataRevision；统计/价格/epoch/可见归属变化才使读取版本失效。

`currentPage` 返回有界记录、nextOffset和dataRevision；跨页指定expectedRevision，变更后拒绝旧游标。`readSyncView` 在同一个SQLite读事务读取视图和revision。既有磁盘/内存快照代码没有切换；新调用方可用revision约束自己的缓存，receiver配置继续属于调用上下文。

三处故障注入均完整回滚；真实进程在可见UPDATE之后、COMMIT之前exit23，新进程仍见旧数据、无新receipt，持久页可重试。generation/current与legacy/provenance投影可从不可变版本账本和原始来源关系重建。

## 5. v1 兼容、认领和唯一读取

迁移只读**隔离v1副本**，按旧rowid一次处理一个batch；保存checksum、不可变payload语义hash、原receipt/映射/价格/顺序，拆为去重observation和membership。原副本继续保留完整原始payload。中断重入、二次重放不增加成员或revision；receipt的rollback只允许向前，旧快照的active状态不能复活已撤membership。

统一读模型保留：最早有效批次、weak→strong桥接/歧义、native优先和indexed替换例外、手动project mappings、legacy live价格与catalog继承。读取真实旧loader作oracle；运行时没有创建临时compat DB。

首次v2碰到未认领v1同scope时保持legacy并返回review。Owner可在scope/设备、完整内容一对一、mappings和相关captured价格一致时精确认领；多对一、不明历史和价格/映射差异需明确审阅。授权绑定完整manifest与旧checksum/positions；只有成功提交才激活隐藏旧引用。

逐成员provenance保留strong表示实际选中的旧批次，不能简单给整个scope统一标最老batch。物化投影对重复membership去重，保留每个target/旧ID最早来源。v1后到且撞上已见v2时保留当前v2、隔离冲突membership并列入legacyReviews，避免直接相加。

v1 rollback仅撤其支持，已独立提交的v2仍在；v2 rollback选择此前未回滚版本，所有v2撤回后恢复仍active的legacy。Owner恢复或换reader须走新epoch/审阅，不能用新batch静默复活。

## 6. 覆盖矩阵与统计

| 验收项 | 最终证据 |
|---|---|
| 七来源+fallback普通追加 | 真实collector→派生DTO→规范化runtime均从100到200；支持源再修订至240，Antigravity/fallback旧改写保持200并审阅 |
| Codex | 单点100→120；50/100/200→50/120/200→50/120/220总量200/200/220，费用同步 |
| Gemini两世界 | 相同当前字节，单条父版unchanged；双条父版PREFIX_LOST并保留200 |
| 弱/旧事件/不完整 | 五来源弱改写拒绝；八天前新native键被接纳；半写、读失败、截断保持旧版 |
| 轮转与DB | 四来源有证交接不重复；额外无绑定witness拒绝；三DB换文件身份拒绝；SQLite逻辑追加/VACUUM及JSON重新序列化缩小仍正确 |
| 来源/版本 | source/reader/kind、父版、schema envelope、collector未知版本、缺native锚点冒充强身份均有失败路径 |
| staging/并发 | 断点重开、缺页、乱序、异payload页、TTL、长元数据超一页、旧revision分页、两个writer父版CAS |
| durable commit | 100次重试、三处事务故障、第二连接读者、真实进程exit23、失ACK重试、writer锁释放和有限busy耗尽 |
| v1迁移/认领 | 中断续跑、二次重放、weak→strong、weak多对一审阅、手动映射、双批次rollback、后到v1隔离、旧active快照栅栏 |
| 费用/权限 | live/frozen区别、Owner reprice及rollback、nominal/peak/off/API-equivalent、Owner操作与设备角色隔离 |
| 审阅/恢复 | proposal超过TTL仍在、显式Owner解决、重建current/legacy/provenance、rollback栅栏 |
| 数值边界 | 单页合法但跨页总量溢出拒绝；两个各自合法scope合计溢出拒绝；旧可见视图保留 |

三窗口fixture：真实七来源导出的统计形状，每来源一session，在45天前/15天前/前一日各一条；now=`2026-10-16T12:00:00Z`，Asia/Singapore。

| 范围 | input | output | cacheRead | cacheCreate/reasoning | total | sessions | cost USD | 全对象差异 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 7d | 700 | 140 | 70 | 0/0 | 910 | 7 | 0.001015 | 0 |
| 30d | 1400 | 280 | 140 | 0/0 | 1820 | 7 | 0.002030 | 0 |
| all | 2100 | 420 | 210 | 0/0 | 2730 | 7 | 0.003045 | 0 |

比较包括totals/costs、daily/monthly、sources/models/projects/sessions及批次显示字段，只对语义集合/并列顺序排序。每来源认领后立即比较，迁移重放、重建及v1 rollback后再比较。原0B含非零cacheCreation/reasoning的966/1932/2898基线也随82项旧测试继续通过。

CommandCode单独全对象比较峰/谷：nominal各0.2、quota0.4/0.2，总0.6；API-equivalent峰值0.00029单列验证。旧v1没有该新字段，未把缺字段伪称为已有API费用。

## 7. 失败摘要与修复

所有失败保留断言并修复实现/合法fixture输入；未改旧测试期望。

- v2重算factory曾把传入旧manifestHash混入新hash，Owner reprice测试报MANIFEST_HASH_MISMATCH；factory现在先剥离旧派生ID，再重新生成。
- 将非Codex规则拆出后遗留不可达类型分支，TS报错；删除死分支后专用/src/node全部通过，旧36条诊断不变。
- 新Codex参数表最初被Vitest按数组展开；改成具名values对象，累计总量断言保持。
- **实质校验缺口：** 旧范围不变时额外无效rotation witness曾返回unchanged。新增反例复现后暂停D验收，修复为逐一核对所有witness及其父范围；当前返回ROTATION_UNVERIFIED，旧100保持。
- CommandCode轮转fixture最初落在collector不扫描的二级子目录；改用真实支持的projects下一层目录，实际collector交接正例通过。
- weak→strong来源引用按scope最老batch不够；改为逐成员映射并以真实旧reader验证strong批次引用。读时遍历所有adoptions的问题随后用持久去重provenance投影消除，并补了认领后288批次benchmark。
- 收尾数值边界检查补上跨页、跨scope安全整数总量约束，避免局部合法的大计数累加后失去精度；新增反例通过，原可见generation保持。

## 8. 命令与结果

全程使用已安装二进制，没有安装依赖或调用Corepack下载。

```powershell
# 根目录准备，仅使用本轮隔离路径
$env:TEMP = 'D:/Desktop/code/code/Incept/.scratch/sync-agent-phase1/tmp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null

# cwd packages/dashboard
./node_modules/.bin/vitest.cmd run
./node_modules/.bin/vitest.cmd run src/__tests__/phase1
./node_modules/.bin/tsc.cmd --noEmit -p tsconfig.phase1.json
./node_modules/.bin/tsc.cmd --noEmit -p tsconfig.src.json
./node_modules/.bin/tsc.cmd --noEmit -p tsconfig.node.json
./node_modules/.bin/tsc.cmd --noEmit -p tsconfig.phase0.json
./node_modules/.bin/tsc.cmd --noEmit -p tsconfig.phase0b.json
./node_modules/.bin/tsc.cmd --noEmit -p tsconfig.phase0c.json

# 根目录；before/after使用相同cwd和命令
& packages/dashboard/node_modules/.bin/tsc.cmd --noEmit -p packages/dashboard/tsconfig.json *> .scratch/sync-agent-phase1/types-after.txt
Compare-Object (Get-Content .scratch/sync-agent-phase1/types-before.txt) (Get-Content .scratch/sync-agent-phase1/types-after.txt)
./apps/web/node_modules/.bin/eslint.cmd --config apps/web/eslint.config.mjs --rule '@next/next/no-html-link-for-pages: off' packages/dashboard/src/adapters/local/imports/sync packages/dashboard/src/domain/sync.ts packages/dashboard/src/__tests__/phase1 packages/dashboard/tools/sync-agent-phase1-benchmark.mjs
node packages/dashboard/tools/sync-agent-phase1-benchmark.mjs
git -c core.fsmonitor=false diff --check

# cwd apps/web；均为纯逻辑/已mock数据库的现有测试
./node_modules/.bin/vitest.cmd run src/server/auth/__tests__/sensitive-imports.test.ts src/server/auth/__tests__/sensitive-action.test.ts src/server/auth/__tests__/owner-security.test.ts
```

| 检查 | 结果 |
|---|---|
| 开始Dashboard | 28文件、381项通过，29.92秒 |
| 最终Dashboard | 32文件、442项通过，37.15秒；failed/skip/todo为0 |
| 最终新增专项 | 4文件、61项通过（最终全量运行包含全部专项） |
| 专用/src/node/P0/0B/0C TS | 六项exit0 |
| 完整Dashboard TS | exit2、36条既有诊断；before/after逐行changedLines=0 |
| 新TS/MJS lint | exit0，0 errors、0 warnings；仅关闭无关Next页面目录规则 |
| 现有Owner/TOTP/敏感Import | 3文件、10项通过，2.85秒 |
| 空白/范围 | 本轮全部新增文件；新文件另查尾随空白；历史P0/0B/0C未修改；并行Operations/导航成果保留 |

日志在 `.scratch/sync-agent-phase1/`，不交付原始用户日志。完整Web/Prisma类型与PostgreSQL真实集成仍是P0记录的独立环境事项，本轮没有运行真实PG或顺带重构。

## 9. 性能：实测而非内存估计

原始数值见 [38次测量](sync-agent-phase1-benchmark.json)，本次开始时间为 `2026-10-16T15:21:25.874Z`。Node v24.21.0、Windows、16逻辑CPU。每操作独立子进程，Node heap上限512MiB、SQLite cache32MiB。写/迁移/认领各1次；读为暖缓存3次，表内读延迟和CPU为中位，RSS为该组最大kernel maxRSS。RSS包含进程启动及合成写入payload；准备时间不计操作wall/CPU。宿主机同时有回归/类型检查及其他工作，wall包含该环境的调度影响；未采用独占主机。

### 9.1 真实规模模拟

| 事件 | 写wall ms | 写CPU ms | 写峰值RSS MiB | 读wall中位 ms | 读CPU中位 ms | 读峰值RSS MiB | checkpoint后DB MiB |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 700 | 137.53 | 188 | 63.90 | 100.51 | 79 | 62.31 | 1.91 |
| 7000 | 1377.37 | 938 | 101.95 | 567.71 | 469 | 89.73 | 17.09 |
| 15700 | 2123.13 | 1751 | 142.89 | 946.49 | 1016 | 125.68 | 38.07 |
| 70000 | 8044.59 | 7079 | 302.72 | 2716.40 | 2844 | 294.16 | 169.45 |

### 9.2 288个重合v1批次及全部认领后的读取

均为700个逻辑事件，原始membership=201600。

| 操作 | wall ms | CPU ms | 峰值RSS MiB | DB MiB |
|---|---:|---:|---:|---:|
| 迁移1批次 | 51.41 | 62 | 63.62 | 1.32 |
| 迁移288批次 | 33483.51 | 20922 | 259.03 | 106.36 |
| 旧loader读1批次 | 58.30 | 46 | 59.97 | 原副本0.26 |
| 旧loader读288批次 | 4172.51 | 4531 | 438.86 | 原副本70.91 |
| 新legacy投影读1批次 | 54.20 | 63 | 63.11 | 1.32 |
| 新legacy投影读288批次 | 48.25 | 46 | 65.77 | 106.36 |
| 认领全部288批次（一次性） | 12108.51 | 11250 | 285.63 | 326.81 |
| 认领后混合视图读1批次 | 47.82 | 62 | 62.09 | 3.70 |
| 认领后混合视图读288批次 | 44.79 | 47 | 64.86 | 326.81 |

认领后current=700、provenance=700、observation版本=1400（旧未验证表示和新有native证据表示分层），可见事件仍700。读延迟没有201600份batch记录的JSON解析因子。

**磁盘代价明确保留：** 规范化账本保留原始membership、认领目标、审计及可复用freelist。288批次迁移后106.36MiB，全部认领后分配326.81MiB；独立原始v1副本另占70.91MiB。认领事务在checkpoint前DB+WAL+SHM约538.46MiB。这个实现优先保留来源关系与恢复依据；后续生产迁移前应评估整数外键/离线压缩、freelist回收和保留周期。

所有新路径最高RSS302.72MiB，距768MiB预算约465.28MiB。基准是独立Node进程；Next/PG/完整容器及多worker并发属于后续获批集成验收。大量数据验证/提交和旧批次迁移为同步Node工作，Phase 2接入时须选择worker/作业调度与限流，33.48秒的一次性迁移应放入后台作业。

### 9.3 实际热点SQL

完整SQL常量在 `sync/read.ts`，EXPLAIN结果随benchmark JSON保存。

```sql
-- legacy：只读去重variants，不读旧payload
SELECT p.*,o.record_json FROM sync_legacy_projection p
JOIN sync_observations o ON o.id=p.observation_id
LEFT JOIN sync_adoptions a ON a.batch_id=p.batch_id AND a.position=p.position
LEFT JOIN sync_scopes s ON s.scope_id=a.scope_id
WHERE s.visible_generation IS NULL ORDER BY p.source_order,p.position;

-- v2：current membership + immutable observation + selected frozen basis
SELECT c.*,o.record_json,g.basis_json,g.mappings_json,r.scope_json,r.label
FROM sync_current c JOIN sync_observations o ON o.id=c.observation_id
JOIN sync_scopes s ON s.scope_id=c.scope_id
JOIN sync_generations g ON g.id=s.visible_generation
JOIN sync_origins r ON r.scope_id=c.scope_id ORDER BY c.scope_id,c.position;

-- provenance：物化后每个目标/旧ID只留最早来源
SELECT p.* FROM sync_provenance p JOIN sync_scopes s ON s.scope_id=p.scope_id
WHERE s.visible_generation IS NOT NULL ORDER BY p.source_order;
```

逐scope有界分页另用 `WHERE c.scope_id=? AND c.position>=? ORDER BY c.position LIMIT ?`，并同时返回revision。全量聚合读模型的内存随唯一可见数据/variant及小批次catalog增长，已经实测70k；不是每次重放所有历史JSON。

## 10. 风险、回滚与后续判断

已知边界：首次观察前和未观测中间历史采用0C有限语义；压缩、换库、弱改写、Antigravity alias/BLOB、未知读取格式/版本保持审阅。原始文件真实性依赖未来经过认证的受信采集器，服务端不接收原始日志。真实审阅频率没有长期设备采样。

本地回滚很直接：默认路径始终未接新service；停止本轮私有调用，保留或移走新独立sync DB即可。原v1副本、人工Import和现有数据库没有被覆写。若要删除源码，仅移除本报告清单中的本轮新增文件及本轮隔离产物，保留此前计划/研究/其他Agent成果。已提交generation可用Owner rollback恢复，完整重建依据仍在。

需由用户/规划AI后续判断：磁盘增长/来源保留预算、生产迁移和读路径切换方案、Phase 2的真实设备凭据/撤销/授权上下文构造、上传限流和worker调度、Owner审阅接现有敏感门禁，以及完整容器并发验收。均应在新的授权范围内实施。

**本轮Phase 1验收结束：P1-A / P1-B / P1-C / P1-D 全部 PASS。生产触碰：否。下一阶段：等待独立授权。**
