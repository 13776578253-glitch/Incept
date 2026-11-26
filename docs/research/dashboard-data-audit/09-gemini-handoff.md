# Gemini 实施交接

当前源码以 `aefdab427ef90bf53f4f83c3713994735b582488` 为准。以同一批数据先改界面，再按 [能力矩阵](07-data-capability-matrix.md) 增加统计。现有项目、会话、导入、价格诊断、Owner 远程刷新都保留可达入口。模型吞吐、构成、缓存效率、趋势与费用优先；客户端来源和诊断在概览给出简要状态，完整明细按需展开。布局、UI 和图表库由实施方选择。

## 当前接口可以消费什么

| 入口 | 可直接使用 | 权限和限制 |
|---|---|---|
| SSR 与 `GET /api/dashboard/usage?range=7d` | `TokenDashboardData`，包含 `daily/monthly`、模型分量、源、时间窗口与 `costs`；另支持 14d/30d/all | Guest 仅公开汇总。Pro 有允许的项目与会话，但不含本地路径、设备标签或导入批次。Owner 有完整 DTO 和按部署开关提供的 Sync metadata。首次 SSR 读取快照并允许空壳。 |
| `GET /api/dashboard/billing?range=30d` | `estimatedCostUsd` 字符串、`estimated/unpriced/excludedTokens`、`revision/liveRevision/catalog/run/asOf`；可选日总额、模型及渠道、缺价分组 | Owner 与读取开关。界面开关独立。分开渲染对不上 `revision/asOf` 的响应。当前模型×日无精确交叉 API，项目/会话内未提供 USD 等效费用。 |
| Usage 刷新、远程刷新和导入 | 继续使用已出现的 Owner 流程，依同步模式读取 `minRevision`，poll、退避、取消、错误保留最后快照 | 本地刷新与远程 Job、导入 Preview/Commit 属现有入口。角色、来源与重新认证沿用当前实现，不将读图交互连接到采集或上传。 |

[Usage 类型](../../../packages/dashboard/src/domain/types.ts#L161-L186) · [Usage 宿主](../../../apps/web/src/app/api/dashboard/usage/route.ts#L8-L18) · [公开投影](../../../packages/dashboard/src/domain/public-summary.ts#L32-L73) · [Billing 类型](../../../packages/dashboard/src/domain/usage-billing-read.ts#L4-L42) · [同步与导入](06-sync-and-data-integrity.md)

## 首轮实现顺序

1. **L0 保持原始能力。** 时间范围为一级筛选。用 `daily` 支持 7d/14d/30d 趋势，长窗默认月。保留日历、矩阵与通过控件访问的模型、来源、费用、项目和会话。配置槽位在模型表中显示为配置；分量用五个源字段。
2. **L1 增加可派生分析。** 支持选中已有历史自然日，提供分量、每日模型、成本日点、吞吐峰值和该日的已知数据提示。按 `daily.modelBreakdowns` 做模型生命周期和迁移，多模型的比率使用累计分量，加入活跃模型和平均每模型会话吞吐。
3. **L2 让深度分析具备服务端契约。** 增加固定窗口、周/日聚合、日活/首次观测、权限内分页、项目×模型、统一过滤和同一计费版本的精确模型日金额。保留原接口为过渡。使用小范围读取，并明确窗内与全局分母。
4. **L3/L4 依能力扩充。** 存在明确时间证据后增加可信小时；请求、effort、角色、父子 Agent 和实际渠道逐源扩展。真实执行时长、工具调用、实付账单和订阅数据从独立事件或新数据源获取。

## 推荐查询与响应类型

以下是新增读取契约建议。当前接口仍按已发布类型消费。查询在服务端统一授权和过滤，现有 UI 可先用适配器将 Usage 转为显示结构。

```ts
type CalendarDate = `${number}-${number}-${number}`;
type WindowSelection =
  | { kind: 'preset'; range: '7d' | '14d' | '30d' | 'all' }
  | { kind: 'day'; date: CalendarDate }
  | { kind: 'dates'; from: CalendarDate; through: CalendarDate };

type DashboardQuery = {
  window: WindowSelection;
  timeZone: 'Asia/Shanghai';
  grain: 'hour' | 'day' | 'week' | 'month';
  filters: {
    canonicalModelIds?: string[];
    modelFamilyIds?: string[];
    vendorIds?: string[];
    sourceIds?: string[];
    billingChannelIds?: string[];
    deviceIds?: string[];
    projectKeys?: string[];
    sessionKeys?: string[];
    agentRoles?: ('orchestrator' | 'worker' | 'auto-review' | 'unknown')[];
  };
  measure: 'tokens' | 'sessions' | 'apiEquivalentUsd';
  compareModelIds?: string[];
  topN?: number;
};

type Freshness = {
  asOf: string;
  revision?: number;
  dataVersion?: string; // opaque public identity only if safe to disclose
  state: 'fresh' | 'stale' | 'absent';
  sourceCoverage: 'complete' | 'partial' | 'unknown';
};

type TokenCounts = {
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

type UsageBucket = TokenCounts & {
  start: string;
  endExclusive: string;
  availability: 'complete' | 'ongoing' | 'no-activity' | 'partial' | 'unknown';
  distinctActiveSessions?: number;
  firstObservedSessions?: number;
};

type SingleDayBreakdown = {
  day: CalendarDate;
  totals: TokenCounts;
  hourBuckets?: UsageBucket[];
  hourAttributedTokens?: number;
  hourUnattributedTokens?: number;
  hourCoverage?: number | null;
};

type OfficialCostBucket = {
  estimatedCostUsd: string;
  estimatedTokens: number;
  unpricedTokens: number;
  excludedTokens: number;
};
```

客户端可用规范化的时间、筛选及量纲状态。跨图点击传播筛选条件而且保持当前时间窗口。图例、排序和比较选择独立于业务口径。自定义日期查询需要实际校验语法、存在性、上限、粒度和时区。返回框架应包含 role-filtered metadata、窗口、版本、水位、可应用过滤器、聚合、可选 Others、详情 cursor。费用的 run/catalog 与 Coverage 附在其自己的结果。

## UI 状态与统计不变量

- **加载和失败。** 初次无快照用模块级 skeleton。范围改变时取消旧请求并防止旧响应覆盖新范围。失败后保留最后数据和检查时间。为读失败、Sync job 状态、部分来源问题分别提供交互，自动轮询遵循原有权限和可见性。详情展开首次请求可用，关闭后可复用同 revision。
- **数据缺口。** 同一日区分无记录、来源缺失、历史部分与当天尚未结束。未定价显示量与覆盖，已记录 0 费用可显示零。空比分母在新契约返回 null。旧 API 0 在适配层结合计数解读。
- **统计一致性。** 五分量之和为 T。日与月在相同窗口合计一致。Top N＋Others＝过滤后全体。比率按分子分母重新累计。项目、模型、会话并集独立去重。项目×模型与日活用原始或等价交叉聚合。
- **时间。** 1 日用自然日摘要，L3 后在同日内部显示小时及未归属量。7/14 天用日，30 天用日或周，全部默认月、保留下钻。统计日为 UTC+8，禁止把日级记录平均到每小时。
- **计价。** 保留 Usage 旧金额、Billing API 等效金额和实际来源金额的标签。Billing 金额按十进制字符串处理。同窗口过渡 UI 的 estimate allocation 与后端精确聚合分开。维度归并优先 canonical ID，显示名仅用于呈现。
- **权限。** Guest/Pro/Owner 分开缓存、身份 key 和显示路径。高敏角色筛选在服务端直接拒绝或投影为不可用，不能传到客户端后再隐藏。传统 Pro 的会话显示边界需要沿用现有投影。
- **会话导航。** 现有 Pro DTO 的 `sessionKey` 可能由设备 ID 组成。新增详情路由使用角色内不可解析的会话标识，避免把旧复合键作为公开维度或写入共享缓存。 [键生成](../../../packages/dashboard/src/adapters/local/aggregation/summarize.ts#L174-L190) · [投影](../../../packages/dashboard/src/domain/public-summary.ts#L65-L72)

## 验收清单

- [ ] 以 [真实聚合摘录和 mock](api-samples.json) 同口径对照，然后在隔离环境以相同数据、主题、视口和权限比对旧新 UI。
- [ ] 默认页仍可进入日历、模型矩阵、模型/源、价格覆盖、项目、会话、导入和可用的远程控制。项目、会话和导入按需打开，L2 分页前记录首屏仍承载的 payload。
- [ ] 运行 [验证附录](appendix-verification.md) 的 suites，补测新查询空窗、日跨界、混模型、跨天、日级/区间、旧回退和精确价格分母。
- [ ] Billing 同窗使用匹配 publication 与修订号。覆盖 stale、缺 breakdown、没开关、403 及 503；项目/会话仍沿用声明的费用口径。
- [ ] Guest 不含会话/项目明细或私有 metadata，Pro 用现有投影，Owner 授权流程与 same-origin 保持。新缓存不交叉角色。
- [ ] 性能按照 [预算](08-risk-and-refactoring-plan.md#当前性能证据与容量预算) 对比冷读、热读、首屏和深度面板。拖动、切换粒度和刷新不触发额外源扫描。
- [ ] Sync contract、账本写入、历史身份与去重、价格目录发布、生产配置和数据库迁移需要独立评审。对依赖这些模块的 L3/L4 实施，新旧 Reader/Writer 兼容与回滚用隔离夹具验证。

接口实现与测试以 [架构](01-data-architecture.md)、[指标字典](03-metrics-dictionary.md) 和 [组件清单](appendix-ui-inventory.md) 的代码锚点为起点。
