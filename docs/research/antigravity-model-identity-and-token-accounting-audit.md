# Antigravity 模型身份与 Token 计量专项调研报告

**报告类型**：源码调研 / 交叉验证 / 方案设计（未修改任何生产代码、配置、Ledger 或费率目录）

**调研日期**：2026-11-21

**Incept 仓库基线**：分支 `main`，Commit `c50a0c5eb64333bc5acebb5d6c72062b2881f686`（`fix(dashboard): align owner model ranking and full model costs with managed billing`）

**参考仓库基线**（克隆于 `D:\Desktop\explore\gemini1`，仅只读阅读）：

| 参考项目 | Commit SHA | 提交时间 |
|---|---|---|
| Antigravity-Context-Window-Monitor | `72a4a366f57ce2e304d04d842703dc44d7d2cebf` | 2026-11-19T16:32:32+11:00 |
| agy-stats | `7a759e885c6884458741b850b52eccc60b139520` | 2026-11-15T03:10:44+07:00 |
| antigravity-token-dashboard | `e1d6e3cefda4de0e92cc5ca22b9820d697fde19f` | 2026-11-18T13:34:39-03:00 |

**本地只读样本**：`%USERPROFILE%\.gemini\{antigravity,antigravity-cli,antigravity-ide}\conversations\*.db`，共 **386 个 SQLite 库**、**89,969 条 usage 记录**（全部以 `readOnly: true` 打开，未写入、未复制到外部服务、未上传）。

---

## 第一部分：现有 Incept 架构审计

### 1.1 完整调用链（Antigravity SQLite → Dashboard）

| 阶段 | 文件 | 函数 / 关键行 | 职责 |
|---|---|---|---|
| ① 发现源文件 | `packages/dashboard/src/adapters/local/collectors/antigravity.ts` | `collectAntigravityEvents`，`walkFiles(join(home,'.gemini',folder,'conversations'), path=>path.endsWith('.db'))` | 扫描 `antigravity` / `antigravity-cli` / `antigravity-ide` 三个目录，按 mtime 降序 |
| ② 只读打开 | `packages/dashboard/src/adapters/local/sqlite.ts` | `openSqliteReadOnly` | 只读句柄 |
| ③ 表级读取 | `.../collectors/antigravity/events.ts` | `readConversation`（L4） | 读取 `gen_metadata.data`（field 1）与 `steps.metadata`，先检查 `sqlite_master` 是否存在该表 |
| ④ Protobuf 解码 | `.../collectors/antigravity/protobuf.ts` | `fields` / `messages` / `message` / `integer` / `string` / `integers` / `timestamp` | 手写 wire-format 解码器（varint / len-delim / fixed） |
| ⑤ 字段映射 | `.../collectors/antigravity/metadata.ts` | `usage()`（L12）、`events()`（L21）、`generation()`（L29）、`step()`（L38） | 数值字段到 Token 分项；模型 ID 与模型名提取 |
| ⑥ 模型名归属 | `.../collectors/antigravity/events.ts` | `readConversation` 的 `append` 闭包（L32–L40）、`learned` 映射（L26–L27）、未挂靠 step 回填（L45–L47） | 把 usage 记录绑定到 slug / 展示标签 / `model-id:<n>` |
| ⑦ 请求级去重 | `.../collectors/antigravity/events.ts` | `deduplicateRequests`（L51–L71） | 按 `response:/provider:/message:` 身份键合并；逐分项取 `Math.max` |
| ⑧ 跨会话去重 | `.../collectors/antigravity.ts` | `seen` 集合，`sessionId + ':' + key` | 同一会话内多 key 命中即跳过 |
| ⑨ 事件构造与计价 | `.../collectors/common.ts` | `usageEvent`（L22–L34） | 时间戳/计数合法性校验、时区日键、项目归属、`missingPricing` 标记 |
| ⑩ 同 ID 费率复用 | `.../collectors/antigravity.ts` | `namesById` + `signature()`（L38–L51） | **仅当**原生记录明确把多个名字关联到同一数值 model ID 且候选费率完全一致时，才复用费率 |
| ⑪ 汇总 | `.../aggregation/accumulate.ts` | `accumulateUsageEvents`（L15） | 日/月/模型/来源/会话/项目六维聚合 |
| ⑫ 身份归一 | `.../domain/model-registry.ts` | `resolveModelIdentity`（L77） | 静态别名表 + 前缀剥离 + 兜底透传 |
| ⑬ 展示汇总 | `.../aggregation/summarize.ts` | `summarizeUsageEvents`（L14） | 排行榜、缓存命中率、覆盖率、未定价清单 |
| ⑭ 导出 | `.../imports/exporter.ts` | `exportTokenData`（L37–L49） | 转成 `TransferEvent`；`eventId = canonicalTransferId` |
| ⑮ 渠道映射 | `packages/dashboard/src/sync/usage-billing-channel-mappings.json` | `rules[]` | `(channel, model)` 精确映射 / 排除 / 静音缺价 |
| ⑯ 计价 | `packages/dashboard/src/domain/usage-billing.ts` | `estimateUsage`（L90） | 定点 BigInt 计价、`longPrompt`、`schedule` 多倍率 |
| ⑰ 费率选择 | `.../adapters/local/usage-rate-catalog.ts` | `readUsageRates().select()` | 按事件时间区间匹配版本 |
| ⑱ 托管账本 | `.../sync/managed-billing.ts` | `reconcile` 中的 `estimateLedgerUsage`（L192） | 写入 `billing_members`，保留 `reason` / `silent` |
| ⑲ 一致性校验 | `.../sync/billing-ledger-version.ts` | `billingLedgerVersion` | revision + scopes + legacy 的哈希绑定 |

### 1.2 已正确、应当保留的机制

1. **请求级身份去重是必需的，且实测无副作用。**
   `events.ts` 使用 `response:/provider:/message:` 三类身份键合并（L51–L71）。本地 89,969 条记录中 **89,844 对** gen/step 镜像记录，逐分项比对后 **完全相等的有 89,844 对，不一致 0 对**。`Math.max` 合并在该数据分布下不丢任何 Token。

2. **retry 字段不会造成重复计量。**
   `metadata.ts` L23–L24 同时读取 `field 4`（usage）与 `field 17 → 2`（retry usage）。实测：gen 主记录 44,986 条 / retry 记录 46,047 条，其中 **44,922 条 retry 记录与主记录身份键完全重合**，仅 1,125 条 retry 记录无身份键且 Token 为 0。**误判为「额外请求」的独立 retry 为 0 条**。此设计正确。

3. **数值 model ID 已经进入归属逻辑，且不做字符串猜测。**
   `antigravity.ts` L38–L51 的 `namesById` 只有在「原生记录自身说明两个名字共享同一 model ID」且费率签名完全一致时才复用费率。这与 `DEFAULT_PRICING_ALIASES`（`overrides.ts` L9–L13）「共享费率不合并身份」的注释一致。

4. **未定价 Token 完整保留。**
   `common.ts` L30–L33 与 `summarize.ts` L208–L221 保持 `missingPricing` 与 `unpricedTokens` 分离，`estimatedTokens + unpricedTokens + excludedTokens === tokens` 由 `billing-publication.ts` L29 强制校验。截图中的 `Unestimated tokens 179.29M` 正是这条路径的产物，**不是采集失败**。

5. **历史费率版本化与时间匹配是健全的。**
   `usage-rate-catalog.ts` `publishUsageRates` 强制事务（L79 `RATE_PUBLICATION_TRANSACTION_REQUIRED`）、区间不重叠（L111 `USAGE_RATE_INTERVAL_OVERLAP`）、版本哈希去重；`readUsageRates().select()` 按 `billingInterval` 匹配。`billing-ledger-version.ts` 把 revision 与 ledger 哈希绑定，`billing-publication.ts` L58 拒绝陈旧发布。

6. **缓存命中率是 Token 加权、非百分比平均。**
   `summarize.ts` L92 / L113 / L240 / L258 全部使用累加后的 Token 分子分母，不存在「先算每会话百分比再平均」。

### 1.3 有源码证据支持的问题

#### P1（高）— 缓存命中率分母把「缓存写入」计入了提示词总量，但该源恒为 0

- 位置：`summarize.ts` L92（`promptTotal = inputTokens + cacheCreationTokens + cacheReadTokens`）、L113、L240、L258。
- 证据：本地 89,969 条记录的 `field 4`（cache creation / cache write）**恒为 0**（见附录 A 第 3 行，`cacheWrite: 0` 出现在全部模型）。
- 结论：Antigravity 通道下分母等价于 `inputTokens + cacheReadTokens`，当前公式**在该通道上结果正确**，但语义上是「三分项通用公式」。若未来 Google 开始上报 cache write，分母会自动扩张而不需要改动 —— 这一点是**设计正确**，不算缺陷。
- 需注意的真实风险：`agy-stats` L2755 / L2801 使用 `cache / (in + cache)`（**不含** cache write），`Context Monitor` `telemetry-metrics.ts` L9–L10 明确 `totalPromptTokens = input + cacheRead + cacheCreation`。两者在 Incept 的实测数据上等价，但 Incept 的公式可跨通道复用，**建议维持**。

#### P2（高）— 三个模型缺少渠道映射，导致 179.29M Token 未被估价

- 位置：`packages/dashboard/src/sync/usage-billing-channel-mappings.json`（version 2，36 条规则）。其中 **没有** `gemini-flash-worker-agy`、`gemini-pro-orchestrator-g1-pro`、`gemini-pro-orchestrator-neon` 的任何条目。
- 证据：`docs/plans/dashboard-billing-reference-catalog-2026-11-13.json` 的 33 条费率版本中，`gemini-4-argon`（L119/L128）、`gemini-4-hydrogen`（L136）、`gemini-4-neon`（L144）存在，**没有** orchestrator / worker 的任何费率。
- 机理：`billing-usage-estimate.ts` L10–L11 先查渠道映射；无映射则用 `event.modelName` 原样选价（L12），选不到即 `RATE_NOT_FOUND`（`usage-billing.ts` L94），最终进入 `billing_members.reason`。
- 实测复现（与截图完全一致）：`gemini-flash-worker-agy` 127.19M / 478 gen 记录；`gemini-pro-orchestrator-g1-pro` 34.23M / 179；`gemini-pro-orchestrator-neon` 17.87M / 96。截图中的 481 / 180 / 97 是 gen+step 合计（每个多一条无 Token 或无名的镜像），差异可解释。

#### P3（高）— `metadata.ts` 的 `outputTokens` 归一与 `accumulate.ts` 的 `totalTokens` 相加口径不自洽（潜在重复）

- 位置：`metadata.ts` L13–L15
  ```
  const totalOutput = Math.max(integer(data, 3) ?? 0, visible + reasoningTokens);
  outputTokens: Math.max(visible, totalOutput - reasoningTokens)
  ```
- 位置：`accumulate.ts` L168–L176
  ```
  evTotal = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens + reasoningTokens
  ```
- 证据：本地 **89,969 条记录中，`field 3 === field 10 + field 9` 的有 89,969 条（100%）**；`field 3 < visible + reasoning` 为 **0 条**；`field 3 > visible + reasoning` 为 **0 条**。
- 因此当前 `outputTokens = visible`，`reasoningTokens = field 9`，二者互斥，`evTotal` 中 `output + reasoning` **恰好等于 `field 3`，无重复**。
- 但这是**依赖数据分布的正确性**，而非依赖定义的正确性。若某模型出现 `field 3 > visible + reasoning`（例如 provider 侧未拆分 thinking），`outputTokens = totalOutput - reasoning > visible`，此时 `output + reasoning` 仍等于 `field 3`，仍然正确。若出现 `field 3 < visible + reasoning`（当前 0 条），`Math.max` 会把 `outputTokens` 压到 `visible`，从而 `output + reasoning > field 3`，此情形下才可能重复。
- 判断：**逻辑是稳健的**，`Math.max(visible, totalOutput - reasoning)` 正是防重复的保护。`Context Monitor` `telemetry-metrics.ts` L11 的注释「thinkingTokens is strictly a SUBSET of outputTokens (NEVER sum output + thinking)」表述与此不同，但在 Incept 的字段拆分下两者结果一致。**建议维持，但需补一条回归断言把该不变量固化。**

#### P4（中）— `resolveModelIdentity` 缺少 Antigravity 特殊后缀的显式条目，导致排行榜出现内部名称

- 位置：`domain/model-registry.ts` L77 `resolveModelIdentity`；`CANONICAL_ALIASES` 中没有 `gemini-flash-worker-agy`、`gemini-pro-orchestrator-*`、`gemini-4-*-trial`、`gemini-4-hydrogen-tiered-high`。
- 后果：这些名字走 L176–L182 的兜底分支，`canonicalModelId = lower`（原样保留），`inferFamily` 因包含 `gemini` 而判为 `gemini`，`displayName = 原字符串`。这正是排行榜出现多个内部名称的直接原因。
- 注意：`usage-billing-channel-mappings.json` 里已有 `gemini-4-argon-trial → gemini-4-argon`（L13–L17）与 `gemini-4-hydrogen-tiered-high → gemini-4-hydrogen`（L19–L23），但**这两条只影响计价，不影响展示身份**（`billing-usage-estimate.ts` L10–L11 独立于 `resolveModelIdentity`）。所以 `gemini-4-argon-trial` 在当前 Dashboard 里仍然显示为原始名（`dashboard-visibility.test.tsx` L389–L390、L555 明确断言了该行为）。
- 这是**有意的双层分离**（计价身份 vs 展示身份），本身正确；问题在于缺失了 worker / orchestrator 两条映射，且展示层没有对应的归并。

#### P5（中）— `isUnpriced` 计算后未使用

- 位置：`summarize.ts` L93 `const isUnpriced = !pricing && m.cost === 0;`
- 全仓库搜索确认该变量**无任何引用**。真实判定走 L112 `missingPricing: m.missingPricing`（事件级标记）。属于死代码，不影响结果，但会造成阅读误导。

#### P6（低）— `field 19` / `field 21` / `field 22` 三路模型名来源存在优先级歧义

- 位置：`metadata.ts` L16–L19 `identity(slug, label)`，L33 `identity(string(chat,19), string(chat,21,22))`，L41 `identity(string(info,12), string(info,8))`。
- 实测（附录 A）：对同一 model ID，`field 19` 是调用 slug（如 `gemini-pro-orchestrator-g1-pro`），`field 21/22` 是 IDE 展示标签（如 `Orchestrator (Argon)`）。`identity()` 优先取 `field 19`，只有在 `field 19` 缺失时才回落标签。
- 这是**正确的优先级**（slug 更接近真实路由），但意味着一旦某条记录只有标签，同一模型 ID 下就会产生第二个展示名。实测存在这种混合（例如 model ID `1668`：179 条 slug + 1 条仅标签）。

---

## 第二部分：三个开源项目对照

| 能力 | Incept | Context Monitor | agy-stats | Token Dashboard |
|---|---|---|---|---|
| **原始模型识别** | `metadata.ts` `generation/step` 取 `field 3`（gen 行）/`field 24.1`（step），再取 usage `field 1`；`events.ts` L26–L27 建立 `learned: modelId → name` | `models.ts` L118–L181 `responseModelAliases` 把 `responseModel` 映射到 `MODEL_PLACEHOLDER_Mxxx`；L40–L106 维护上下文窗口表 | `agy-stats` L966–L983 `_MODEL_DISPLAY_EXACT` 精确表 + `normalize_model_display` 模糊兜底（L985–L1026） | `antigravity_telemetry/models.json` 以字符串数字 ID 为键，含 `wire_aliases`（如 L269–L274 `M667`/`667`/`gemini-pro-orchestrator`） |
| **内部模型别名** | `model-registry.ts` 静态表，**无** Antigravity orchestrator/worker/trial 条目 | 有，且**显式保留 orchestrator 为独立身份**（L26–L35 注释「Named coordinators have their own identities」） | 有，但把 orchestrator **合并进 Carbon/Argon**（L994–L995） | 有，orchestrator 为独立 family（L260–L343） |
| **Token 分项** | `input / output / reasoning / cacheRead / cacheCreation` 五分项，`output` 与 `reasoning` 互斥（`metadata.ts` L13–L15） | 同样五分项，但注释明确 thinking 是 output 的**子集**（L11） | `in / out / cache` 三分项，`out = max(field3, visible+reasoning)`、`total = in + cacheW + cacheR + out`（L1207–L1212） | `prompt_uncached / cached_tokens / thinking / answer`，`total_input = prompt + cached`（`TELEMETRY_SPEC.md` L307–L312） |
| **缓存命中计算** | `cacheRead / (input + cacheCreation + cacheRead)`（`summarize.ts` L92/L113/L240/L258），Token 加权 | `tokenCacheHitRate` + `callCacheHitRate` + `cacheReuseRate` 三指标，`totalPromptTokens = input + cacheRead + cacheCreation`（L9–L10） | `cache / max(1, in + cache)`（L2755 / L2801），**不含** cache write | `cache_hit_ratio_pct = cached / total_input`（`TELEMETRY_SPEC.md` L313 样例 87.18%） |
| **重复计量保护** | 请求级身份键 + `Math.max` 逐分项合并（`events.ts` L51–L71）；跨会话 `seen` 集合；导出时 `canonicalTransferId` 冲突直接抛错（`exporter.ts` L46–L47） | 未见针对 gen/step 镜像的显式合并逻辑 | 显式 `_dedup_db_events`（L1233+）+ `_mu_is_mirror`（L1198）+ `_mu_same_counts`（L1195），DB 为唯一权威 | `response_id` 关联 + `steps`/`gen_metadata` 交叉校验 |
| **历史价格处理** | 版本化费率目录 + 事务发布 + 区间不重叠 + `effectiveFrom/To` 按事件时间选择（`usage-rate-catalog.ts`、`usage-billing.ts` L90+）；`longPrompt` 与 `schedule` 内建 | `pricing-store.ts` 本地价格存储，未见版本区间语义 | **无**价格历史版本；`MODEL_QUOTA_WEIGHTS`（L200–L224）是配额权重而非 USD API 价格 | `config/pricing.json` 单快照，含 `rates_per_million` 与 `quota_weights_per_million`，无生效区间 |

### 关键对照结论

**① `gemini-pro-orchestrator` 的基础模型，三方判断一致地不可靠，且互相冲突。**

- Context Monitor `models.ts` L26–L28：裸 `gemini-pro-orchestrator` → `MODEL_PLACEHOLDER_M667`，注释与 `models.json` 均称为 **Orchestrator (Carbon)**。
- agy-stats L964–L968：裸 `gemini-pro-orchestrator` → **Orchestrator (Carbon)**，注释给出证据「verified via cli.log "Orchestrator (Carbon)" correlation」。
- Token Dashboard `models.json` L260–L274：`1667` = Orchestrator (Carbon)，别名含 `gemini-pro-orchestrator`。
- **三者一致把裸 slug 归为 Carbon**，但**我的本地实测出现反证**（见第三部分 M2）：本地 model ID `1668` 的 slug 是 `gemini-pro-orchestrator-g1-pro`，标签是 **`Orchestrator (Argon)`**。这说明至少存在两种编号体系：`1667/1681`（Token Dashboard 的 Carbon/Argon）与 `668/669`（本地实测），且 `g1-pro` 与 `argon` 的对应关系没有任何一个参考项目覆盖。

**② 缓存命中率三方公式在 Antigravity 数据上等价，但语义来源不同。**

Incept 与 Context Monitor 都含 cache write；agy-stats 不含。本地 cache write 恒为 0，故三者数值相同。Incept 的公式可跨通道复用，是三者中最稳健的。

**③ 只有 Incept 具备「计价身份 ≠ 展示身份」的双层分离。**

这是 Incept 相对三个参考项目的**实质性优势**：`usage-billing-channel-mappings.json` 只影响计价，`model-registry.ts` 只影响展示。参考项目都只有单层（一个名字对应一个语义），因此它们必须做「要么合并、要么不合并」的二选一决策。Incept 可以为同一模型保留原始档位同时合并展示。

---

## 第三部分：特殊模型映射调查

### 证据方法

对 386 个本地 SQLite 库做只读解析，从 **`gen_metadata.field 20`（`model_enum` placeholder）** 提取 Antigravity 自带的稳定占位符 ID，并与 `field 3`（数值 model ID）、`field 19`（slug）、`field 21/22`（IDE 标签）做三方交叉。这是本报告最强的证据来源，因为 `field 20` 是 Antigravity 自身写入的、与 IDE 选择器一一对应的枚举。

实测映射表（`gen_metadata`，样本量）：

| 数值 model ID | `field 20` placeholder | 记录数 | slug（field 19） | IDE 标签（field 21/22） |
|---|---|---|---|---|
| 1318 | `MODEL_PLACEHOLDER_M318` | 27,300 | `gemini-3.8-flash-n` / `-exp-a` / `-exp-b` / `gemini-3.8-flash` | `Gemini 3.8 Flash (High)` |
| 1322 | `MODEL_PLACEHOLDER_M322` | 12,524 | `gemini-3.8-flash-tiered` | （无） |
| 1525 | `MODEL_PLACEHOLDER_M525` | 2,324 | `gemini-4-hydrogen` | `Gemini 4 Hydrogen (High)` |
| 1526 | `MODEL_PLACEHOLDER_M526` | 569 | `gemini-4-hydrogen` | `Gemini 4 Hydrogen (Medium)` |
| 1528 | `MODEL_PLACEHOLDER_M528` | 1,317 | `gemini-4-hydrogen` | `Gemini 4 Hydrogen (XHigh)` |
| **1530** | **`MODEL_PLACEHOLDER_M530`** | 90 | **`gemini-4-hydrogen-tiered-high`** | **`Gemini 4 Hydrogen (High)`** |
| **1537** | **`MODEL_PLACEHOLDER_M537`** | 96 | **`gemini-pro-orchestrator-neon`** | **`Orchestrator (Neon)`** |
| **1668** | **`MODEL_PLACEHOLDER_M668`** | 180 | **`gemini-pro-orchestrator-g1-pro`** | **`Orchestrator (Argon)`** |
| **1669** | **`MODEL_PLACEHOLDER_M669`** | 478 | **`gemini-flash-worker-agy`** | **`Gemini 4 Hydrogen (Orchestrator)`** |
| 1418 | `MODEL_PLACEHOLDER_M418` | 64 | `gemini-4-argon-trial` | `Gemini 4 Argon (Medium)` |
| 1419 | `MODEL_PLACEHOLDER_M419` | 4 | `gemini-4-argon-trial` | `Gemini 4 Argon (Low)` |
| 1026 | `MODEL_PLACEHOLDER_M26` | 39 | `claude-opus-4-6-thinking` | （无） |
| 1400 | `MODEL_PLACEHOLDER_M400` | 1 | `claude-opus-5-5-low` | `Claude Opus 5.5 (Low)` |

> **决定性发现**：`field 20` 的占位符与 `field 3` 的数值 ID 是**两套独立编号**。`1668` 对应 `M668`，`1669` 对应 `M669`，`1530` 对应 `M530`。参考项目 Token Dashboard 只登记了 `M667`/`M668` 的邻居而**漏掉了 `M668` 本身**（`models.json` 只有 `1667`、`1681`、`1669`）。这解释了为什么社区项目无法解释 `g1-pro`。

### M1：`gemini-flash-worker-agy`

| 项目 | 结论 |
|---|---|
| 原始名称 | `gemini-flash-worker-agy` |
| 数值 model ID | **`1669`**（`field 3`），placeholder **`MODEL_PLACEHOLDER_M669`**（`field 20`） |
| 建议规范模型 | **`gemini-4-hydrogen`**（计价与展示均可归并，档位保留 `worker`） |
| 证据来源 | ① 本地 478 条 `gen_metadata` 记录：`field 19 = gemini-flash-worker-agy` 且 `field 21 = "Gemini 4 Hydrogen (Orchestrator)"`，**同一行内同时出现，7/7 个会话一致**；② Context Monitor `models.ts` L122 把 `gemini-flash-worker-agy` 映射到 `MODEL_PLACEHOLDER_M669`，L265 显示名 `Gemini Flash (Orchestrator Worker)`，L901 明确 `MODEL_PLACEHOLDER_M537 ... executionModelId: 'MODEL_PLACEHOLDER_M669'`（即 Neon orchestrator 的执行体就是这个 worker）；③ Token Dashboard `models.json` L316–L330：`1669` = `Orchestrator Executor (Hydrogen)`，`reasoning_label = "Hydrogen Execution"` |
| 可信度 | **Confirmed**（基础模型为 Hydrogen） |
| 计价条件与限制 | Hydrogen 官方 API 费率 `$1.50 / $7.50 / $0.075`（`dashboard-billing-reference-catalog-2026-11-13.json` L136–L141）。**但** Token Dashboard `M100_...md` L20 通过 Connect-RPC 实测该 executor 的**账务权重是 `1/6x`**（`$0.25 / $0.0125 / $1.25`）。**账务权重 ≠ 官方 API 等效价**，Incept 的契约是「官方 API 等效成本」，因此应使用完整 Hydrogen 价，不应使用 1/6x。 |
| 是否建议立即增加映射 | **是**（计价映射 + 展示归并），但必须保留 `worker` 档位标记，且不得把 1/6x 权重引入 USD 等效成本 |

> **对任务书假设的修正**：任务书提出「`gemini-flash-worker-agy` 应调查是否确实属于 Hydrogen 系列」。**答案是肯定的（Confirmed）**，证据来自本地记录行内共现（slug 与 label 同行），而非字符串相似度。但它是 Hydrogen 的 **Orchestrator 执行体**，不是 Hydrogen High/Medium/Low/XHigh 中的任何一档。

### M2：`gemini-pro-orchestrator-g1-pro`

| 项目 | 结论 |
|---|---|
| 原始名称 | `gemini-pro-orchestrator-g1-pro` |
| 数值 model ID | **`1668`**（`field 3`），placeholder **`MODEL_PLACEHOLDER_M668`**（`field 20`） |
| 建议规范模型 | **暂不归并到 Argon 或 Neon**；建议引入新的展示身份 `gemini-pro-orchestrator`（Carbon/Argon 未定） |
| 证据来源 | ① 本地 180 条记录：`field 19 = gemini-pro-orchestrator-g1-pro` 与 `field 21 = "Orchestrator (Argon)"` **同行共现，7/7 会话一致**（`probe3` 输出）；② 但 Token Dashboard 把 **`1681`（`M681`）** 定义为 Orchestrator (Argon)（`models.json` L288–L301），Context Monitor 同样把 `gemini-pro-orchestrator-argon` 映射到 `MODEL_PLACEHOLDER_M681`（L120）。**本地 `1668`/`M668` 在三个参考项目中均未登记**；③ `g1-pro` 与 `g1-pro-tier` 的语义：Token Dashboard `TELEMETRY_SPEC.md` L121 记录 `antigravityUnifiedStateSync.userStatus` 的 `tier: "g1-pro-tier"` 是 **Google AI Pro 订阅计划标识**。因此 `g1-pro` 后缀很可能表示「按 Google AI Pro 档位路由」，而不是模型代号 |
| 可信度 | **基础模型 = Unknown**；「与 Argon 相关」= **Probable**（IDE 标签同行共现）；「`g1-pro` 是订阅计划而非模型」= **Probable**（仅一条文档证据，无独立复核） |
| 计价条件与限制 | 无法确定应套用 Argon（`$2/$10` 推介期，12 月起 `$4/$20`，catalog L119–L133）还是 Neon（`$3/$15`，L144–L149）。**证据不足，应维持未定价。** |
| 是否建议立即增加映射 | **否**。建议先做一次定向探测（见第四部分 V1）确认 `M668` 在 IDE 模型选择器中的实际位置，再决定 |

> **对任务书假设的修正**：任务书要求「`gemini-pro-orchestrator-g1-pro` 需独立确认基础模型，不预设为 Neon 或 Argon」。**调查结论正是如此：无法确认。** 唯一的正面证据（IDE 标签 `Orchestrator (Argon)`）与三个参考项目登记的 Argon ID（`1681`/`M681`）**编号不符**，因此只能标为 Probable 而非 Confirmed。**按字符串相似度把它并入 Argon 会是错误的**。

### M3：`gemini-pro-orchestrator-neon`

| 项目 | 结论 |
|---|---|
| 原始名称 | `gemini-pro-orchestrator-neon` |
| 数值 model ID | **`1537`**（`field 3`），placeholder **`MODEL_PLACEHOLDER_M537`**（`field 20`） |
| 建议规范模型 | 展示与计价均归并到 **`gemini-4-neon`** |
| 证据来源 | ① 本地 96 条：`field 19 = gemini-pro-orchestrator-neon`、`field 21 = "Orchestrator (Neon)"` 同行共现，**2/2 会话一致**；② Context Monitor `models.ts` L32–L33 把 `gemini-pro-orchestrator-neon` → `MODEL_PLACEHOLDER_M537`，L264 显示名 `Orchestrator (Neon)`，L40–L46 上下文窗口 511,000（Neon 系列特征）；③ Token Dashboard `models.json` 与 `TELEMETRY_SPEC.md` 未登记 `1537`，但 Context Monitor 的 README L16 明确「`Orchestrator (Neon)` (`M537`…) with 512,000 live compression limits」 |
| 可信度 | **Confirmed**（基础模型为 Neon） |
| 计价条件与限制 | Neon 官方 API 费率 `$3 / $15 / $0.15`（catalog L144–L149）。**但** Token Dashboard `M100_...md` L21 实测 orchestrator planner 的账务权重是 `0.50x`。同 M1 的原则：**USD 等效成本用完整 Neon 费率，不引入 0.50x**。 |
| 是否建议立即增加映射 | **是**（计价 + 展示），保留 `orchestrator` 档位标记 |

### M4：`gemini-4-argon-trial`

| 项目 | 结论 |
|---|---|
| 原始名称 | `gemini-4-argon-trial` |
| 数值 model ID | **`1418`**（→ `M418`，64 条，标签 `Gemini 4 Argon (Medium)`）和 **`1419`**（→ `M419`，4 条，标签 `Gemini 4 Argon (Low)`）。**同一个 slug 对应两个不同数值 ID** |
| 建议规范模型 | **`gemini-4-argon`**（现有映射已正确） |
| 证据来源 | ① 本地记录：`1418`/`M418` 与 `1419`/`M419` 的 `field 19` 都是 `gemini-4-argon-trial`，标签分别为 Medium / Low；② Context Monitor `models.ts` L139–L141：`gemini-4-argon-medium → M418`、`gemini-4-argon-low → M419`；③ Incept 已存在映射 `gemini-4-argon-trial → gemini-4-argon`（`usage-billing-channel-mappings.json` L13–L17），catalog 有 Argon 两段费率（L119–L133） |
| 可信度 | **Confirmed**（基础模型 Argon；`trial` = 试用访问配置，非模型变体） |
| 计价条件与限制 | 按事件时间选择 Argon 的推介期或标准期费率。**注意**：现有映射是**单条规则**，无法区分 M418 与 M419，但由于两者同价（Argon 不分档定价），当前实现无误差。 |
| 是否建议立即增加映射 | **计价映射已存在且正确，无需新增**；仅需补展示归并（当前 `dashboard-visibility.test.tsx` L555 断言其显示为原始名） |

### M5：`gemini-4-hydrogen-tiered-high`

| 项目 | 结论 |
|---|---|
| 原始名称 | `gemini-4-hydrogen-tiered-high` |
| 数值 model ID | **`1530`**（`field 3`），placeholder **`MODEL_PLACEHOLDER_M530`**（`field 20`）。**该 placeholder 在三个参考项目中均未登记** |
| 建议规范模型 | **`gemini-4-hydrogen`**（现有映射已正确） |
| 证据来源 | ① 本地 90 条：`field 19 = gemini-4-hydrogen-tiered-high`、`field 21 = "Gemini 4 Hydrogen (High)"` 同行共现，**2/2 会话一致**；② 与 `1525`/`M525`（同样标签 `Gemini 4 Hydrogen (High)`）并存，说明 `tiered-high` 是**另一条通往同一档位的路由**，不是新模型；③ Context Monitor `models.ts` L86 有 `MODEL_PLACEHOLDER_M196` 注释 `Gemini 3.6 Flash (Tiered, catalog-only)`，L76 `MODEL_PLACEHOLDER_M322` 注释 `Gemini 3.8 Flash (Tiered, catalog-only)` —— 证明 `tiered` 在 Antigravity 语义中是「分档路由」而非独立模型 |
| 可信度 | **Confirmed**（基础模型 Hydrogen High；`tiered` = 内部分档路由） |
| 计价条件与限制 | Hydrogen 官方费率 `$1.50 / $7.50 / $0.075`（catalog L136–L141）。**注意**：`tiered` 路由在 Google 侧可能产生不同的实际消耗权重，但**官方 API 没有对应的独立费率**，按 Incept 契约应使用 Hydrogen 标准费率。 |
| 是否建议立即增加映射 | **计价映射已存在且正确，无需新增**；仅补展示归并 |

### 映射总表（建议）

| 原始 slug | 数值 ID | placeholder | 建议 canonicalModel（展示） | 计价 canonicalModel | 可信度 | 立即实施 |
|---|---|---|---|---|---|---|
| `gemini-flash-worker-agy` | 1669 | M669 | `gemini-4-hydrogen`（附 `worker` 档位） | `gemini-4-hydrogen` | Confirmed | 是 |
| `gemini-pro-orchestrator-neon` | 1537 | M537 | `gemini-4-neon`（附 `orchestrator` 档位） | `gemini-4-neon` | Confirmed | 是 |
| `gemini-4-hydrogen-tiered-high` | 1530 | M530 | `gemini-4-hydrogen` | `gemini-4-hydrogen` | Confirmed | 展示层 |
| `gemini-4-argon-trial` | 1418 / 1419 | M418 / M419 | `gemini-4-argon` | `gemini-4-argon`（已存在） | Confirmed | 展示层 |
| `gemini-pro-orchestrator-g1-pro` | 1668 | M668 | 待定 | **不变（未定价）** | Unknown / Probable | **否** |

### 额外发现：`gemini-3.8-flash` 系列存在「一个数值 ID 对四个 slug」

model ID `1318`/`M318` 在本地同时对应 `gemini-3.8-flash-n`（24,406 条）、`gemini-3.8-flash-exp-a`（1,745）、`gemini-3.8-flash-exp-b`（4）、`gemini-3.8-flash`（1,106）。这与 Incept 现有 `DEFAULT_PRICING_ALIASES`（`overrides.ts` L9–L13 把 `-exp-a`/`-n`/`-tiered` 映射到 `gemini-3.8-flash`）方向一致，但**`model-registry.ts` L127–L133 的第 2 步「受保护实验模型」把这三个名字强制保留为独立身份**，与 `DEFAULT_PRICING_ALIASES` 的合并意图相反。

这是**有意的设计选择**（`model-registry.test.ts` L77–L86 有明确断言），目的是避免把不同实验分支合并进正式模型。本地数据显示它们确实共享同一 model ID → **可以考虑合并展示**，但属于本任务四项目标之外，建议列为「需要进一步验证」。

---

## 第四部分：最小改造方案

严格限定在四项目标内，复用现有机制，不改动 Ledger / Sync 协议。

### 变更 1（目标 3 + 4，最高优先）— 补两条计价渠道映射

**文件**：`packages/dashboard/src/sync/usage-billing-channel-mappings.json`

**最小修改方式**：在现有 `rules` 数组中追加两条（仅追加，不改动任何已有条目）：

```
{ "channel": "antigravity", "model": "gemini-flash-worker-agy",
  "action": "map", "canonicalModel": "gemini-4-hydrogen",
  "evidence": "<引用本报告第三部分 M1 的三条证据 + 本地 478 条记录>" }

{ "channel": "antigravity", "model": "gemini-pro-orchestrator-neon",
  "action": "map", "canonicalModel": "gemini-4-neon",
  "evidence": "<引用 M3 的三条证据 + 本地 96 条记录>" }
```

**对已有数据的影响**：无。映射只在 `estimateLedgerUsage`（`billing-usage-estimate.ts` L10–L11）中生效，不触碰原始 Ledger 记录与 `event.modelName`。

**对历史计价结果的影响**：仅这两个模型从 `unpriced` 变为 `estimated`。`billing_ledger_version` 与 `billing_publication` 的 `mappings` 摘要会变化 → 需要一次 Owner 审核 + 重新发布（`maintenance.ts` L277–L280 的 `mappingsHash` 已在流程内）。其他模型金额**逐项不变**（映射是精确 `(channel, model)` 键，无前缀匹配）。

**新增测试**：在 `usage-billing.test.ts` 增加断言：给定 fixture 事件 `(antigravity, gemini-flash-worker-agy, 2026-11-21)`，`estimateLedgerUsage` 返回 `status: 'estimated'` 且金额等于按 Hydrogen 费率手算值。

**风险与回退**：低。回退方式 = 删除这两条规则并重新发布；由于原始 Token 与 `event.modelName` 完全未变，回退后自动回到 `unpriced` 状态，不会产生错误金额。

### 变更 2（目标 4）— 补展示身份归并（保留原始档位）

**文件**：`packages/dashboard/src/domain/model-registry.ts`

**最小修改方式**：在 `CANONICAL_ALIASES` 中增加两条**显式**条目（不引入任何正则或前缀猜测）：

```
'gemini-flash-worker-agy'      → { canonicalModelId: 'gemini-4-hydrogen', displayName: 'Gemini 4 Hydrogen' }
'gemini-pro-orchestrator-neon' → { canonicalModelId: 'gemini-4-neon',     displayName: 'Gemini 4 Neon' }
```

**关键约束**：
- `rawModels` 集合（`accumulate.ts` L303 `modelEntry.rawModels.add(ev.modelName)`）**已经**保留原始 slug，无需改动即可满足「原始档位必须保留」。
- **不要**把它们加入 L127–L133 的「受保护实验模型」分支。
- **不要**改动 `gemini-pro-orchestrator-g1-pro`。

**对已有数据的影响**：排行榜中这两行会合并进 Hydrogen / Neon。Token 总量不变（`accumulate.ts` L168–L181 的 `evTotal` 不依赖模型名）。

**对历史计价结果的影响**：**无**。展示归并与计价映射是两条独立路径（见第一部分 P4）。

**新增测试**：`model-registry.test.ts` 增加用例断言 `resolveModelIdentity('gemini-flash-worker-agy').canonicalModelId === 'gemini-4-hydrogen'`，并在 `summarize` 层断言归并前后 `data.totals.totalTokens` 相等、`model.rawModels` 仍含原始 slug。

**风险与回退**：中低。风险点是「归并错误导致排行榜误导」。缓解：只在 Confirmed 的两条上操作；`g1-pro` 明确排除。

### 变更 3（目标 2，低风险清理）— 删除死变量

**文件**：`packages/dashboard/src/adapters/local/aggregation/summarize.ts` L93

**最小修改方式**：删除 `const isUnpriced = !pricing && m.cost === 0;`。

**影响**：无行为变化（全仓库无引用）。纯粹消除误导。

### 变更 4（目标 1 + 2）— 固化 Token 不变量断言

**文件**：`packages/dashboard/src/__tests__/native-collection.test.ts`

**最小修改方式**：新增一个用例，构造 `field 3 < field 9 + field 10` 的 protobuf 记录，断言：
- `outputTokens + reasoningTokens >= field 3` 时**不重复**计入 `totalTokens`；
- 或在采集层直接拒绝该记录（`common.ts` L27–L28 已有 `Invalid native usage record` 路径）。

**理由**：实测该情形当前为 0 条，但 `metadata.ts` L14–L15 的 `Math.max` 保护只覆盖 `field 3 >= visible + reasoning` 方向。把它固化成测试可在未来 Google 修改字段语义时立即报警。

**风险**：无（仅新增测试）。

### 不做的事（明确排除）

- **不**为 `gemini-pro-orchestrator-g1-pro` 添加映射（证据不足，维持未定价）。
- **不**引入 Token Dashboard 的 `1/6x`、`0.50x` 账务权重（属于订阅配额口径，与「官方 API 等效成本」契约冲突）。
- **不**改动 `resolveModelIdentity` 的第 2 步「受保护实验模型」逻辑（`gemini-3.8-flash-*` 拆分属于另一议题）。
- **不**改动任何 Ledger 表结构、Sync 协议、`billing_members` 字段。
- **不**重估生产费用。

---

## 第五部分：验收方案

全部可在现有 Vitest 体系内执行（`pnpm --filter @dashboard test`）。真实数据验收使用**只读快照**，在隔离副本中进行。

| # | 验收项 | 方法 | 通过标准 |
|---|---|---|---|
| 1 | 原始事件 Token 总量守恒 | 对同一批 fixture DB，比较 `sum(collectAntigravityEvents().events[*].{input,output,reasoning,cacheRead,cacheCreation})` 与直接从 protobuf 解析的 `sum(field 2,3,5,9,10)` | 逐分项完全相等 |
| 2 | 同一请求不重复计数 | 构造 1 条 gen + 1 条 step 镜像（同 `response_id`、同计数），断言 `events.length === 1`；再构造 2 条不同 `response_id`、相同计数，断言 `=== 2` | 前者 1、后者 2（现有用例已覆盖，需保留） |
| 3 | 缓存 Token 与总输入关系 | 断言 `cacheHitRate === cacheRead / (input + cacheCreation + cacheRead)`，且分母为 0 时返回 0 | 精确相等；零分母不产生 NaN |
| 4 | Thinking 与 Output 不重复 | 构造 `field 3 = 100, field 9 = 30, field 10 = 70`，断言 `outputTokens === 70`、`reasoningTokens === 30`、`evTotal` 中输出部分 `=== 100` | 输出部分恰等于 `field 3` |
| 5 | 别名归并前后总量一致 | 对同一事件集分别用「归并前」和「归并后」的 registry 运行 `summarizeUsageEvents`，比较 `data.totals.totalTokens` | 完全相等 |
| 6 | 同规范模型的不同原始名正确分组 | 断言 `models.find(m => m.canonicalModelId === 'gemini-4-hydrogen').rawModels` 同时包含 `gemini-flash-worker-agy`、`gemini-4-hydrogen-tiered-high`、`gemini-4-hydrogen` | 集合包含且 `sessions`/`days` 正确合并 |
| 7 | 未确认模型仍为未知且 Token 不丢失 | 对 `gemini-pro-orchestrator-g1-pro` 断言 `missingPricing === true`、`unpricedModels` 含该名、`unpricedTokens` 计入总 Token | `pricedTokens + unpricedTokens + excludedTokens === totalTokens` |
| 8 | 按事件时间匹配历史费率 | 构造跨 `1796083200000`（Argon 12 月切换点）的两条事件，断言分别命中推介期与标准期费率版本 | `rateVersion` 不同，金额符合各自费率 |
| 9 | 重算成本不改变原始使用量 | 只替换 mappings 文件（加两条规则），断言 `billing_members` 的 `tokens` 列逐行不变，仅 `status`/`amount` 变化 | `tokens` 全等 |
| 10 | Ledger / Billing revision 一致性 | 在隔离副本上发布后调用 `readBillingLedgerVersion`，断言 `live.revision === data.revision && live.ledger === data.ledger`；再人为推进 ledger，断言抛 `BILLING_PUBLICATION_STALE` | 一致时通过；推进后抛错（现有逻辑 `billing-publication.ts` L58） |

**额外建议（本报告新增）**：

| # | 验收项 | 方法 | 通过标准 |
|---|---|---|---|
| 11 | retry 记录不产生独立请求 | 构造 `field 17 → 2` 与主记录同 `response_id` 的 fixture，断言只产生 1 条事件 | 1 条（本地实测 44,922 条 retry 全部为此形态） |
| 12 | 「同名不同 model ID」不被合并 | 构造 `gemini-4-argon-trial` 分别携带 `modelId 1418` 与 `1419` 的记录，断言展示归并、但两个 ID 的费率复用互不影响 | 归并后总量守恒；`namesById` 不跨 ID 串价 |

**真实数据验收流程（只读）**：
1. `sqlite3 <db> ".backup '<隔离副本>.db"` 或文件级复制 **并保留 `-wal`**；
2. 对副本以 `readOnly: true` 运行采集器；
3. 比对「副本采集结果」与「现网 `billing_members` 的 Token 列」；
4. 仅在隔离副本上应用新 mappings 并重算，输出差异报告；
5. **不**回写生产、**不**发布费率。

---

## 结论

### 可以直接修复（有充分证据，影响范围明确）

1. **补 `gemini-flash-worker-agy → gemini-4-hydrogen` 的计价渠道映射。**
   基础模型由本地 478 条记录中 slug 与 IDE 标签 `Gemini 4 Hydrogen (Orchestrator)` 的**同行共现**确认，并由 Context Monitor L122/L265/L901 独立佐证。影响：约 127.19M Token 由未定价转为已估价。

2. **补 `gemini-pro-orchestrator-neon → gemini-4-neon` 的计价渠道映射。**
   由本地 96 条共现 + `MODEL_PLACEHOLDER_M537` + Context Monitor L32–L46 三方确认。影响：约 17.87M Token。

3. **为上述两条补展示身份归并，保留 `rawModels` 中的原始 slug。**
   纯展示层变更，不影响任何金额。

4. **删除 `summarize.ts` L93 的死变量 `isUnpriced`。**
   无行为影响。

5. **补「retry 不产生独立请求」与「同名不同 model ID 不串价」两条回归测试。**
   实测已成立，补测试防回归。

### 需要进一步验证（方案合理但证据不足）

1. **`gemini-pro-orchestrator-g1-pro` 的基础模型。**
   本地证据指向「与 Argon 相关」（IDE 标签同行共现），但数值 ID `1668`/`M668` 与三个参考项目登记的 Argon ID `1681`/`M681` **不符**；`g1-pro` 更可能是 Google AI Pro 订阅档位标识（`TELEMETRY_SPEC.md` L121）。建议先做一次定向探测（读取 IDE 模型选择器与 `GetAvailableModels`，确认 `M668` 的位置），**在此之前维持未定价**。约 34.23M Token 暂时保留在未估价中。

2. **`gemini-3.8-flash` 系列的展示归并。**
   本地确认 `-n`、`-exp-a`、`-exp-b`、`gemini-3.8-flash` 共享 model ID `1318`/`M318`，但 `model-registry.ts` L127–L133 有意保护实验分支。是否合并属于产品判断，非技术障碍。

3. **`tiered` 路由的实际消耗权重。**
   `gemini-4-hydrogen-tiered-high`（`M530`）与 `gemini-4-hydrogen`（`M525`）同为 `High` 档但走不同路由。Google 未公开 `tiered` 的独立 API 费率，按契约应使用标准 Hydrogen 费率；但若 Antigravity 内部按不同权重计费，订阅配额口径会偏离。**不影响 USD API 等效成本，仅影响订阅口径**，建议单独记录而不在本轮处理。

### 建议维持现状（实现正确或改动收益不足）

1. **缓存命中率公式** `cacheRead / (input + cacheCreation + cacheRead)` 维持不变。三分项语义完整、Token 加权、跨通道可复用；Antigravity 通道 cache write 恒为 0 使其等价于 `cacheRead / (input + cacheRead)`。

2. **请求级去重与 `Math.max` 合并** 维持不变。实测 89,844 对 gen/step 镜像逐分项完全相等，误合并为 0。

3. **retry 字段的读取** 维持不变。实测 44,922 条 retry 记录全部与主记录身份重合，零独立请求被误判。

4. **`outputTokens` / `reasoningTokens` 的 `Math.max` 归一** 维持不变。`field 3 === field 9 + field 10` 在 89,969/89,969 条记录上成立，现有保护方向正确。

5. **`gemini-4-argon-trial` 与 `gemini-4-hydrogen-tiered-high` 的计价映射** 维持不变。现有条目已正确，无需重复添加。

6. **Token Dashboard / agy-stats 的账务权重（`1/6x`、`0.50x`）不引入 Incept。** 它们属于订阅配额消耗口径，与「官方 API 等效成本」契约冲突。

7. **费率目录、Ledger 结构、Sync 协议** 维持不变。版本化、区间不重叠、revision/ledger 绑定均已正确实现。

---

## 附录 A：本地实测数据摘要

样本：386 个 SQLite 库 / 89,969 条 usage 记录（`readOnly`，未修改、未外传）

```
=== 按 model ID + slug 聚合（全部分项）===
id 1318 (M318)  rows 54561   names: gemini-3.8-flash-n (24406), gemini-3.8-flash-exp-a (1745),
                                    gemini-3.8-flash (1106), gemini-3.8-flash-exp-b (4),
                                    Gemini 3.8 Flash (High) (31), (none) (27269)
id 1322 (M322)  rows 25031   names: gemini-3.8-flash-tiered (12500), (none) (12531)
id 1525 (M525)  rows  4672   names: gemini-4-hydrogen (2324)         [High]
id 1526 (M526)  rows  1138   names: gemini-4-hydrogen (569)          [Medium]
id 1528 (M528)  rows  2658   names: gemini-4-hydrogen (1317)         [XHigh]
id 1530 (M530)  rows   180   names: gemini-4-hydrogen-tiered-high(90)[High]
id 1537 (M537)  rows   193   names: gemini-pro-orchestrator-neon(96)[Orchestrator (Neon)]
id 1668 (M668)  rows   360   names: gemini-pro-orchestrator-g1-pro(179),
                                    Orchestrator (Argon) (1), (none) (180)
id 1669 (M669)  rows   959   names: gemini-flash-worker-agy (478)     [Gemini 4 Hydrogen (Orchestrator)]
id 1418 (M418)  rows   129   names: gemini-4-argon-trial (64)        [Gemini 4 Argon (Medium)]
id 1419 (M419)  rows     8   names: gemini-4-argon-trial (4)         [Gemini 4 Argon (Low)]
id 1026 (M26)   rows    78   names: claude-opus-4-6-thinking (39)
id 1400 (M400)  rows     2   names: claude-opus-5-5-low (1)          [Claude Opus 5.5 (Low)]
```

```
=== Token 字段不变量（89,969 条）===
field3 === field9 + field10 ......... 89,969 / 89,969  (100.00%)
field3  < field9 + field10 ......... 0
field3  > field9 + field10 ......... 0
field4 (cache creation/write) ...... 恒为 0（全部模型）
无任何身份键的记录 .................. 64（Token 亦为 0）
```

```
=== gen / step 镜像一致性 ===
tokenBearing rows ................. 89,905
gen 身份键 ........................ 89,844
step 身份键 ....................... 89,966
交集 .............................. 89,844
镜像对中总分项相等 ................. 89,844 / 89,844
镜像对中任一分项或 modelId 不等 ..... 0
```

```
=== retry 字段（field 17→2 / field 28→2）===
gen 主记录 ........................ 44,986
gen retry 记录 .................... 46,047
  其中与主记录身份键重合 ........... 44,922
  其中无身份键（Token 为 0） ....... 1,125
  独立（未与主记录重合且有 Token） .. 0
step retry 记录 ................... 188
  其中带 Token ..................... 187
主记录 Token 总量 ................. 5,202,571,136
retry 记录 Token 总量 ............. 5,202,571,136  ← 完全相等
```

```
=== 截图三项的独立复现（gen+step 合计）===
gemini-flash-worker-agy .......... 127.19M / 481  ← 截图 127.19M / 481 ✓
gemini-pro-orchestrator-g1-pro ...  34.23M / 180  ← 截图  34.23M / 180 ✓
gemini-pro-orchestrator-neon .....  17.87M /  97  ← 截图  17.87M /  97  ✓
```

---

## 附录 B：引用位置速查

| 主题 | 文件 | 行号 |
|---|---|---|
| Token 分项映射 | `adapters/local/collectors/antigravity/metadata.ts` | 12–19 |
| output/reasoning 归一 | 同上 | 13–15 |
| retry 字段读取 | 同上 | 23–24 |
| gen 行模型名 | 同上 | 30–35 |
| step 行模型名 | 同上 | 39–42 |
| 模型名归属 | `.../antigravity/events.ts` | 26–27, 32–40, 45–47 |
| 请求级去重 | 同上 | 51–71 |
| 同 ID 费率复用 | `.../collectors/antigravity.ts` | 38–51 |
| 事件构造 / missingPricing | `.../collectors/common.ts` | 22–34 |
| Token 总量相加 | `.../aggregation/accumulate.ts` | 168–181 |
| rawModels 保留 | 同上 | 303 |
| 身份归一 | `domain/model-registry.ts` | 77–182 |
| 受保护实验模型 | 同上 | 127–133 |
| 展示汇总 | `.../aggregation/summarize.ts` | 92–113, 208–221, 240–258 |
| 死变量 | 同上 | 93 |
| 计价别名表 | `.../local/overrides.ts` | 9–13 |
| 临时费率 | `.../local/pricing-temporary.ts` | 11–12 |
| 计价核心 | `domain/usage-billing.ts` | 90–130 |
| 费率发布校验 | `.../local/usage-rate-catalog.ts` | 79, 111 |
| 渠道映射应用 | `sync/billing-usage-estimate.ts` | 10–12 |
| 映射文件 | `sync/usage-billing-channel-mappings.json` | 13–17, 19–23 |
| 账本 revision 绑定 | `sync/billing-ledger-version.ts` | 8–22 |
| 发布陈旧检查 | `.../runtime/billing-publication.ts` | 58 |
| 覆盖率守恒 | `.../runtime/billing-publication.ts` | 29 |
| 未定价原因写入 | `sync/managed-billing.ts` | 192–204 |

| 参考项目 | 文件 | 行号 |
|---|---|---|
| 别名表（orchestrator/worker/neon） | `Antigravity-Context-Window-Monitor/src/models.ts` | 118–141 |
| orchestrator 独立身份 | 同上 | 26–35 |
| 上下文窗口（Neon 511k） | 同上 | 40–50 |
| 展示名 | 同上 | 260–272 |
| executor 绑定 | 同上 | 898–921 |
| 缓存语义注释 | `.../src/telemetry-metrics.ts` | 7–14 |
| effort 合并 | `.../src/model-quota.ts` | 84–99 |
| 模型身份表 | `agy-stats/agy-stats` | 962–1026 |
| 配额权重（非 USD） | 同上 | 200–224 |
| DB 权威 + 去重 | 同上 | 1062–1251 |
| 缓存命中率 | 同上 | 2755, 2801 |
| Protobuf 字段定义 | `antigravity-token-dashboard/docs/TELEMETRY_SPEC.md` | 41–56 |
| 模型身份 / 编号 | `.../antigravity_telemetry/models.json` | 260–343 |
| Carbon/Argon/Executor | `.../config/pricing.json` | 541–578 |
| 账务权重 1/6x、0.50x | `.../docs/milestones/M100_HYDROGEN_AND_ORCHESTRATOR_CARDS.md` | 19–21 |
| g1-pro-tier = 订阅档位 | `.../docs/TELEMETRY_SPEC.md` | 121 |

---

**调研结束。未修改 Incept 任何源码、配置、Ledger、生产数据库或费率目录；三个参考仓库仅存在于 `D:\Desktop\explore\gemini1`，未运行其任何安装或更新脚本。等待下一阶段实施指令。**
