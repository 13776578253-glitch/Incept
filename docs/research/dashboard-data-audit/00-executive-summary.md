# Incept Dashboard 数据审计与重构交接

调查日期 2026-11-24，UTC+8。Gemini 实施从 [交接契约](09-gemini-handoff.md) 开始，统计能力按 [矩阵](07-data-capability-matrix.md) 选择。当前 Dashboard 能先用现有数据增加日期内分析、模型变化和加权缓存效率。统一多维筛选、日活跃会话、精确模型日成本与全量可信小时各有明确的读取或数据依赖。

## 源码与工作树基线

| 对象 | 复核结果 |
|---|---|
| 当前工作区 `main` 与本地 `origin/main` | `aefdab427ef90bf53f4f83c3713994735b582488`，调查起点工作区干净。Dashboard 最后一笔相关提交 `0147fc4`，包含模型计价映射、每日调和和 Antigravity 会话隔离。 |
| Gemini `.worktrees/web-redesign` | 开始时为 `refactor/web-frontend-v2` 的 `9e3acb4`。交付前复核为 `c1afe647786d1264be65e8e426450c371e98d2c5`，基线以上八笔提交，新增一笔 Roadmap 和外观设置重构。提交与活跃未提交变更均未直接修改 Dashboard 包、Dashboard API 或 Sync runtime。宿主 layout、主题、导航、设置及 Prisma 客户端的差异在后续集成同一 fixture 核对。 |
| `.worktrees/billing-v2` | `feat/tokens-billing-v2`，同 `aefdab4`，检查时干净。 |
| 生产参照 | 最近可追溯发布交接为 `67740b6f7bf75996994d3a642596c1c350184349`，当时 Owner Billing 开关关闭。当前 main 比该参照领先 9 笔，其中 7 笔直接涉及 Dashboard/Sync/Billing/部署。部署有效 revision、活动开关和 catalog 仍待运行环境核验。公网 HTTPS readiness 探测在本环境不可达，且 readiness 仅能验证健康状态。 |
| 写入位置 | 本报告及复现辅助文件留在当前控制工作区的 `docs/research/dashboard-data-audit/`，遵循 `docs/INDEX.md` 的研究证据目录。没有切换或写入 Gemini 工作树。 |

基线复现命令 `git worktree list --porcelain`、`git rev-list --left-right --count main...refactor/web-frontend-v2`、`git log --oneline 67740b6..main -- packages/dashboard apps/web/src/server/sync apps/web/src/app/api/dashboard deployment`。调查按 [仓库指南](../../../AGENTS.md)、[文档治理](../../INDEX.md) 与 [工作树规则](../../runbooks/zh/multi-ai-worktrees.md) 进行。生产参照来自历史发布交接，本机未取到可复读的当前镜像标签。

## 结论和优先级

| 结论 | 类型及影响 | Gemini 的实现起点 |
|---|---|---|
| 已有日、月及日×模型，五类 Token、会话与项目摘要。缓存命中率和生成比基于可加计数，时间窗变化应加权重算。 | 源码核验。当前 Token 类型图把缓存创建并入推理。 | 独立五桶，按日看模型组成、按窗看效率和迁移。 [指标字典](03-metrics-dictionary.md) |
| 同一个 Dashboard 有 Usage 旧费用与 Owner 官方 API 等效 Billing 两套管线。Owner 当前客户端调和包含近似估分与未检查 revision 的拼接。 | 源码核验。精确的模型日金额需要读取扩展。 | 先用 Billing 的原生日总额、模型和渠道，实付／订阅、来源记录金额和 API 等效美元分别标记。 [计价审计](04-identity-and-billing.md) |
| 现有历史传输丢失时间精度和通用累积区间。当前本机真实回放中可证实同小时的 Codex 差分占全部样本 30.76%，其余含更多可能可归属的数据。 | 本地实测与源码核验。用 30.76% 做本样本保守下界，生产各源百分比仍待只读量化。 | 先做自然日概览，增加分时前保留 unknown、区间及日级汇总。 [时间契约](05-temporal-and-query-capabilities.md) |
| 真实请求、会话日活、新建会话和执行时长需要不同的证据。 | 源码核验。旧 `billing.requests` 是聚合事件数，会话跨度是窗口内观察。 | 保留 scoped 去重会话，增日活跃和首次观测，独立设计可信请求及创建时间。 [会话口径](05-temporal-and-query-capabilities.md#会话项目和频率) |
| 旧真实快照 all 的会话与项目约占未压缩 payload 74%，7d/30d 约占 83%。 | 已验证磁盘 DTO，现有 deferred mount 只影响渲染。 | 先保留入口并延后挂载，L2 再做真实按需分页与摘要接口。 [性能与实施](08-risk-and-refactoring-plan.md) |
| 此次旧快照三个窗内部对账通过，重叠日跨窗存在差额，缺乏共同 revision。 | 本地实测。当前采集器回放的 7d/30d/all 使用相同 cutoff，可作为补充证据。 | 跨图使用共同窗口、同一代际及筛选。输出数据年龄和状态。 [验证附录](appendix-verification.md) |

## 报告索引

| 文档 | 内容 |
|---|---|
| [01 数据架构](01-data-architecture.md) | Collector 到页面的本地、传输和远程链路，宿主集成、权限与刷新 |
| [02 采集器能力](02-collector-capabilities.md) | 每平台数据来源、Token 与非 Token 字段、来源降级和实时样本 |
| [03 指标字典](03-metrics-dictionary.md) · [JSON](metrics-dictionary.json) | 稳定 metric ID，公式、分母、可加性、精度和零值 |
| [04 身份与计价](04-identity-and-billing.md) | 原始、展示和计价身份、Antigravity、版本化价格与对账 |
| [05 时间与查询](05-temporal-and-query-capabilities.md) | 自然日、小时覆盖、会话、跨维过滤、Top N |
| [06 同步完整性](06-sync-and-data-integrity.md) | 离线导入、Agent/Gateway/Tray、Ledger 与历史保护 |
| [07 能力矩阵](07-data-capability-matrix.md) · [JSON](capability-matrix.json) | 可用等级、数据源、覆盖、可视化场景和风险 |
| [08 风险与计划](08-risk-and-refactoring-plan.md) | 性能容量、验证策略、L0–L4 路线 |
| [09 Gemini 交接](09-gemini-handoff.md) | 实施范围、接口和类型建议、验收清单 |
| [界面清单](appendix-ui-inventory.md) · [验证与对账](appendix-verification.md) · [数据样本](api-samples.json) | 组件消费、测试、真实聚合摘录和合成 fixture |

**证据使用方式。** “已验证”指此次实测或直接查看执行分支。当前源码推导不等同于已部署行为。历史材料作为基线或复现线索，所有新的设计与指标字段均标注为建议。读生产、同一 revision 的 Usage/Billing 对账及逐平台可靠时点分母属于证据缺口，不阻塞基于现有接口的重构。 [验证范围](appendix-verification.md)
