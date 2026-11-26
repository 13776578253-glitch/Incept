# 模型身份与成本契约

调查基线为 `main` 的 `aefdab427ef90bf53f4f83c3713994735b582488`。下文的源码判断针对该提交，历史样本明确标明观察时间与来源。生产运行时的开关、活动目录、账本 revision 和当前真实覆盖率需要以目标环境只读核验结果为准。

## 可直接用于交接的结论

- 展示归一、计价映射和客户端来源是三个不同维度。`resolveModelIdentity` 给出展示身份；`estimateLedgerUsage` 使用 `(source, modelName)` 查询显式计价映射；`source` 是采集客户端，不能单独证明实际交易渠道。[展示身份](../../../packages/dashboard/src/domain/model-registry.ts#L69) · [计价选模](../../../packages/dashboard/src/sync/billing-usage-estimate.ts#L5)
- Usage 旧路径的 `cost` 对单条事件优先使用来源记录金额，否则使用本地单价计算；新版 Billing 汇总官方 API USD 等效估算，保留未知、排除与来源原额审计。两者不是相同指标。订阅费、实际支付和订阅额度权重分别需要各自的来源与契约。[旧价格](../../../packages/dashboard/src/adapters/local/collectors/common.ts#L23) · [计价契约](../../plans/2026-11-14-dashboard-billing-contract.md)
- Billing Owner 读接口受开关保护。静态 publication 要求账本 revision 与摘要匹配；managed 模式允许返回较旧 checkpoint 并触发异步更新，响应带 `liveRevision`。前端当前只检查范围并在存在 breakdown 时拼接，**未校验 Usage 与 Billing revision 或 asOf**。同期对账需要独立固定数据集、水位、时间范围、时区和排除策略。[读取](../../../packages/dashboard/src/adapters/runtime/billing-publication.ts#L42) · [客户端](../../../packages/dashboard/src/react/reconcile-billing-models.ts#L285)
- Billing 的窗口和日合计可直接使用其返回值。当前 UI 将同一计价模型的合计按旧成本或 Token 分摊给多个展示模型，再按窗口模型 Token 占比分配到各日。该分摊不能作为精确的模型日成本，也未保证每天模型成本之和等于该日 Billing 总额。[模型分摊](../../../packages/dashboard/src/react/reconcile-billing-models.ts#L96) · [每日分摊](../../../packages/dashboard/src/react/reconcile-billing-models.ts#L254)

## 身份管线及字段

| 身份层 | 当前行为与置信度 | 重构接口要求 |
| --- | --- | --- |
| 原始名称与数值 ID | Antigravity `generation` 优先 slug 再显示标签，`step` 读取自身信息，`NativeUsage.modelId` 和同库 `learned` 参与回填。缺失时形成 `model-id:<n>`、placeholder 或 `unknown`。已验证源码，数值 ID 非全平台统一主键。[metadata](../../../packages/dashboard/src/adapters/local/collectors/antigravity/metadata.ts#L4) · [归属](../../../packages/dashboard/src/adapters/local/collectors/antigravity/events.ts#L26) | 若要精确比较原始模型及 effort，保留原始 slug、数值 ID、展示标签、源版本和其关系的证据。当前 `NativeEvent` 只输出选定的 `modelName`，并非保留所有原生别名 |
| 展示规范模型 | `resolveModelIdentity` 先自定义映射，再静态表、厂商前缀、最后名称启发式。日、月、模型、会话和项目聚合使用 canonical ID。`rawModels`、`providersUsed`、`sourcesUsed` 是模型级集合，不能重建各 raw model × source 的交叉数值。[registry](../../../packages/dashboard/src/domain/model-registry.ts#L69) · [aggregation](../../../packages/dashboard/src/adapters/local/aggregation/accumulate.ts#L183) | 将 canonical ID、显示名与原始名称分字段。更改规则会重新分组历史结果，应版本化映射与说明前后口径 |
| 厂商与来源 | `providerFamily` 是静态表或名称启发式分类。`provider` 可是 OpenAI、WorkBuddy、CommandCode 等，语义包含模型厂商和提供方；`sourcesUsed` 来自客户端标签，并可额外加入 WorkBuddy。已验证源码。[registry](../../../packages/dashboard/src/domain/model-registry.ts#L84) · [source 汇集](../../../packages/dashboard/src/adapters/local/aggregation/accumulate.ts#L299) | 分离 model vendor、客户端、实际购买渠道，后者无直接证据时显示 unknown |
| 配置槽位 | Codex 模型缓存与 CommandCode 收藏/推理配置可产生 `slotStatus: configured`、零用量模型行。它表示配置可见性，实际活跃以 `measured` 与窗口 Token 为准。[配置槽位](../../../packages/dashboard/src/adapters/local/aggregation/configured-models.ts#L11) | 模型数同时给出配置槽位数与窗口实际活跃模型数，分母不混用 |
| Effort、Agent 角色 | Neon 的 low/medium/high 在展示层归到 Neon，原始名称仍以模型级集合存在，逐事件的 effort 与角色并非统一字段。名字含 orchestrator、worker 是线索，主从关系和每次真实执行链需要额外证据。[registry](../../../packages/dashboard/src/domain/model-registry.ts#L41) · [类型](../../../packages/dashboard/src/domain/types.ts#L59) | 角色和 effort 设置独立枚举与 `unknown`，记录来源与置信度，避免仅靠显示名构造协作图 |
| 计价模型 | 服务端 channel 映射采用大小写敏感的精确 `(channel, model)` 键，匹配后得到费率 canonical key；无映射使用原名称查价。一个展示 canonical 可以对应不同计价键。[匹配](../../../packages/dashboard/src/sync/usage-billing-channel-mappings.ts#L12) · [估价](../../../packages/dashboard/src/sync/billing-usage-estimate.ts#L10) | 输出原始键、计价键、规则版本、费率版本与估价状态。映射证据与模型血缘证据分别维护 |

Antigravity 同一个数值 ID 下，只有原生记录将多个名称关联同一 ID 且已知价格签名完全一致时，旧本地 collector 才复用价格；它不会仅凭拼写相近复用。[同 ID 价格](../../../packages/dashboard/src/adapters/local/collectors/antigravity.ts#L32)

### 重要身份映射清单

此表记录仓库规则和历史样本证据，不作供应商现行身份认证。历史记录对应的采集器和版本可能变化。

| 原始名称或角色 | 当前展示身份 | 当前计价身份 | 证据与精度 |
| --- | --- | --- | --- |
| `gemini-4-hydrogen` 与不同显示档位 | 原始 slug 一致时汇总，slug 外显示 effort 未独立保存 | 原名对应 catalog | 2026-11-21 历史审计报告指出多个 ID 共用 slug、标签不同，属于当时只读样本，需保留 ID 与标签才能逐档分析。[历史样本](../antigravity-model-identity-and-token-accounting-audit.md#第三部分特殊模型映射调查) |
| `gemini-4-hydrogen-tiered-high` | 单独名称 | `gemini-4-hydrogen` | 明确的当前渠道费率规则，高置信度描述“代码如何计价”。是否以基础模型合并展示属于设计决策。[映射](../../../packages/dashboard/src/sync/usage-billing-channel-mappings.json#L19) |
| `gemini-4-neon-{low,medium,high}` | `gemini-4-neon` | `gemini-4-neon` | 当前静态展示与 Antigravity 计价规则均合并，低中高 Token 无法从合并后的模型日明细准确拆回。[registry](../../../packages/dashboard/src/domain/model-registry.ts#L41) · [映射](../../../packages/dashboard/src/sync/usage-billing-channel-mappings.json#L26) |
| `gemini-4-argon-trial` | 独立名称 | `gemini-4-argon` | 历史样本报告 slug 同时出现于两个数值 ID 和不同档位；当前计价映射存在。[映射](../../../packages/dashboard/src/sync/usage-billing-channel-mappings.json#L12) · [历史样本](../antigravity-model-identity-and-token-accounting-audit.md#m4gemini-4-argon-trial) |
| `gemini-pro-orchestrator-g1-pro` | 以原名回落 | 原名选价，当前映射表无此键 | 历史样本标为 Orchestrator (Argon)，但其基础模型的归属存在不同编号体系与证据冲突。应保留原始身份和未定价状态，直到独立核实。[报告](../antigravity-model-identity-and-token-accounting-audit.md#m2gemini-pro-orchestrator-g1-pro) · [映射表](../../../packages/dashboard/src/sync/usage-billing-channel-mappings.json) |
| `gemini-pro-orchestrator-neon` | 以原名回落 | 原名选价，当前映射表无此键 | 2026-11-21 历史样本中的原始 slug 与 `Orchestrator (Neon)` 标签共现。该报告建议映射 Neon，当前规则尚未收录。角色与底层计价身份应独立保存。[历史样本](../antigravity-model-identity-and-token-accounting-audit.md#m3gemini-pro-orchestrator-neon) |
| `gemini-flash-worker-agy` | 以原名回落 | 原名选价，当前映射表无此键 | 历史样本 slug 与 Hydrogen Orchestrator 标签共现，报告建议 Hydrogen 参考价，同时保留 worker 身份。实际活动 catalog 是否含该原键另需核验。[历史样本](../antigravity-model-identity-and-token-accounting-audit.md#m1gemini-flash-worker-agy) |
| Carbon / 裸 `gemini-pro-orchestrator` | 无专用归一项时保留原名 | 无专用映射时原名选价 | 历史报告列出外部工具之间和本地编号差异，待独立验证，不能从字符串推导付费身份。[对比](../antigravity-model-identity-and-token-accounting-audit.md#第二部分三个开源项目对照) |
| `gemini-3.8-flash-n`、`-exp-a`、`-tiered` | 分别保留 | Antigravity 下均映射到 `gemini-3.8-flash` | 展示身份刻意区分，当前计价规则复用基础费率。[registry](../../../packages/dashboard/src/domain/model-registry.ts#L103) · [映射](../../../packages/dashboard/src/sync/usage-billing-channel-mappings.json#L205) |
| `codex-auto-review` 与 `-unpriced` | 合为 `codex-auto-review` | Codex 来源明确 `exclude` | 用量保留，属于计价范围外，不计作未估价 Token。[registry](../../../packages/dashboard/src/domain/model-registry.ts#L27) · [映射](../../../packages/dashboard/src/sync/usage-billing-channel-mappings.json#L59) |
| DeepSeek Flash 多渠道别名 | 多数归到 `deepseek-v4.1-flash`，部分 provider 为 WorkBuddy / CommandCode | 多渠道显式规则归到 `deepseek-flash` | 展示 canonical 与计价 canonical 字符串不同，不能直接按字符串等值连接。[registry](../../../packages/dashboard/src/domain/model-registry.ts#L17) · [映射](../../../packages/dashboard/src/sync/usage-billing-channel-mappings.json#L72) |
| Claude Opus 5.5 cache write | 原始展示规则 | `claudeCode` 的缺写入分档走静默缺价 | 静默影响提醒列表，保留未估价状态与 Token；不能把它改成零费用或已覆盖。[映射](../../../packages/dashboard/src/sync/usage-billing-channel-mappings.json#L53) · [判定](../../../packages/dashboard/src/sync/billing-usage-estimate.ts#L17) |

## 两套费用与数据流

### Usage 本地成本

`loadLocalPricingMap` 先装临时兜底表，再读取本机 aiusage 价格/别名与覆盖、CommandCode catalog，最后 Dashboard 本地覆盖。`lookupPricing` 依次尝试原名、短名、canonical、显式别名及厂商前后缀。其用途是旧展示估算，不具备独立事件历史费率版本。`usageEvent` 将非负来源 `recordedCost`（包括 0）优先作为成本，否则 `computeCostFromPricing` 将普通输入、输出及推理、缓存读取和缓存写入分别乘单价。任何非零分项缺价时保留 `missingPricing`，计算值为 0，不能将该 0 解释为免费。[载入](../../../packages/dashboard/src/adapters/local/pricing.ts#L11) · [匹配](../../../packages/dashboard/src/adapters/local/pricing.ts#L96) · [计价](../../../packages/dashboard/src/adapters/local/pricing.ts#L153) · [事件](../../../packages/dashboard/src/adapters/local/collectors/common.ts#L23)

### Billing 发布和托管读取

`BillingRate` 记录模型、provider、USD、证据、有效区间、各分项十进制费率、可选长输入门槛及可选时段表。费率发布要求事务，拒绝同模型重叠生效区间；读取要求事件时间区间完全落入一个费率版本。`estimateUsage` 使用整数定点运算并返回十进制字符串。日级记录覆盖新加坡自然日，若该日跨多个峰谷倍率，或者日级总输入超长输入门槛无法判断请求分档，则为 `DAY_RATE_AMBIGUOUS`。非零分项缺费率产生 `RATE_COMPONENT_MISSING`；无匹配费率产生 `RATE_NOT_FOUND`；发生时间缺失产生 `OCCURRENCE_TIME_UNKNOWN`。事件原始 `timestampPrecision` 的跨链路覆盖还应结合同步字段矩阵确认。[计算](../../../packages/dashboard/src/domain/usage-billing.ts#L15) · [选择](../../../packages/dashboard/src/adapters/local/usage-rate-catalog.ts#L121)

`usage_billing_runs` 与明细保留输入、目录、账本、旧口径、审计信息；经人工证据审阅后的 publication 包含 revision、ledger、catalog、input、run、asOf、四窗口结果与 approval。`billing_members` 为托管投影保存来源、原始和 canonical 模型、费率版本、状态、金额和身份锚点；`billing_days` 与 model/day/channel 投影服务窗口读取。不能把模型日投影存在于服务端推断成当前 API 已按模型和日期交叉输出，`BillingReadBreakdown` 暴露 `days`、`models[].channels` 和 `unpriced`，未直接输出 model × day 网格。[发布](../../../packages/dashboard/src/sync/usage-billing-publication.ts#L11) · [托管表](../../../packages/dashboard/src/sync/managed-billing.ts#L26) · [返回类型](../../../packages/dashboard/src/domain/usage-billing-read.ts#L3)

`GET /api/dashboard/billing?range=7d|14d|30d|all` 在 `INCEPT_BILLING_READ_MODE !== owner` 时返回 404，非 Owner 返回 403，窗口无效 400，publication 不可用 503；页面启用预览还要求 `INCEPT_BILLING_UI_MODE=owner`。非 managed 静态读取要求 revision 和 ledger hash 一致，managed 允许使用 `revision <= liveRevision` 的 checkpoint，落后或过期时排队刷新。读取返回 `estimatedCostUsd` 字符串、`estimatedTokens`、`unpricedTokens`、`excludedTokens`、`recordedUnknownCurrency`、`run`、`catalog`、`revision`、`asOf`，可选 `breakdown`。当前开关是否启用及线上 revision 未在本次核验。[路由](../../../apps/web/src/app/api/dashboard/billing/route.ts#L8) · [页面开关](../../../packages/dashboard/src/next/dashboard-page.tsx#L18) · [读取](../../../packages/dashboard/src/adapters/runtime/billing-publication.ts#L42)

窗口不变量为 `tokens = estimatedTokens + unpricedTokens + excludedTokens`。价格覆盖率为 `estimatedTokens / (estimatedTokens + unpricedTokens)`，零分母显示空值。按窗口筛选时重新求和分子和分母。`recordedUnknownCurrency` 是成员数量，并非金额、Token 或已支付费用。[publication 校验](../../../packages/dashboard/src/adapters/runtime/billing-publication.ts#L17) · [UI 覆盖](../../../packages/dashboard/src/react/sections/costs/reference-cost-breakdown.tsx#L171)

## 价格、时间与对账

| 项目 | 已验证的行为 | 前端及扩展契约 |
| --- | --- | --- |
| 混合来源价格 | Usage 的 recorded 与本地 calculated 可同属 `cost`；Billing 对每成员采用官方 USD 参考估价 | UI 显示明确的成本口径及依据；不把旧总额标为实付或新版参考价 |
| 历史价格 | Billing catalog 版本按事件时间选取；旧路径根据当前本地配置算价 | 保留 catalog hash、rate version、run、asOf；费率变更单独发布和审阅，避免静默改写历史 |
| 峰谷 | `BillingSchedule` 有显式区间或按时区、星期、节假日的峰时规则；跨倍率日级记录保持不确定 | 峰谷图只使用有明确时段和归属的数据；当前公开 breakdown 不含按时段的 Billing 成本，属于 API 扩展 |
| 长上下文 | 输入阈值使用 `input + cacheRead + cacheCreation`；超阈值日级记录拒绝按汇总选择高档 | 请求级分档需来源粒度与有效时间精度；不对日汇总按单请求处理 |
| 价格覆盖与未知 | 状态区分 estimated、unpriced、excluded，unpriced 有原因；部分缺 cache-write 分档静默 | 明确列出已估计、未估价、排除；静默只影响提示，不影响覆盖统计 |
| 两 API 对账 | Usage 和 Billing 为独立快照与计价管线，Billing 支持读到落后 checkpoint，UI 仅检查 range | 先比较 `revision`、数据集成员、asOf、范围、归属与排除，然后分别校验 Token 和各自成本口径；缺少 Usage 对应 revision 时标识不可对账 |

`reconcileDashboardWithBilling` 对模型查找使用的前端别名表，将原本按渠道区分的规则扁平化为模型名映射，并给首个短名别名赋值。未来出现同名不同渠道映射时，可能匹配到错误的计价组。当前代码还对匹配不到的模型保留 Usage 旧成本，造成同一模型列表潜在混合来源；不能把该列表默认为逐模型官方成本权威结果。[别名构造](../../../packages/dashboard/src/react/reconcile-billing-models.ts#L19) · [未匹配模型](../../../packages/dashboard/src/react/reconcile-billing-models.ts#L187)

推荐在后端以同一 revision、asOf 和筛选条件，从 billing 成员按日、规范计价身份和来源直接聚合。API 对每个格子返回精确的估价金额字符串、estimated/unpriced/excluded Token 与覆盖状态。仅凭窗口模型总额和每天 Token 无法确定峰谷、多价格版本或输入输出组成不同所产生的每日成本。若暂时保留客户端分摊，明确标记 `allocatedEstimate` 并与 Billing 合计分开。

## 实施分级与验收

| 等级 | 改动与依赖 | 验收条件 |
| --- | --- | --- |
| L0 | 显示 Owner Billing 的已提供窗口、日期总额、模型和客户端成本，以及三个覆盖状态 | 每项读取相同响应的 metadata；缺 breakdown、旧 checkpoint 和不可用状态明确展示 |
| L1 | 从已提供的 numerator/denominator 计算覆盖和成本份额；单独统计配置模型与活跃模型 | 比例由筛选后合计重算，0 分母为空，模型份额及排除分母可复核 |
| L2 | 暴露模型 × 日 × 来源的托管 Billing 聚合、revision/asOf/口径、未匹配身份与匹配来源 | 模型日格之和与同口径 Billing 日及窗口金额对账，保留十进制精度与覆盖状态；接口按 Owner 授权 |
| L3 | 事件保留原始 slug、数值 ID、标签、effort、角色及其证据，传输与投影版本化 | 旧事件读取兼容，新增字段缺失标为 unknown，重放前后原总量与账本可对账 |
| L4 | 实付账单、订阅额度权重、实际渠道、独立可靠主从关系 | 引入授权数据源及其 currency、时间区间、账户归属和隐私策略；与 API 等效估算分别展示 |

## 验证记录

当前提交下直接运行本地 Vitest 的 `model-registry.test.ts`、`gemini-pricing.test.ts`、`usage-billing.test.ts`，共 3 个测试文件、21 项通过。测试使用隔离 fixture，验证静态身份、临时价格、账本估价、映射、发布与相关条件；并不构成当前生产数据对账。执行时系统默认临时目录导致 Vite 模块缓存 `ENOENT`，将 `TEMP` 与 `TMP` 指向工作区临时目录后通过。`pnpm` 的 Corepack shim 因网络不可用未能下载目标版本，实际使用仓库已有 Vitest 可执行文件。历史 2026-11-21 的 Antigravity 多库样本结果见原报告，本次未重新采集原始会话记录。
