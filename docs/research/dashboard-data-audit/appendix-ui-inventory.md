# Dashboard 组件和消费契约清单

基线 `aefdab427ef90bf53f4f83c3713994735b582488`。路径除特别注明外均位于 `packages/dashboard/src/react/sections/`。依据源码静态检查，详见各组件实现。全局范围为 API 返回窗口，组件局部筛选并不自动重算全局 totals。

| 界面与源码 | 输入、处理和交互 | 交接建议 |
|---|---|---|
| Toolbar `components/dashboard-toolbar.tsx:27` | range、刷新状态、设备及导入入口 | 保留时间和刷新状态 |
| Overview metrics `overview/overview-metrics.tsx` | `totals`、`dateRange` 与 Billing 预览 | 保留主要总览，明确成本语义 |
| Trend `overview/trend-chart.tsx:31`、`trend-series.ts:7` | daily，总量/Token 构成/模型/成本；模型分段按窗口 Token 总和排序，再以当天模型总量为分母；模型部分可按 peak/offPeak 拆段 | 保留，联动须明确分母 |
| Calendar `overview/usage-calendar.tsx:20` | daily，按月选择，日总量按窗口最大值着色，无对应日禁用并显示破折号 | 区分空桶和采集缺失 |
| Model Matrix `overview/model-heatmap.tsx`、`use-overview-state.ts:30` | daily.modelBreakdowns 按窗口五类 Token 求和排行前 10 | 按需，顶部截断没有合并 Others |
| Selected period `overview/period-summary.tsx` | 当前选择日的聚合及模型拆分 | 保留日详情入口 |
| Model distribution `overview/model-distribution-panel.tsx:43` | models，默认显示前 10 可展开，排名数据来自响应 | 可合并排名分析 |
| Token shares `overview/trend-series.ts:57` | 每日 input、output、cacheRead、cacheCreation、reasoning 分别除以五类之和 | 需要保持五项独立 |
| Reference cost trend `overview/reference-cost-trend.tsx` | Billing daily 与估价覆盖 | 保留估价和覆盖状态 |
| Token Type `models/token-types-panel.tsx`、`models/use-models-state.ts:60` | totals 各桶除以 totals.totalTokens，第四桶实际是 reasoning + cacheCreation | 重构时分开缓存写入和推理 |
| Source distribution `models/sources-panel.tsx:41` | sources 吞吐、会话、模型、费用 | 可简化并按需展示 |
| Model and slot `models/models-table.tsx`、`models/use-models-state.ts:13` | sourcesUsed 筛选模型行，优先 measured，再按 Tokens/成本/输出排序，默认 10 行展开 | 筛选仅选模型行，不改变各模型全来源合计 |
| Cost metrics `costs/cost-metrics.tsx`、`reference-cost-breakdown.tsx` | legacy costs 或 Owner Billing 预览 | 明确来源及状态 |
| Coverage `costs/pricing-coverage-panel.tsx` | costs 的 priced/unpriced、模型覆盖及缺价模型 | 缩为诊断入口 |
| Model pricing `costs/model-pricing-table.tsx` | models 与 unitPricing，缺价处理 | 保留审计详情 |
| Reference breakdown `costs/reference-cost-breakdown.tsx:131` | Billing 模型和渠道，费用降序，默认 10，可展开 | 按需展示 |
| Project attribution `projects/project-attribution-table.tsx:45` | projects 吞吐、会话、成本，默认 10 可展开 | 按需 |
| Session explorer `projects/use-projects-state.ts:27`、`sessions-table.tsx` | 项目筛选及 ID、标题、项目、来源、模型搜索，按 Token/成本/最近/跨度排序，默认 12 可展开 | 按需分页，保留隐私权限 |
| Inspector `projects/session-inspector.tsx:60` | session 时间精度、模型分解、首末时间及跨度 | 保留，跨度不等于执行时长 |
| Import `imports/import-dialog.tsx` | Owner 导入预览、映射、提交及历史 | 保留权限、预览与确认流程 |

`token-dashboard-feature.tsx:12` 将 Models、Costs、Projects 动态导入，`components/deferred-section.tsx:4` 在距离视口 320px 时启用，加载占位和缺失快照占位由 `section-placeholder.tsx` 提供。这样延迟组件呈现，但初始 `TokenDashboardData` 仍包含权限允许的相应数组，不等于服务端按需分页。`hooks/use-dashboard-window.ts:139` 请求失败保留快照并设置错误；空、未知与采集失败需要结合 `collectionIssues` 和权限投影解释。

当前源码中的图表排行默认截断后可展开，并未在上述前 10 的截断处创建 Others。引入 Others 时，必须在同一筛选和同一计量口径上先聚合再计算份额。

## 关键显示公式和边界

- Overview 日均 Token 是 `totals.totalTokens / max(1, calendarDays ?? activeDays)`，缓存效率、输出输入比直接取 totals，费用使用 totals.cost 或 Billing reference card。详见 `overview/overview-metrics.tsx:24`。
- 模型总份额条使用每行 `shareOfTokens`，包含所有正 Token 模型，列表只截前 10；列表条长度是模型 Token 除以窗口模型最大 Token，配置槽位显示破折号。`overview/model-distribution-panel.tsx:41`、`:62`。
- Trend 的模型系列按照整个窗口内模型拆分的五类 Token 求和排序，当天 share 的分母为当天所有模型分段之和；Token 堆叠分母为该天五类之和。单日选择仅改变 Period Summary 和可视焦点，不改变请求窗口。`overview/trend-series.ts:38`、`:48`、`:57`。
- Calendar 空 points 显示 noUsage，未匹配日期禁用且显示破折号，已有零点显示零；强度是正值 `15 + round(day.totalTokens / maxWindowTokens * 70)`。`overview/usage-calendar.tsx:12`、`:53`。
- Matrix 先累加每个模型每天的 input + output + read + write + reasoning，再取前 10，见 `overview/use-overview-state.ts:30`。配置槽位无有效活动不会进入矩阵。
- Token Type 当前第四桶合并 reasoning + cacheCreation，再除 `totals.totalTokens`。趋势堆叠保留二者分开，因此两图分类不同。`models/use-models-state.ts:60`、`overview/trend-series.ts:57`。
- Source bars 的分母为窗口最大来源 Token（下限 1），来源自身 share 字段来自聚合。筛选来源在 Models Table 匹配 `sourcesUsed` 等成员，仅过滤行，模型行内数值仍是各来源汇总。`models/sources-panel.tsx:40`、`models/use-models-state.ts:13`。
- Billing 参考覆盖率为 estimatedTokens / (estimatedTokens + unpricedTokens)，空分母显示不适用，excludedTokens 单独呈现。model breakdown 可按渠道筛选，按 estimatedCostUsd 降序，默认显示 10。`costs/reference-cost-breakdown.tsx:131`、`:162`、`:171`。legacy coverage 取 `data.costs` 现有字段，不能直接替换分母。
- Project 排名条以项目最大总 Token 为分母，share 使用 `project.shareOfTokens`，点击项目只筛选 Session Explorer。Session 先根据项目与本地搜索筛选，再按 Token、费用、最近活动或跨度排序，默认 12 条。`projects/project-attribution-table.tsx:22`、`:74`、`projects/use-projects-state.ts:24`。
- Session Inspector 将 day 精度显示为日期和日级摘要，event 精度展示首末活动与 durationMinutes；排序中的 duration 是活动跨度。`projects/session-inspector.tsx:60`、`projects/sessions-table.tsx:126`。

参考费用趋势在 ready 且有日拆分时按 asOf 对应窗口生成日历点，柱高是当日估价除以可见日最大估价，缺 breakdown、空 breakdown、loading、unavailable 各有状态文本。`overview/reference-cost-trend.tsx:8`、`:57`、`:78`。各视图共用 snapshot、Billing 状态与 permission scope，保留这些机制后再重组默认信息层级。
