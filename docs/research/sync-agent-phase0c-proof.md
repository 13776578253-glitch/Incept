# Sync Agent Phase 0C：可执行证据、验证记录与准入意见

日期：2026-10-16（Asia/Singapore）。源码 `aef64f4`，分支 `codex/production-readiness`。

本轮只处理 B1；[资格契约及七来源矩阵](sync-agent-phase0c-evidence.md) 定义有限的 observed-baseline / since-enrollment 语义。Phase 0/0B 的断言和业务运行时保持原样。

## 1. 仓库与操作边界

开始时 `git -c core.fsmonitor=false status --short` 只有此前未跟踪的正式计划、研究文档、Phase 0/0B fixtures/tests/tools/config；没有已跟踪修改。HEAD 为 aef64f4。结束仍无 tracked diff；本轮新增文件单列如下，未覆盖其他 Agent 的文件。

全部 source evidence 来自 mkdtemp 合成 HOME、合成 SQLite/JSON/JSONL 与压缩 fixture。没有读取真实 AI 对话内容、环境秘密或生产数据库；没有联网、安装依赖、启动服务、配置/部署变更、设备凭据、WSS、常驻 Agent 或 Windows 自启任务。本轮未提交 Git commit。

## 2. 改动文件

| 新增文件 | 作用 |
|---|---|
| `packages/dashboard/src/__tests__/phase0c/phase0c-evidence.ts` | 真实来源目录清单、SQLite backup、三 root、完整解析、真实 collector 调用、可重放合成 capsule |
| `packages/dashboard/src/__tests__/phase0c/phase0c-rules.ts` | 前缀/逻辑范围、Codex 累计规则、强/弱修订边界、轮转桥接与拒绝码 |
| `packages/dashboard/src/__tests__/phase0c/phase0c-lineage.ts` | 跨进程服务端 SQLite / 客户端持久文件、origin/scope、父版、回执、隔离、B2 认领、统一 oracle 视图 |
| `packages/dashboard/src/__tests__/phase0c/phase0c-process.ts` | 使用已安装 esbuild 打包的独立 Node runner；真实退出/崩溃/恢复 |
| `packages/dashboard/src/__tests__/phase0c/phase0c-proof.test.ts` | 74 个参数化展开正反例 |
| `packages/dashboard/tsconfig.phase0c.json` | 专用类型检查入口 |
| `docs/research/sync-agent-phase0c-evidence.md` | 有限资格契约、矩阵、首次基线、已知边界与 Phase 1 条件 |
| 本文件 | 命令、结果、统计、性能与唯一准入结论 |

既有 P0/0B 的 fixtures、38/82 个专用测试、文档和配置均保留。Docs/Music、Owner/TOTP、人工 Import 和所有运行时文件没有修改。

## 3. 关键调用证据

| 实际代码路径/函数 | 0C 如何调用或核对 |
|---|---|
| `adapters/local/collectors/codex.ts::collectCodexEvents` | JSONL、累计修订、跨 shard、archive 副本、压缩 fixture 的真实解析 |
| `.../commandcode.ts::collectCommandCodeEvents` | 强/弱 JSONL、obj.id/filename namespace、精确路径索引双表示、nominal/recorded cost |
| `.../claude.ts::collectClaudeEvents` | 强/弱 assistant、usage 更新、原始前缀和跨文件 session |
| `.../gemini.ts::collectGeminiEvents` | 两世界、完整 JSON 数组、弱修改、缺失/轮转和同现副本 |
| `.../antigravity.ts::collectAntigravityEvents` | 三目录、SQLite/protobuf 原始范围、alias 改写的拒绝边界 |
| `.../opencode-usage.ts::collectOpenCodeEvents` | session/message 逻辑范围、多会话、PK 修订、VACUUM/换库 |
| `.../zcode.ts::collectZCodeEvents` | model_usage 强/弱 id、一致 DB 与删除；running 继续保守处理 |
| `.../aiusage.ts::collectIndexedAgentEvents` | 弱索引前缀、新增旧时间、改行/清理/换 reader/改名 |
| `imports/exporter.ts::exportTokenData` | 七来源原始 v1 baseline；native/index 双表示；显式 synthetic deviceId 避免真实身份文件写入 |
| `imports/matching.ts`、`imports/layer.ts::loadImportedEvents` | 源码复核 exact/weak 匹配、最早 batch/native 优先；0C 统一视图使用真实 v1 loader，原规则不变 |
| `phase0b-contract.ts::classifyAdoption / pricedObservation` | B2 精确归属分类、B3 冻结计价；未调用 fixture 证书接受逻辑 |

0C 的 inventory 特别补齐了 0B adapter 没覆盖的 Antigravity CLI/IDE 目录与 `.jsonl.zst` 检出。压缩 collector 正常读取100，但连续性 adapter 明确拒绝自动准入；没有静默漏清单。

## 4. 必须正反例的覆盖

| 用户验收项 | 实际结果/断言 |
|---|---|
| Gemini 两历史、当前字节相同 | 两份 manifest files/observations 完全一致；父版 A 判 unchanged，父版 B 判 PREFIX_LOST 且仍显示200；首次同字节只登记 baseline-observed |
| 首次基线与旧 v1 | 无重合七来源均登记；有 v1 返回 V1_ADOPTION_REVIEW_REQUIRED，旧值保持；精确引用/价格/映射认领或明确 Owner 审阅后才切换 |
| append / no-op / 重试 | 七来源 + fallback 均有完整追加正例；input100→200，同 batch 多次和 no-op 保持200；跨进程补报不重复 |
| Codex 累计修订 | 单点100→120最终120；50/100/200→50/120/200 的 delta=50/70/80，总200；再到50/120/220 delta=50/70/100，总220 |
| 模糊累计与弱身份 | anchor/time/order/reset、缺 session_meta 的修订隔离；五类弱原生来源可追加、不能自动改旧行；Antigravity alias/BLOB 与 fallback 改行有显式失败测试 |
| 读中变化、半写、缺目录 | CHANGED_DURING_READ、INCOMPLETE_JSON、MISSING_ORIGIN 保持旧100；review receipt 不推进 cursor；修复后从旧 parent 可继续提交200 |
| 合法截断/DB 删除 | 七来源从两条变一条仍可解析，但资格失败且旧200保持；fallback DELETE 同样保留100 |
| DB 逻辑与物理 | VACUUM/user_version 改变物理字节但逻辑 root 相同，判 unchanged；换文件身份拒绝；另一个 session 删除不删除本 session |
| 无桥接轮转 | JSON 四来源、DB 三来源和 fallback 全有 ROTATION_UNVERIFIED；Gemini 副本同现但无桥接也拒绝 |
| 有桥接交接 | Codex/Claude/Gemini 的旧新同现及随后旧路径消失，始终一份100；同身份同 basename 的 CommandCode 移动成功；Codex 新 shard 累计50→100正确 |
| 设备/来源/父版/batch | origin 抢占、设备上下文不符、source/session 错绑、stale parent/错误 parent hash、同 batch 不同 payload 均拒绝 |
| 客户端完整标记篡改 | fake complete、篡改 observations/capsule/root 等没有改变可见集；验证端实际重放原始 collector |
| 回执与事务 | 事务内第二 SQLite reader 只见旧100、无新 receipt；故障后重试到200；伪造/审阅 receipt 不推进 acknowledged parent |
| 真实跨进程退出 | 独立进程 prepare→退出；下一进程 remote failure 仍 pending；ACK 丢失时 server100/client未确认；同 batch retry 原 receipt、server版本仍一份；下一批父版从磁盘恢复 |
| 真实进程中止 | SQLite UPDATE 后 COMMIT 前 `process.exit(23)`；新进程读者仍100且无该 batch receipt；重试后200 |
| v1 与 lineage 重放 | 两个重合 v1 批次、逐来源认领、重启加载、v1 rollback、generation rollback 后，7d/30d/all 全对象差异0；回滚 lineage 的自动复活被栅栏拒绝 |
| 费用边界 | CommandCode nominal0.2→quota0.4，修订0.3→0.6，rollback恢复0.4且重复 apply 幂等；首次认领偷改 captured price 被拒绝，Owner 明确审阅可绑定新 basis；普通设备隐式 reprice 拒绝 |

全部测试都要求确定的成功或失败结果，没有静默 skip/todo。0B 的 fixture-certified 正例仍只承担旧 oracle 任务；0C 的接受路径没有使用该证书。

### 4.1 测试过程中发现并修正的原型问题

第一次 54 例运行有一项统计认领失败：第二个旧 batch 的 checksum 应使用自身 checksum，且 v1 的 `null` 与 manifest 缺省都表示未映射。修正的是新测试/新原型的有效映射比较，完整统计断言保持。

native/index 扩展测试发现 CommandCode 只有精确 source_file 对应时现有 exporter 才去重。正例提供实际相同路径；另保留路径不同的反例，明确断言 exporter 两条/input220、lineage 保留旧100并要求审阅。没有按接近时间、计数或名字补一个猜测桥接。

最后检查补上 Owner rollback 后的自动复活栅栏，以及首次 adoption 的相关 captured price 一致性检查，避免新原型绕开 0B 的回滚/费用契约。没有修改旧测试来接受较弱结果。

## 5. 统计基线差异

真实七来源合成格式各含一个 session、三个有明确时间的累计点/请求：45天前、15天前、前一日。每个可见请求 input100/output20/cacheRead10，其余 Token 类别为0。Codex 保留累计序列，由真实 collector 计算 delta。固定 now=`2026-10-16T12:00:00Z`、Asia/Singapore。

| 范围 | input | output | cacheRead | cacheCreate/reasoning | total | sessions | cost USD | 旧 v1 → 认领/lineage/rollback |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 7d | 700 | 140 | 70 | 0 / 0 | 910 | 7 | 0.001015 | 全维度差异0 |
| 30d | 1400 | 280 | 140 | 0 / 0 | 1820 | 7 | 0.002030 | 全维度差异0 |
| all | 2100 | 420 | 210 | 0 / 0 | 2730 | 7 | 0.003045 | 全维度差异0 |

比较对象包括 totals、costs、daily/monthly、models、sources、projects、sessions 和来源/批次展示字段。只排序语义集合/并列数组及合成来源列表，所有字段值保留。每次认领后立即全量比较；不是仅比总 Token。

此 fixture 与 P0 的910/1820/2730一致。P0B 的966/1932/2898专门含非零 cacheCreate/reasoning，其82个测试本轮继续通过；两组样本各自的旧新统计差异均为0。

## 6. 可复现命令与结果

使用本地已安装二进制，没有调用 Corepack 下载或安装依赖。PowerShell TEMP/TMP 指向仓库隔离目录。

```powershell
# 仓库根 D:/Desktop/code/code/Incept
$env:TEMP = 'D:/Desktop/code/code/Incept/.scratch/sync-agent-phase0c/tmp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null

# 工作目录 packages/dashboard
./node_modules/.bin/vitest.cmd run
./node_modules/.bin/vitest.cmd run src/__tests__/phase0c/phase0c-proof.test.ts
./node_modules/.bin/tsc.cmd --noEmit -p tsconfig.phase0c.json
./node_modules/.bin/tsc.cmd --noEmit -p tsconfig.phase0b.json
./node_modules/.bin/tsc.cmd --noEmit -p tsconfig.phase0.json
./node_modules/.bin/tsc.cmd --noEmit -p tsconfig.src.json
./node_modules/.bin/tsc.cmd --noEmit -p tsconfig.node.json

# 仓库根：同一 cwd 的 before/after，逐行比较而非只数数量
& packages/dashboard/node_modules/.bin/tsc.cmd --noEmit -p packages/dashboard/tsconfig.json *> .scratch/sync-agent-phase0c/types-after.txt
Compare-Object (Get-Content .scratch/sync-agent-phase0c/types-before.txt) (Get-Content .scratch/sync-agent-phase0c/types-after.txt)

# 复用仓库已有 ESLint；关闭只适用于 Next 页面目录的规则
./apps/web/node_modules/.bin/eslint.cmd --config apps/web/eslint.config.mjs --rule '@next/next/no-html-link-for-pages: off' packages/dashboard/src/__tests__/phase0c
git -c core.fsmonitor=false diff --check
```

完整测试另以 default + json reporter 保存到 `.scratch/sync-agent-phase0c/full-tests.txt` 和 `full-result.json`；诊断 before/after、targeted JSON 和临时 Node bundle/SQLite 均为隔离产物，不加入交付文件。

| 检查 | 结果 |
|---|---|
| 开始前完整 Dashboard | 27文件、307测试通过，25.87秒 |
| 最终完整 Dashboard | 28文件、381测试通过，30.78秒；新增74例，失败/skip/todo均0 |
| Phase0C / Phase0B / Phase0 专用 TS | 全部 exit0 |
| domain/adapters（tsconfig.src/node） | 全部 exit0 |
| 全量 Dashboard TS | 仍为 exit2、既有36条；同 cwd before/after逐行比较 changedLines=0 |
| 变更 TypeScript ESLint | exit0，0 errors、0 warnings |
| 空白/变更范围检查 | tracked diff --check通过；新文件单独检查尾随空白；业务运行时无 tracked diff |
| Web/PostgreSQL | 本轮未重跑；P0记录的既有 Web Prisma/测试类型与缺隔离PG条件的问题单独保留，没有顺带重构 |

全量36条诊断来自既有 testing-library exports、Vitest assertion `.not` 和旧测试 mock 类型等位置。比较第一次因根/子目录 cwd 不同显示路径前缀差异；改用相同根目录命令重跑后，原始日志逐行完全一致。

## 7. 性能与移植范围

0C 的独立73例中间版本约14秒；最终74例在完整套件并行运行中耗时23.79秒，完整381例总墙钟30.78秒。整套测试包含多次 SQLite 创建/备份、完整 v1 compat 重建、验证端 collector 重放和多个独立 Node 进程；这是 correctness oracle 的测试耗时。P0 的真实全扫描/导入 benchmark 和内存记录保持原报告，本轮没有重新扫描真实历史。

正式实现可沿用字段、校验规则和失败语义。合成原始 capsule、整份 JSON 状态 SQLite、验证端全重放、临时 compat DB、模拟鉴权和 runner 继续留在测试。Phase 1 的真实增量存储、分页、物化汇总、锁竞争和长 session 资源验收仍需按计划实测。

## 8. 未解决边界与下一步

- 首次观察前历史和未观测的中间变化采用契约第1节的有限语义；不为它伪造 historyCertified。
- 自动路径受限于当前已证明的 envelope、原生键、原始前缀和 DB range。压缩归档、无证据 DB copy、Antigravity alias/BLOB 修订、弱来源改写、reader 切换以及 rollback 后恢复保留旧版，进入明确审阅/适配。
- 正式服务必须实现可操作的冲突分类、一次性 v1 adoption、Owner 审阅后的新基线/epoch、生产分页/并发与持久回执。暂态读失败修复后能沿原父版重扫；不要求 Owner 批准每次正常追加。
- 真实来源的上述审阅发生频率尚未采样；不会用合成 fixture 给出频率估计。

七来源及 fallback 的有证据正常更新、受控修订、旧数据保留、legacy零额外重复和跨进程幂等已有可执行闭环。原 B1 的无限历史目标被有限准入契约替代；Phase 1 必须携带 evidence 第6节全部条件。下一步仅提交本报告给用户/规划 AI 确认，再由后续编码轮实施。本轮没有开始 Phase 1。

**最终结论：CONDITIONAL PASS。**
