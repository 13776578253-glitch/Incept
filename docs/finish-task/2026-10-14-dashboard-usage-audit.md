# 仪表盘用量审计：两个必修问题（交 GPT 修改）

审计日期：2026-10-14 · 范围：`packages/dashboard` 的本地用量采集链路 · 结论均已用本机真实数据复算

---

## 0. 背景与数据流（改前必读）

- 用量统计不落库，全部来自本机日志/索引：
  `~/.codex/sessions|archived_sessions/**/*.jsonl`、`~/.aiusage/cache.db`(records 表)、各原生 collector（claude / gemini / antigravity / opencode / zcode / ccusage 兜底）。
- 链路：`collectors/*` → `src/adapters/local/loader.ts`（合并、过滤、归一）→ `src/adapters/local/aggregation/summarize.ts` + `accumulate.ts` → snapshot → `/api/dashboard/usage` → `TrendChart`。
- 日期口径：固定 UTC+8。`dashboardDate(ts) = new Date(ts + 8h).toISOString().slice(0,10)`（`src/domain/window.ts:6`）。
- 每日总量 = 该日所有源、全部事件的五类 token 之和（input(不含缓存) + cacheRead + cacheCreation + output(不含推理) + reasoning）。
- 成本口径：`computeCostFromPricing`（`src/adapters/local/pricing.ts:118-136`）
  `= input×inputPerMillion + (output+reasoning)×outputPerMillion + cacheRead×cacheReadPerMillion + cacheCreation×cacheWritePerMillion`，单位每百万 token。
- 自检命令：`pnpm --filter @incept/dashboard test`、`pnpm --filter @incept/dashboard typecheck`。
- 相关测试：`src/__tests__/local-loader.test.ts`、`native-collection.test.ts`、`usage-calculation.test.ts`。

---

## 问题 1（严重）：Codex 续写/fork 的 rollout 文件首事件把整段会话累计量重复记到当天

### 现象

- 10/14 图表 430.71M，其中 codex `gpt-6.1-sol` 266.9M；正确值约 156M（虚增 138.73M，占当天 32%）。
- 10/08 同型问题虚增 37.84M（当天 codex 从 87M 变 125M）。
- 全历史仅这两处触发开头的"跨文件续写"场景，但一旦触发就是几千万到上亿 token 级别的虚增。

### 证据（本机实际文件）

父文件 `~/.codex/sessions/2026/10/13/rollout-2026-10-13T13-03-55-01a133a5-53d6-7fd3-bc90-043a7a4d2fda.jsonl`

- 786 条 `token_count` 事件，时间 10/13 05:07Z → 10/14 10:43Z
- 末条 `total_token_usage.total_tokens = 138,734,845`；它自己的逐条差分落账 61.00M(10/13) + 77.74M(10/14)，正确

10/14 18:44（+08）该会话被 resume，产生新文件
`~/.codex/sessions/2026/10/14/rollout-2026-10-14T18-44-05-01a133a5-..._01a13a03-207a-7e13-80be-76417a9e0114.jsonl`（`session_meta.payload.id` 仍是 `01a133a5-...`）

- 首条 `token_count` 在 10/14T10:44:17.507Z，携带累计 `total_tokens = 138,972,404`
- 正确增量 = 138,972,404 − 138,734,845 = **237,559（0.24M）**
- 实际被记账 = **138.97M** → 当天虚增 **138.73M**

同样形态：`~/.codex/sessions/2026/10/08/rollout-2026-10-08T20-19-10-01a10acd-...`_`01a11b74-....jsonl`（首事件累计 38.22M，父文件末累计 37.84M）。

### 根因（代码位置）

- `src/adapters/local/collectors/codex.ts:40` —— `previousTotals` 在**文件循环内部**声明，每个文件重新从 undefined 开始。
- `codex.ts:80-84` —— 首事件没有 previousTotals，走 `: total[key]` 分支，把整个会话累计当作一次增量：
  ```ts
  const usage = total ? Object.fromEntries(Object.keys(total).map(key => [key,
    !reset && previousTotals && total[key] >= (previousTotals[key] ?? 0)
      ? total[key] - (previousTotals[key] ?? 0)
      : previousTotals ? Number(last[key as keyof typeof last] ?? total[key]) : total[key],
  ])) : last;
  ```
- `codex.ts:86-89` —— 去重键 `[sessionId, timestamp, total]`，resume 后首事件时间戳是新的，去重抓不到。
- 相关遗留风险：`codex.ts:83` 的 reset 分支 `last[key] ?? total[key]`，若 `last_token_usage` 缺某个 key，会回落成整段累计。

### 修复要求

1. **同一 sessionId 的多个 rollout 文件共享累计水位**：续写文件的首事件应按"首事件累计 − 该会话此前的最大累计"计入；等价做法是按会话维护 watermark，或按文件内嵌时间戳排序后串行差分。
2. **结果必须与文件扫描顺序无关**。注意 `sessionId` 取自 `session_meta`（在文件开头），而 resume 文件名里带有两个 id（原会话 id + 新 rollout id），不能只用文件名当会话键。
3. **不得破坏既有行为**：
   - `sessions/` 与 `archived_sessions/` 中的字节相同副本仍要去重（`local-loader.test.ts:69-83` 用 "父文件 + 归档副本 = 120 而不是 240" 守着这一点）；
   - 真实新会话（累计小于水位）按 reset 处理，走 `last_token_usage`，不能产生负数；
   - compaction 导致的累计回退仍按现有 reset 逻辑处理。
4. 若无法确定续写关系（例如缺失更早文件），保持现状即可，不要凭空扣减。

### 验收

- 复算本机 10/14 codex 总量：294.48M → **约 155.75M**；10/08 减少 37.84M。
- 新增单测（建议放 `src/__tests__/`，复用现有 codex fixture 风格）：父文件末累计 X → fork 文件首事件累计 X+ε，断言只计入 ε，且两次采集结果稳定。

### 复现要点（可写脚本验证）

按会话分组 `~/.codex/{sessions,archived_sessions}/**/rollout-*.jsonl`，比较"每个文件首条 token_count 的 `total_token_usage.total_tokens`"与"同会话其它文件末条累计"，二者近似相等即命中。

---

## 问题 2（严重）：aiusage 索引的 recorded cost 对 codex 双重计费，成本虚高 3~4 倍

### 现象

- 09-26：表格显示 `98.98M ($92.77)`，其中 `gpt-6-sol` 37.95M token → **$83.48**；同日 `gemini-3.8-flash` 45.23M token 只花 $7.92（token 更多、成本更低，比例明显失真）。
- 按项目自己的价目表重算 gpt-6-sol：`7.63M×$2 + 0.19M×$10 + 30.13M×$0.2 = $23.46`，与显示值差 3.6 倍。

### 根因

1. `~/.aiusage/cache.db` 的 `records.input_tokens` 对 codex 是**含 cache** 的口径（与 Codex 原始字段一致）。已逐行验证：仍在磁盘上的 `~/.codex/sessions/2026/10/05/rollout-2026-10-05T14-43-02-01a10acd-....jsonl`，索引行 `in=28141 cache=22272` 与日志中 `input_tokens/cached_input_tokens` 完全一致。
2. 但索引的 `cost` 列仍按 `input(含cache)×input价 + output×output价 + cacheRead×cacheRead价` 计算 → 缓存部分被全价 + 缓存价**收两次**。
3. 采集器只修正了 token、没修正成本：

   `src/adapters/local/collectors/aiusage.ts:99-114`
   ```ts
   // In Codex raw records, input_tokens includes cached_input_tokens
   const uncachedInput = sourceId === 'codex' ? Math.max(0, rawInput - cacheReadTokens) : rawInput;
   ...
   const recordedCost = Number(row.cost ?? 0);
   const cost = recordedCost > 0 ? recordedCost : computeCostFromPricing(pricing, {...}); // ← 索引有 cost 就永远不重算
   ```
   于是"展示的 token"是互斥口径、"展示的成本"是含缓存口径，比例必然对不上。

4. 影响只在**原生 rollout 文件缺失、只剩索引**的日子暴露。文件还在时，`collectors/agents.ts:21-25` 会按 basename 丢弃索引行、改用文件重算（正确），所以 10/14 看不到该问题。09-26 的源文件 `~/.codex/sessions/2026/09/26/rollout-2026-09-26T13-49-59-01a0dc43-....jsonl` 已不存在，全部采信索引。
5. antigravity/gemini 行的 input 本来就是互斥口径，成本正确（09-26 gemini $7.92 = 重算 $7.91），改的时候不要动它们。

### 影响量化（用同一价目表重算索引全历史，同日期窗口 UTC+8）

- 全量：stored **$3140.68** → corrected **$914.55**（3.43x，虚高约 $2226）
- 09-26：$92.23 → $32.50（codex 部分 $83.19 → $23.46）
- 10/06：$66.49 → $9.47（7.02x）｜10/05：$55.15 → $11.82｜06/18：$296.93 → $89.50
- 纯 antigravity 的日子（09-25、09-28、09-30、10/01~10/03）比值 1.00x，未受影响

### 修复要求

1. `sourceId === 'codex'` 的行**不采信** `recordedCost`，一律用互斥 token 走 `computeCostFromPricing` 重算。
2. 该模型取不到价格时的退化策略（二选一并注释说明）：
   - `recordedCost - cacheReadTokens × inputPerMillion / 1e6`（input 单价已知时可直接折算）；
   - 保持原值，但把该行标成 `missingPricing`（现状是 recorded>0 就不标）。
3. 其余源保持"有 recordedCost 用 recordedCost"的现状，避免改动既有数字。

### 验收

- 09-26 当天总成本 ≈ **$32.5**（±1%），gemini/antigravity 行数值不变。
- 新增单测：构造一条 `input_tokens > cache_read_tokens`、cost 为含缓存口径的 codex 索引行，断言事件 cost 等于按互斥 token 重算的值。

### 复现 SQL（`~/.aiusage/cache.db`）

```sql
-- 09-26 全天，按源/模型看"索引存了多少 vs 应该多少"
SELECT tool, model, SUM(input_tokens) i, SUM(cache_read_tokens) cr,
       SUM(output_tokens) o, SUM(thinking_tokens) th, SUM(cost) stored
FROM records
WHERE ts >= 1789660800000 AND ts < 1789747200000   -- 2026-09-26T00:00:00+08:00 起的 24h（ms）
GROUP BY tool, model;
```
再用仍在磁盘的 codex 源文件逐行比对（索引 `input_tokens` 是否等于日志 `input_tokens`，即含 cache）。

---

## 次要问题（可选，建议顺手核实）

1. **索引行无去重**：`aiusage.ts` 直接逐行产出事件，对 `(ts, tool, model, input, cache, output, thinking, cost, session)` 完全相同的重复行不做任何处理。全历史有 42 天存在重复行，例：06-18 有 200 条重复、42.27M token、$109；04-12/04-14/04-15/04-17/04-18/04-28 也有。建议按上述键去重。
2. **reset 分支兜底值可疑**：`codex.ts:83` 的 `last[key] ?? total[key]`，`last_token_usage` 缺 key 时会用整段累计当增量，建议缺 key 时按 0 处理或跳过。
3. **eventId 不含 token**：`codex.ts:113` `hash(['codex', sessionId, timestamp])`，同一毫秒的两条事件会撞同一个 id（本地聚合不去重，导入/导出路径按 eventId 判重）。建议把累计或 token 数纳入 hash。存在该风险的还有导出导数（`adapters/local/imports/exporter.ts` 的冲突检查），改动前先确认。
4. **ccusage 兜底可能按天重复**（待核实）：`collectors/ccusage.ts:50-71` 的 `coveredSessions` 在按天切片循环结束后才合并进结果，若某会话的报告不是"按天切片"而是整段总量，会被按活跃天数重复计入。建议在循环内即登记会话。

---

## 改完自检清单

- [ ] `pnpm --filter @incept/dashboard test`
- [ ] `pnpm --filter @incept/dashboard typecheck`
- [ ] 起 `pnpm dev` 打开 dashboard 30d：09-26 成本 ≈ $32.5、10/14 总量 ≈ 296M（434.63 − 138.73）、10/08 减少 37.84M
- [ ] 确认 `sessions/` + `archived_sessions/` 副本去重用例仍通过（120 而非 240）

## 2026-10-14 整改验收补充

整改及全部实测数字见 [dashboard-usage-remediation](./2026-10-14-dashboard-usage-remediation.md)。原始审查记录保留，以下为执行结果：

- [x] Dashboard全套111项测试及三套类型检查通过。
- [x] Codex跨文件续写重复量已扣除：10/14为138,734,845，10/08为37,841,216；全历史未因交错reset新增计量。
- [x] 本地真实30d页面09/26显示$32.49，Gemini保持$7.92。10/14绝对值因继续使用而增长，验收采用同批日志修复前后差值。
- [x] 归档副本120而非240用例仍通过；同毫秒不同累计事件导出不冲突。
- [x] 完全重复索引去重、reset缺字段安全兜底已修复；ccusage经安装工具实测为每日切片，保留同session多天记录的现有行为。

## 2026-10-15 00:00 独立逐日对账（第三方复核）

方法：临时加一个 dump 测试直接调用真实采集器（`collectCommandCodeEvents` / `collectAiusageAndRawAgentEvents` / `collectCcusageFallback` / `loadTokenDashboardData({range:'all',force:true,home})`），把事件流与 `data.daily` 落盘，再用独立脚本逐日对账；测试文件用完即删。

把本地事件拆成四类后，**2026-09-01 → 10-15 共 45 天，与页面数字 0 处对不上（阈值 0.5M）**，说明聚合层没有额外制造误差：

```
date        native indexed ccusage import     sum     app    diff
2026-09-26    61.0    37.6     0.0    0.4     99.0    99.0    0.00
2026-09-29    69.9     1.8     0.0   25.5     97.2    97.2    0.00
2026-10-02     1.5     0.0     0.0   74.8     76.3    76.3    0.00
2026-10-05    36.0     1.1    20.7    0.0     57.8    57.8    0.00
2026-10-06    28.7     5.0    26.3    0.0     60.0    60.0    0.00
2026-10-08   154.0     0.0     0.0    0.0    154.0   154.0    0.00
2026-10-11   282.8     0.0     0.0    0.0    282.8   282.8    0.00
2026-10-14   328.6     0.0     0.0    0.0    328.6   328.6    0.00
```

### 逐日"偏虚"归因（按影响排序）

1. **跨设备导入占大头**：`~/.incept/dashboard-imports.db` 有一条 2026-10-13 导入的 active 批次（设备 `13776-PC`），**7944 事件 / 942.7M token**，覆盖约 110 天，占全历史 5132M 的 18%。最大几天：10/02 +74.8M、07/14 +55.8M、07/13 +54.0M、07/06 +42.0M、07/05 +38.0M、09/29 +25.5M、09/22 +20.9M、10/04 +18.9M、09/20 +15.7M、10/03 +11.7M、09/24 +10.5M、10/01 +9.8M。数据真实，但建议在图表里单独成系列或加标记，否则"某天突然变高"无法自解释。
2. **只有索引可用的日子**（原始 rollout 已删或已归档成 `.jsonl.zst`）：09/01–09/09、09/26 的 37.6M、09/27 的 8.4M 等，无法用原始文件复核。
3. **ccusage 按天打点**：10/05 的 20.7M、10/06 的 26.3M 统一记在当天 12:00，日粒度正确、时段不可用。
4. 10/11 = 282.8M 全为 native（codex 59.6M + antigravity 223.2M），已由独立复算脚本核对，无虚高。

### 残余问题（建议后续处理）

1. **父文件缺失时的首事件仍记全量累计**：`rollout-2026-10-08T19-12-11-01a11b36-aed8-…jsonl` 首条 token_count 累计 28,617,837，而该轮自身只有 295,127（该会话更早的文件已不在磁盘）。水位找不到前驱文件时仍会整段计入 → 10/08 约有 28.3M 属此情形。若上游曾被计入过即为重复；若上游从未计入（已归档 `.zst`）则是唯一一次兜底。建议明确策略并标注。
2. **索引去重键不含 `source_file`** 且只在单次采集内生效；若同一事件换了 `source_file`（或 `recordedCost` 漂移）仍会重复。
3. **价格缺失时 codex 行仍回退含缓存的 recordedCost**（会虚高，仅打 `missingPricing` 标记），总数未做扣除。
4. **`.jsonl.zst` 归档完全不参与统计**：`codex.ts` 只认 `.jsonl`，Codex 归档过的会话只能靠索引/ccusage 补齐；归档发生在两次采集之间时，同一天的数会发生变化。

### 过程提示

复核期间同一工作区有另一个修改者在改 `codex.ts` / `aiusage.ts`（mtime 23:45、23:53）并跑过测试套件，中途读到的半成品状态一度产出 10/11=2492.93M 的异常值；以 00:00 +08 的完整复核为准。

## 2026-10-15 残余问题整改验收

完整策略与证据见 [usage-residuals](./2026-10-15-dashboard-usage-residuals.md)。

- [x] 报告中缺父文件首事件28,617,837→295,127 Token，前史28,322,710不再记入当前日；会话详情标注历史不完整。
- [x] 索引路径及成本漂移不改变eventId，保留全部路径别名；重复全量采集不累加。没有会话身份的不同文件保持独立。
- [x] Codex缺价记录保留未定价Token，记录费用不再进入汇总；其它来源有效记录费用保留。
- [x] `.jsonl.zst`接入：真实读取5,788事件，普通转压缩日期/Token/费用/身份一致，双副本及跨文件水位回归通过。
- [x] Dashboard 120项测试、三套类型检查通过；本地真实10/08总量108.24M，历史不完整标注已在浏览器确认。
