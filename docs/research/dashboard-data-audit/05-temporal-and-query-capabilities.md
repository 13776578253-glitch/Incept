# 时间粒度、筛选和使用行为

基线 `aefdab427ef90bf53f4f83c3713994735b582488`。本章将当前读取、样本观察和建议接口分别列出，指标公式见 [指标字典](03-metrics-dictionary.md)。

## 当前时间口径

| 内容 | 核验结果 |
|---|---|
| 范围 | API 与领域类型支持 `7d/14d/30d/all`，默认 30 天。界面工具条提供 7 天、30 天及全部。日历或趋势选择某个点是在已读响应内查看桶，没有向服务端提交指定日期或自定义范围。 |
| 时区 | `dashboardTimeZone='Asia/Shanghai'`，`dashboardDate` 实际加固定八小时。现行日期与 Asia/Singapore 的现代日期一致。README 的 Asia/Singapore 描述不足以代替代码常量。查询与导出用 UTC+08:00 规范桶，峰谷用具体费率自身时区。 |
| 边界 | `dateWindow` 以当天为右端且包含当天，向前减 N−1 个自然日，all 起点是首个可见日期或今天。Loader 与 v2 projection 排除未来事件，日/月按 `dateKey/monthKey` 汇总。最近 7 天是从第六个日前午夜到 asOf，和滚动 168 小时不同。 |
| 日/月 | 日序列在指定窗口补 0；月序列来自实际入桶事件。月桶首尾可落在不完整自然月。周可以从日桶重组，周一为推荐默认，并标记首尾截断。 |
| 数据质量 | 补 0 仅表示该响应在该桶累计为零。源不可用、采集中、历史截断、时点未完成和真正无活动，需要另外的覆盖状态。全历史起点随数据可见性变动。 |
| 当前筛选 | `useDashboardWindow` 管理窗口与趋势、日历、Heatmap 的选点。本地模型排序、项目和会话搜索各自独立。按 model 消费模型日桶可重建所选模型的 Token 趋势，不能据此重建项目、设备、实际渠道和会话交集。 |

源码 [dateWindow](../../../packages/dashboard/src/domain/window.ts#L1-L15) · [Usage 路由](../../../packages/dashboard/src/next/usage-route.ts#L8-L39) · [本地 loader](../../../packages/dashboard/src/adapters/local/loader.ts#L58-L76) · [投影](../../../packages/dashboard/src/sync/projection.ts#L30-L48) · [工具条](../../../packages/dashboard/src/react/components/dashboard-toolbar.tsx#L39-L60) · [日期补零和月桶](../../../packages/dashboard/src/adapters/local/aggregation/summarize.ts#L27-L77)。

## 小时证据与当前覆盖

严格小时归属可以使用可信时点，或起止都落在同一小时的可靠累积区间。Codex 的 `usageInterval` 用于表达相邻可靠锚点之间的差分，今天按结束事件的 `dateKey` 入桶。有跨小时但未跨日的区间可以确定日期。跨日区间沿用兼容日总量口径，同时单列时间不确定总量。新的严格归因结果带单独语义版本。来源 mtime、session 创建回退、未知精度与 ccusage 当地中午合成注记都不能用于精确小时。开放区间 `(previousTimestamp, timestamp]` 以端点严格同桶作为保守判定，跨桶保持一个区间观察。 [Codex 差分](../../../packages/dashboard/src/adapters/local/collectors/codex.ts#L154-L242) · [ccusage](../../../packages/dashboard/src/adapters/local/collectors/ccusage.ts#L46-L68) · [字段传输](06-sync-and-data-integrity.md#字段传输与兼容性)

**已验证本地结果。** 冻结至 2026-11-24 20:00 UTC+8 的当前采集回放中，35,325 条正量事件共 9,951,331,726 Tokens。可直接用同小时闭合区间核验的 Codex 差分是 3,061,004,908 Tokens，占该采集路径 30.76%，占其中 Codex 86.83%。274,839,629 Codex Tokens 属跨小时区间，其中 9,947,770 同时跨日。CommandCode、Gemini 和 DeepSeek Harness 的该次已收录样本都有原生观测时点证据，占样本 Tokens 64.57%。若允许按观测时点所在小时统计，加上同小时区间为 95.33%；该口径与“整段使用落在该小时”不同。其他来源的生产数据覆盖率待核验。由于不同输入和读取路径，本地比例只适用于该次回放，实时生产、v1 导入与 v2 投影的覆盖率分别待测。 [样本明细与方法](appendix-verification.md)

| 来源 | 时间可用性 | 路径限制 |
|---|---|---|
| Codex | 区间覆盖实测见上。独立请求或无区间的 Token 还需验证来源时间为观测时点 | Sync 有特定 reader 的原始累计锚点。通用 TransferEvent 不保留 `usageInterval`，现有投影没有输出区间 |
| CommandCode、Gemini、Antigravity | 源存在精确时间路径，也存在 mtime、消息/会话创建回退 | 统一事件不能稳定区分回退原因；各源可靠比例尚无全量观测 |
| DeepSeek Harness、Claude、OpenCode、ZCode | 由消息/模型行数值时间或 finish/start 填充，精度和含义需按版本与粒度核验 | ZCode 折叠两个时间字段。请求级时长需要同时验证 start/end 和归属 |
| ccusage | 日 × 会话 × 模型 | 日维可用。传输后日级标志会丢失；禁止将合成的中午当真实小时 |
| aiusage、旧传输与回填 | 索引或传输的时间值 | 已有类型的 absence 与 observed event 分开，缺证据回退至日级或 unknown |

[采集能力矩阵](02-collector-capabilities.md) · [RawUsageEvent](../../../packages/dashboard/src/adapters/local/types.ts#L24-L57) · [TransferEvent](../../../packages/dashboard/src/domain/imports.ts#L1-L23) · [Agent capture](../../../packages/dashboard/src/agent/capture.ts#L130-L165)

## 指定日期的实现边界

| 阶段 | UI / 查询 | 数据约束 |
|---|---|---|
| L1 最小 | 在已返回的 daily 中选自然日。显示已知总量、五分量、模型构成、主要价格覆盖状态。Owner 的费用日点只从相符 Billing 响应单独读。 | 只使用记录在该日桶的数据。避免用全窗成本覆盖率填当日，避免 session 起止筛出该日吞吐。该日不在缓存范围时显示需要扩展范围，直接读取 all 仅在既有缓存及负载允许时使用。 |
| L2 读取扩展 | 支持 `date`、`start/end` 及 `grain`，输出日内会话分页、日内按模型统计、覆盖诊断。局部可信小时可以作为本地试读。 | 查询在服务端应用授权、范围和过滤。小范围声明 partial。时间桶以 UTC+8 自然日边界换为半开 UTC 毫秒区间，`asOf` 截断进行中日。 |
| L3 完整 | 独立时点或闭合区间归属的小时图，可同时展示小时模型组成、日归属未定量和时间覆盖。 | 保存 provenance、precision、interval bounds 和语义版本。旧传输保留 unknown。每个日的小时合计加不可归属量等于该日已知总量，保持与原日归属政策明示一致。 |
| L4 独立扩展 | 请求实际运行时长、任务完成效率、账号级支付和订阅、完整 Agent 协作。 | 需要新的遥测或结算数据域及授权，单凭日志跨度或模型名称无法支撑。 |

## 统一过滤与分母

1. **先授权和确定版本。** 选择可见 Ledger generation 或本地读取批次，记录实际 revision、查询 asOf 和时区。一致快照内读取使用量和可比聚合。
2. **后过滤原始观察或等价交叉索引。** 先日期，再模型/模型家族、已验证厂商、来源、渠道、设备、项目、会话、角色。维度内 OR，维度间 AND。Guest 只能使用公开维度，Owner 可进入完整诊断，Pro 按现有 capabilities。可视图 metric、粒度与对比选择作为显示参数。
3. **再聚合与计算分母。** 每个图的分母来自同一筛选集合和相同桶。Token 份额用窗口 T 或桶 T。费用份额要求同口径、币种和 revision，未定价量独立显示。多个模型对比用共享全集分母，选中模型内部构成才使用该模型自身分母。
4. **最后限制行数。** 对选定指标稳定排序，Top N 回传真实尾部合计 Others，图例固定键。支持清除和滚动分页。过滤前全局合计单独提供时，需要字段名区分 scoped totals 和 context totals。
5. **避免错误交集。** 例如 `providersUsed`、`sourcesUsed` 和 `modelsUsed` 是集合，不能逆推出模型 × 设备 × 项目的 Token 数。独立聚合的边际总量也不能反演。

## 会话、项目和频率

| 分析 | 可实施口径 |
|---|---|
| 窗口去重会话、模型参与会话 | 当前可用。正吞吐事件依 device/source/session 去重，某会话可多个模型参与。窗口时间改变会话集合，不能把各模型会话数相加。 |
| 日活跃与新建 | 日活按日期与 scoped key 去重；同一跨天会话可在多天活跃。新增 `firstObservedSession` 用全历史首次可靠观测并标注截断。真正 `createdSession` 要求原生创建事件覆盖，近 7 天内的最早观察不能当新建。 |
| 每日模型频率与会话均值 | 日频率同时区分使用天数、去重会话数和已验证请求数。现有模型窗口平均可用 `model.totalTokens/model.sessionCount`；跨窗重新聚合分子与去重分母。 |
| 活跃跨度与单日分布 | 会话 `durationMinutes` 是窗口内最早与最晚记录之差的四舍五入。可用于最近活动提示。分时频率遵守小时精度与未知归因，执行时长需独立请求计时。 |
| 任务规模 | 可以按观测会话总 Tokens 分布，用语明确为“会话观察规模”。任务边界、完成、返工缺少统一数据。 |
| 模型首次/最近与迁移 | 对全历史日模型桶取首末非零观察，模型稳定键记录版本。迁移图以相对用量变化解释，避免推断用户有意替换或模型真实上线日。 |
| 项目与模型联动 | 当前项目只有汇总及模型集合。Owner/Pro 要求精确项目 × 模型热图时应从事件聚合。会话携带首个项目与标题，有可能窗口内归因变动；项目摘要以每事件 projectKey 分组。 |
| 请求、重试、工具与协作 | `billing.requests` 计聚合观察。只有可信原生 ID 和去重规则能给真实请求次数。角色与父子键需要显式证据，tool call 次数、执行耗时需独立事件。 |

源码 [会话和项目聚合](../../../packages/dashboard/src/adapters/local/aggregation/accumulate.ts#L316-L427) · [会话输出](../../../packages/dashboard/src/adapters/local/aggregation/summarize.ts#L174-L207) · [权限投影](../../../packages/dashboard/src/domain/public-summary.ts#L65-L72)。
