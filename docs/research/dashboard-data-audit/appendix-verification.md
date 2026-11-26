# 验证、脱敏样本与对账

基线 `aefdab427ef90bf53f4f83c3713994735b582488`，本次运行日期 2026-11-24（UTC+8）。使用当前源码和本机读取权限。只输出汇总、日期、计数和公开客户端类别。真实原文、路径、设备、会话 ID 与认证材料均留在原数据源。

## A. 当前源码的本机采集回放

执行 [native-audit.mjs](native-audit.mjs)，截止 2026-11-24 20:00 UTC+8。脚本通过 esbuild 在内存构建当前 CommandCode 和 Agent 采集器，调用正常读逻辑、CommandCode 同文件去重与统计函数。使用空价格表。未接入 ccusage 回退、离线导入库、生产 Ledger 或价格发布。该回放度量可读本机数据与当前归一化链路。源诊断共有 399 条输出项，脚本只保留数量，同一来源可有多条。本结果中的索引回退记录数为 0。 [采集调用](../../../packages/dashboard/src/adapters/local/loader.ts#L24-L76) · [聚合函数](../../../packages/dashboard/src/adapters/local/aggregation/summarize.ts#L10)

一次本机回放中，采集和三个窗口聚合耗时 21,475 ms，Node 进程累计峰值 RSS 约 1,087 MiB。墙钟计时从装载模拟 harness 后起算，进程峰值包含 harness 运行前后的内存，采用该进程单次记录。与生产 Worker 预算的使用建议见 [容量章节](08-risk-and-refactoring-plan.md#当前性能证据与容量预算)。

| 范围 | 日键 | 已知总量 | 会话／项目 | 日汇总合计 |
|---|---|---:|---:|---|
| all | 2026-03-19 至 2026-11-24 | 9,951,331,726 | 334／31 | 一致 |
| 30d | 2026-10-26 至 2026-11-24 | 5,428,501,184 | 148／16 | 一致 |
| 7d | 2026-11-18 至 2026-11-24 | 706,963,838 | 33／6 | 一致 |

高吞吐历史自然日 2026-10-20 有 852,338,392 Tokens，完整日期边界为当地 00:00 至次日 00:00；源历史覆盖仍按采集质量解释。进行中自然日 2026-11-24 截至 20:00 有 10,529,910 Tokens，三窗同值。7d 与 30d 的自然日数包含进行中一天。all 有 185 个零量日，不能单凭零量判为真实空闲。

| 源 | 正量记录 | 已知 Tokens | 可靠时点／区间的样本证据 |
|---|---:|---:|---|
| CommandCode | 11,911 | 4,372,931,069 | 11,911 条（100%）未落入 mtime 保守排除条件，时点采用原生日志或消息元数据 |
| Codex | 16,611 | 3,525,272,990 | 3,061,004,908 Tokens 同小时可靠区间，占 Codex 86.83%。274,839,629 跨小时，其中 9,947,770 跨日，剩余 189,428,453 无该类区间证据 |
| DeepSeek Harness | 6,797 | 2,053,060,565 | 收录记录均通过原生整数时间校验。点时间表达使用观察的消息/响应，包含标题与压缩用量子类 |
| Gemini CLI | 6 | 67,102 | 6 条（100%）未落入 mtime 排除条件，小样本 |
| 其他来源 | 本次无可见正量 | — | 没有可计算覆盖率的样本 |

mtime 判定通过比较输出的 timestamp 与输入文件 mtime，只有值不同才计作有来源时点证据。二者恰好相同的记录会保守排除。验证定义若允许运行在消息或响应**观测小时**，上述三源时点合计占本地样本 64.57%，与 Codex 同小时区间合起来是 95.33%。若要求**差分确认完整归属同一小时**，可单独陈述已证实的 30.76% 区间子集。观测时点不描述模型执行的每一时刻。这些比例的分母固定为本地回放，而生产与同步历史的同口径分母不可见。 [时点规则](05-temporal-and-query-capabilities.md#小时证据与当前覆盖) · [CommandCode](../../../packages/dashboard/src/adapters/local/collectors/commandcode.ts#L147-L157) · [Gemini](../../../packages/dashboard/src/adapters/local/collectors/gemini.ts#L57-L65) · [Harness](../../../packages/dashboard/src/adapters/local/collectors/deepseek-harness.ts#L66-L88)

## B. 真实旧 Usage 快照对账

用 [snapshot-audit.mjs](snapshot-audit.mjs) 只读历史磁盘 DTO。缺少 14d 和 Ledger revision。三个窗口独立保存，原 payload 含私有详情，单独读取时只输出白名单摘要。在每窗验证五种分量的总和，以及天、月、canonical 模型、来源、项目、会话各自的分量和总量均等于窗口汇总。逐月比较日合计，费用按容差对比，价格覆盖、加权缓存比、生成/输入比、会话/项目计数与份额合计也通过。

| 窗口／快照日期 | 已知 Tokens | Legacy 费用，USD | 未定价 Tokens（组数） | 会话／项目 | Top 5 ＋ Others |
|---|---:|---:|---:|---:|---|
| all · 2026-10-21 | 6,806,831,058 | 1,027.580252 | 537,658,593（7） | 445／82 | 5,651,914,187 ＋ 1,154,916,871 |
| 30d · 2026-10-27 | 6,217,653,480 | 1,120.395358 | 85,350,418（3） | 324／27 | 5,974,362,370 ＋ 243,291,110 |
| 7d · 2026-10-21 | 3,081,414,095 | 445.113188 | 72,626,870（2） | 146／8 | 3,081,048,110 ＋ 365,985 |

| 窗口 | JSON | gzip | 去掉详情与私有元数据的摘要估算 | 会话和项目 JSON | 跨天／多模型／历史不完整会话 |
|---|---:|---:|---:|---:|---:|
| all | 640,691 B | 82,126 B | 164,826 B | 475,872 B | 100／20／1 |
| 30d | 382,713 B | 49,657 B | 64,812 B | 317,908 B | 49／11／1 |
| 7d | 161,939 B | 20,490 B | 27,029 B | 134,917 B | 16／2／1 |

旧快照文件约 1.19 MB，解析约 5 ms，各窗重编码约 1–3 ms。摘要测量为结构裁剪，和实际 Public allowlist 的编码大小可能不同。生产端 p95、压缩、RSC/HTML、hydrate 与图表交互尚无本次基准值。

### 已观察差异和复现判定

- **中：** all 和 7d 的 2026-10-21 同日聚合分别为 413,062,046 和 412,552,444，差 509,602；两窗同日检查并不代表同 revision。all 和 7d 的 2026-10-20 同为 968,798,307。保存时间、可见来源或回退差异可造成差额，旧 DTO 不足以归因。复现比较同一个快照文件下各窗的 `daily[date]`，再用固定 revision 的发布重新作对照。
- **中：** 旧快照三个窗缓存创建均为 0。真实 Codex 与 CommandCode 抽样存在原字段，字段存在并不能推出正值，也不能直接补写历史。现行 Codex 解析明确置 0，当期 User Interface 会把缓存创建放进 reasoning 桶。归一化基线和界面展示应分别验收。
- **中：** all / 30d 有 `mixed` 来源（含 Codex、CommandCode 等模式），且三窗均有不完整会话标志，但未发现会话 marked `day`。历史模式为 mixed 无法按事件拆回 native、imported 或报告的分量。ccusage 的 day 标志用 fixture 验证，真实旧快照没有可复核的 day event 样本。
- **高（源码复现）：** Owner 新旧费用同窗时可能跨 revision 被拼接；模型日总价按比例调和，不能确保每个模型日格严格等于真实事件计价结果。复现送入 Usage revision 43、Billing revision 42 的 fixture，校验新 UI 始终标记各自水位。

[归一化](../../../packages/dashboard/src/adapters/local/collectors/codex.ts#L200-L242) · [Token 类型图](../../../packages/dashboard/src/react/sections/models/use-models-state.ts#L79-L105) · [费用调和](../../../packages/dashboard/src/react/reconcile-billing-models.ts#L246-L314)

## C. 覆盖清单与真实数据缺口

| 场景 | 本次证据 | 后续只读入口 |
|---|---|---|
| all/30d/7d、高吞吐日、闭合自然日、进行中自然日 | A、B 两批不同数据，分别对账 | 固定同一生产账本 identity/revision 与窗口时点，以 read-only 副本重复 |
| 跨天／多模型／未定价／不完整或回退 | B 聚合下能验证数量，无需披露会话与设备 | 按 scoped key 应在同一视图验证单条的源、窗口内两端和模型组成 |
| 多 Agent、真实日级记录 | 当前真实快照无可核对的同会话真实父子链或 day 标志。历史 Antigravity 记录提供角色线索。合成用例覆盖 report day 语义、父子重放/隔离和模型合并 | 经授权抽取源原生键的匿名匹配结果。v2 需捕获 proof 能追回的时间级别 |
| 现网 Usage/Billing、撤回/回滚、设备并发 | 生产 readiness 不可达，本次没有运行环境发布版本、ledger 或 Owner 只读上下文。本地离线导入库存在，SQLite 只读查询存储表时返回错误 14（无法打开数据库），未获得明细。仓库历史演练记录 rev 843 的 54,475 可见成员，另有源 v1 和回滚隔离演练 | 同一 data identity、revision、asOf 比较四窗口各分项与可见成员。验证 pricing catalog、excluded 与 unpriced，单记费用语义 |
| 去重前后 | 当前回放使用原生去重后输出。历史修复的 aiusage 只读复算为 13,220 行 → 12,927 个事件，扣除 293 行重复，互斥量从 1,484,013,262 减至 1,452,358,650。当前 fixtures 验证 fork、重复日志、SQLite WAL、导入冲突、重放与连贯性 | 在固定副本对单一采集器统计 raw observations、duplicate copies、canonical events、scope replacement 和隔离成员数，保留分阶段合计 |

[历史真实演练](../../plans/2026-11-13-dashboard-sync-billing-refactor.md#身份回填演练入口) · [去重历史对账](../../finish-task/2026-10-14-dashboard-usage-remediation.md#实际数据复算与页面验收) · [Antigravity 历史样本](../antigravity-model-identity-and-token-accounting-audit.md) · [同步字段与传输](06-sync-and-data-integrity.md)

## D. 隔离测试与复现

| 模块 | 此次结果 | 验证范围 |
|---|---|---|
| Dashboard Vitest | 53 文件通过，1 跳过；370 测试通过，2 跳过 | 空窗、源用量、不同粒度、模型身份、Cost 版本、Source fallback、导入、快照、公共投影、趋势显示、Sync 回滚等。缺 Recovery Sandbox fixture 跳过 2 |
| TypeScript | Dashboard 三个 tsconfig 与 Web、Sync Agent、Gateway 全部通过 | 纯类型、Node adapter、完整包及宿主 |
| Web Sync 定向 Vitest | 7 文件通过，4 跳过；28 测试通过，27 跳过 | Billing route、远程鉴权、资源错误、使用读路径；缺隔离 PG/服务环境的 Agent、Sync、远程及 full-site suites 未测 |
| Agent 与 Gateway | 构建成功；Agent 107 项中 104 通过，Gateway 2 项中 1 通过 | Agent 初次受仓库内临时目录、回环网络、Windows 脚本权限影响；Gateway 回环网络拒绝。环境失败与业务断言分开记录 |
| Sync Tray | 本机 .NET Framework 编译成功，56 项反射回归全部通过 | 初次临时路径触发 8 项偏好文件原子替换失败；TEMP/TMP 指向受工作区授权的缓存后全部通过。测试不启动真实托盘 |

Agent 使用系统默认临时目录复跑时，回环与 PowerShell 授权仍受限，并遇到 DPAPI 临时目录清理、状态文件写入及文件 rename 权限问题。Agent/Gateway 的未通过项需在具备独立临时目录和回环的隔离环境复验。 [同步验证记录](06-sync-and-data-integrity.md#本次隔离测试结果)

运行环境 Node 24.21.0，使用仓库已有 Vitest 5.0.1。Corepack 无法连接 npm 下载 pnpm。将 TEMP/TMP 指向工作区内缓存目录后 Vitest 模块加载通过。下面从仓库根目录运行。使用隔离输出目录，环境测试数据库必须是专用 fixture。

```powershell
node docs/research/dashboard-data-audit/native-audit.mjs '2026-11-24T20:00:00+08:00'
node docs/research/dashboard-data-audit/snapshot-audit.mjs
node docs/research/dashboard-data-audit/verify-artifacts.mjs
$testTemp = (New-Item -ItemType Directory -Force -Path 'node_modules/.cache/dashboard-audit/local-tests').FullName
$env:TEMP = $testTemp
$env:TMP = $testTemp
Push-Location packages/dashboard
node node_modules/vitest/vitest.mjs run --maxWorkers=4
node ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.src.json
node ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json
node ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
Pop-Location
Push-Location apps/web
node node_modules/vitest/vitest.mjs run --maxWorkers=4 src/server/sync src/app/api/dashboard src/app/api/internal/dashboard
Pop-Location
```

[api-samples.json](api-samples.json) 内 `realUsageExcerpt` 是旧快照的脱敏数据摘录，输入形状与 Usage DTO 对应，未采获实时 HTTP 响应。`fixtures` 为可渲染合成样本，含 Guest、详情叠加、Owner stale Billing 及单日归属质量，避免引用真实标识。
