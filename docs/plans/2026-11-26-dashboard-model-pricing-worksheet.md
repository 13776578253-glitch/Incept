# Dashboard 全量模型计价与映射待办清单（供 Owner 填报）

2026-11-26，UTC+8。数据口径基于第一批冷基线演练后的全量 V4 台账（revision `4487`，共 **104,704 条**、**18,350,450,969 Tokens**），对照当前审批费率目录 [dashboard-billing-reference-catalog-2026-11-13.json](dashboard-billing-reference-catalog-2026-11-13.json)（22 个标准模型 / 31 条分时段版本）与渠道映射表 [usage-billing-channel-mappings.json](../../packages/dashboard/src/sync/usage-billing-channel-mappings.json)（34 条规则）。

> **使用方式**：你只需要填写 **第一节（未定价模型待办表）** 的「你的处理决定」列（并在需要新增标准价的模型下补充每百万 Token 的 USD 单价与依据），如果对第二节（排除项）或第三节（已有单价/映射）有调整，直接批注即可。完成后把这份文档交回给我，我来统一更新目录、映射表、单测并重跑 Managed Billing。

---

## 一、待处理的未定价模型（共 10 项，220,642,399 Tokens）

按未计价 Tokens 从高到低排列。填完第 1–9 项即可把可见缺价清零（覆盖率推至 **99.93%**，仅剩第 10 项静默缺分项；若第 10 项也补齐缓存写入策略，覆盖率可达 **100%**）。

### 1.1 可见缺价项（9 项，全部来自 `antigravity`，共 207,964,346 Tokens）

| # | 渠道 | 原始模型名 | 记录数 | 未计价 Tokens | 出现日期 | 现状与建议参考 | 你的处理决定（填 `映射 -> 目标模型` / `新增单价` / `排除`） |
| ---: | --- | --- | ---: | ---: | --- | --- | --- |
| 1 | `antigravity` | `gemini-flash-worker-agy` | 481 | 127,185,164 | 11-15 ~ 11-21 | 内部 Worker 别名，需确认对应标准模型（如 `gemini-3.8-flash` / `gemini-4-hydrogen` / 独立定价） | |
| 2 | `antigravity` | `gemini-pro-orchestrator-g1-pro` | 180 | 34,231,662 | 11-14 ~ 11-21 | 内部 Orchestrator 别名，需确认对应标准模型 | |
| 3 | `antigravity` | `gemini-pro-orchestrator-neon` | 98 | 18,325,475 | 11-19 ~ 11-22 | 内部 Orchestrator 别名，疑似对应 `gemini-4-neon`（已有单价 \$3 / \$15 / \$0.15） | |
| 4 | `antigravity` | `gemini-4-carbon` | 39 | 9,234,053 | 11-25 | 新模型，目录无基础价；需提供官方单价（Input / Output / CacheRead / Reasoning）及生效日期 | |
| 5 | `antigravity` | `claude-sonnet-5-5-medium` | 17 | 8,074,719 | 11-22 | 目录缺 `claude-sonnet-5-5` 基础价；补基础价后可将 `-low` / `-medium` / `-high` 统一映射 | |
| 6 | `antigravity` | `claude-sonnet-5-5-high` | 22 | 8,054,225 | 11-25 | 同 #5，映射到 `claude-sonnet-5-5` | |
| 7 | `antigravity` | `claude-opus-5-5-high` | 4 | 1,588,707 | 11-25 | **目录已有 `claude-opus-5-5`（\$4 / \$20 / \$0.2）**，且 `-low` 已映射；建议直接映射 `-high`（顺手补 `-medium`）到 `claude-opus-5-5` | |
| 8 | `antigravity` | `claude-sonnet-5-5-low` | 14 | 1,209,639 | 11-25 | 同 #5，映射到 `claude-sonnet-5-5` | |
| 9 | `antigravity` | `gpt-oss-120b-medium` | 3 | 60,702 | 11-23 ~ 11-25 | 开源权重模型，目录无基础价；可选新增参考单价或按政策 `exclude` | |

### 1.2 静默缺分项（1 项，12,678,053 Tokens）

| # | 渠道 | 原始模型名 | 记录数 | 未计价 Tokens | 出现日期 | 当前规则与原因 | 你的处理决定（维持静默 / 补充缓存写入单价） |
| ---: | --- | --- | ---: | ---: | --- | --- | --- |
| 10 | `claudeCode` | `claude-opus-5-5` | 67 | 12,678,053 | 10-05 ~ 10-13 | `RATE_COMPONENT_MISSING`（当前规则 `silence-missing-cache-write`）：历史记录含 1,386,769 个缓存写入 Tokens，但未区分 5 分钟与 1 小时缓存档位 | |

### 1.3 新增标准模型单价填写区（如 #4 `gemini-4-carbon`、#5/#6/#8 `claude-sonnet-5-5`、#9 `gpt-oss-120b` 等）

> 每百万 Token 单位为 USD。若有长上下文阶梯（如 >200K / >272K）或生效起始日期，请一并填在备注列。

| 标准模型名 (`model`) | Provider | Input (/1M) | Output (/1M) | CacheRead (/1M) | CacheWrite (/1M) | Reasoning (/1M) | 生效起日 (UTC) | 官方依据 / 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `gemini-4-carbon` | Google | | | | | | | |
| `claude-sonnet-5-5` | Anthropic | | | | | | | |
| `gpt-oss-120b` | OpenAI / OSS | | | | | | | |
| *(如需新增其他模型，直接续行)* | | | | | | | | |

---

## 二、当前政策排除模型（2 项，406,610,252 Tokens）

这两项已在 [usage-billing-channel-mappings.json](../../packages/dashboard/src/sync/usage-billing-channel-mappings.json) 显式标记为 `action: "exclude"`（保留 Token 用量，不计入费用和缺价率）：

| 渠道 | 原始模型名 | 记录数 | Tokens | 出现日期 | 当前理由 |
| --- | --- | ---: | ---: | --- | --- |
| `codex` | `codex-auto-review-unpriced` | 2,638 | 239,427,431 | 10-18 ~ 11-26 | Codex 内部自动审批路由历史占位 |
| `codex` | `codex-auto-review` | 2,003 | 167,182,821 | 06-26 ~ 10-18 | Codex 内部自动审批路由 |

---

## 三、全部已定价模型清单（按当前实测用量汇总）

共 **17,723,198,318 已估价 Tokens**，合计 **\$3,293.22**。

### 3.1 实际命中的 `(渠道, 原始模型名) -> 标准计价模型` 明细（按 Tokens 降序）

| 渠道 | 原始模型名 | 命中方式 | 标准计价模型 | 记录数 | 已估价 Tokens | 估价金额 (USD) | 出现日期 |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| `commandcode` | `deepseek/deepseek-v4.1-flash` | 显式映射 | `deepseek-flash` | 9,561 | 3,313,069,162 | \$38.9907 | 09-10 ~ 11-22 |
| `antigravity` | `gemini-3.8-flash-n` | 显式映射 | `gemini-3.8-flash` | 24,523 | 2,987,996,520 | \$378.6758 | 10-06 ~ 11-13 |
| `codex` | `gpt-6.1-sol` | 原名直命 | `gpt-6.1-sol` | 13,914 | 2,981,385,227 | \$778.6346 | 10-01 ~ 11-18 |
| `antigravity` | `gemini-3.8-flash-tiered` | 显式映射 | `gemini-3.8-flash` | 13,173 | 1,137,723,805 | \$151.0807 | 09-28 ~ 11-15 |
| `antigravity` | `gemini-4-hydrogen` | 原名直命 | `gemini-4-hydrogen` | 5,954 | 1,053,953,504 | \$277.7164 | 11-13 ~ 11-26 |
| `commandcode` | `deepseek/deepseek-v4.1-flash-fast` | 显式映射 | `deepseek-flash` | 2,317 | 885,409,701 | \$7.6107 | 09-29 ~ 11-19 |
| `deepseekHarness` | `deepseek-flash` | 原名直命 | `deepseek-flash` | 2,250 | 667,778,642 | \$4.1933 | 09-29 ~ 10-18 |
| `deepseekHarness` | `deepseek/deepseek-v4.1-flash` | 显式映射 | `deepseek-flash` | 2,570 | 554,295,873 | \$5.1249 | 09-23 ~ 11-10 |
| `codex` | `gpt-5.4` | 原名直命 | `gpt-5.4` | 4,045 | 448,298,396 | \$356.8677 | 03-19 ~ 07-10 |
| `codex` | `gpt-6.2-sol` | 原名直命 | `gpt-6.2-sol` | 1,951 | 441,592,602 | \$64.1645 | 11-18 ~ 11-26 |
| `deepseekHarness` | `workbuddy/deepseek-v4.1-flash` | 显式映射 | `deepseek-flash` | 835 | 434,786,858 | \$1.8989 | 10-18 ~ 10-20 |
| `deepseekHarness` | `workbuddy-ai/deepseek-v4.1-flash` | 显式映射 | `deepseek-flash` | 939 | 335,556,563 | \$2.2663 | 10-18 ~ 10-21 |
| `antigravity` | `gemini-3.8-flash` | 原名直命 | `gemini-3.8-flash` | 2,754 | 332,892,112 | \$69.7854 | 09-24 ~ 10-06 |
| `codex` | `gpt-6.1-terra` | 原名直命 | `gpt-6.1-terra` | 1,032 | 284,974,640 | \$36.5967 | 10-28 ~ 11-26 |
| `codex` | `gpt-5.6-terra` *(含调价前后两版)* | 原名直命 | `gpt-5.6-terra` | 2,005 | 263,218,586 | \$175.8015 | 07-19 ~ 09-23 |
| `commandcode` | `xiaomi/mimo-v2.6-pro` | 显式映射 | `mimo-v2.6-pro` | 734 | 260,418,110 | \$5.2793 | 09-22 ~ 09-27 |
| `codex` | `gpt-5.5` | 原名直命 | `gpt-5.5` | 2,291 | 259,460,672 | \$343.5157 | 05-25 ~ 07-19 |
| `antigravity` | `gemini-3.8-flash-exp-a` | 显式映射 | `gemini-3.8-flash` | 1,774 | 223,870,281 | \$43.0249 | 10-10 ~ 10-13 |
| `antigravity` | `gemini-4-neon` | 原名直命 | `gemini-4-neon` | 892 | 203,828,673 | \$109.7644 | 11-21 ~ 11-26 |
| `codex` | `gpt-5.6-sol` *(含原价/促销两版)* | 原名直命 | `gpt-5.6-sol` | 1,471 | 180,957,593 | \$190.2782 | 07-10 ~ 10-23 |
| `codex` | `gpt-5.3-codex` | 原名直命 | `gpt-5.3-codex` | 885 | 97,154,230 | \$83.6914 | 03-02 ~ 03-23 |
| `codex` | `workbuddy/kimi-k3-1` | 显式映射 | `kimi-k3` | 512 | 67,398,802 | \$29.4025 | 10-19 ~ 10-20 |
| `deepseekHarness` | `deepseek/deepseek-v4.1-flash-fast` | 显式映射 | `deepseek-flash` | 194 | 60,455,271 | \$0.3884 | 09-29 ~ 10-27 |
| `codex` | `gpt-6-sol` | 原名直命 | `gpt-6-sol` | 455 | 49,232,344 | \$30.7828 | 09-23 ~ 09-29 |
| `codex` | `gpt/gpt-6.1-sol` | 显式映射 | `gpt-6.1-sol` | 411 | 48,500,672 | \$16.9608 | 10-20 |
| `codex` | `gpt-5.2-codex` | 原名直命 | `gpt-5.2-codex` | 371 | 35,758,537 | \$9.6305 | 03-10 ~ 03-18 |
| `antigravity` | `gemini-4-hydrogen-tiered-high` | 显式映射 | `gemini-4-hydrogen` | 520 | 33,834,724 | \$14.4707 | 11-18 ~ 11-26 |
| `antigravity` | `gemini-4-argon-trial` | 显式映射 | `gemini-4-argon` | 155 | 24,421,412 | \$11.9336 | 11-13 ~ 11-23 |
| `codex` | `gpt-6-astra` | 原名直命 | `gpt-6-astra` | 117 | 13,583,015 | \$42.8976 | 09-05 ~ 09-27 |
| `codex` | `ccs-deepseek/deepseek-flash` | 显式映射 | `deepseek-flash` | 45 | 8,744,550 | \$0.0900 | 10-17 ~ 10-18 |
| `codex` | `gpt-6-luna` | 原名直命 | `gpt-6-luna` | 87 | 7,991,140 | \$0.1740 | 10-06 ~ 10-19 |
| `zcode` | `GLM-5.3` | 显式映射 | `glm-5.3` | 41 | 6,119,660 | \$4.7284 | 09-28 ~ 10-23 |
| `opencode` | `deepseek-v4-flash-vision-exp` *(含两版)* | 显式映射 | `deepseek-flash` | 116 | 4,846,924 | \$0.1665 | 09-08 ~ 09-21 |
| `antigravity` | `claude-opus-4-6-thinking` | 显式映射 | `claude-opus-4-6` | 42 | 3,696,660 | \$5.5617 | 09-28 ~ 09-29 |
| `opencode` | `deepseek-flash` | 原名直命 | `deepseek-flash` | 34 | 3,306,490 | \$0.0958 | 09-23 |
| `codex` | `gpt-5.6-luna` | 原名直命 | `gpt-5.6-luna` | 82 | 2,994,322 | \$0.2590 | 09-04 ~ 10-23 |
| `opencode` | `deepseek-v4-flash` | 显式映射 | `deepseek-flash` | 65 | 2,487,904 | \$0.1225 | 09-20 ~ 09-22 |
| `antigravity` | `gemini-3.8-flash-exp-b` | 显式映射 | `gemini-3.8-flash` | 4 | 861,412 | \$0.2363 | 09-25 |
| `deepseekHarness` | `xiaomi/mimo-v2.6-pro` | 显式映射 | `mimo-v2.6-pro` | 5 | 103,583 | \$0.0103 | 09-23 |
| `deepseekHarness` | `deepseek/deepseek-v4.1-flash-ultrafast` | 显式映射 | `deepseek-flash` | 1 | 57,971 | \$0.0086 | 11-08 |
| `codex` | `ccs-codex1-5x/gpt-6.1-sol` | 显式映射 | `gpt-6.1-sol` | 1 | 57,493 | \$0.1094 | 10-17 |
| `geminiCli` | `gemini-3.1-pro-preview` | 原名直命 | `gemini-3.1-pro-preview` | 4 | 43,584 | \$0.1115 | 03-19 |
| `antigravity` | `claude-opus-5-5-low` | 显式映射 | `claude-opus-5-5` | 1 | 30,776 | \$0.0919 | 11-13 |
| `deepseekHarness` | `deepseek-v4-flash` | 显式映射 | `deepseek-flash` | 3 | 25,804 | \$0.0034 | 09-23 |
| `geminiCli` | `gemini-3-flash-preview` | 原名直命 | `gemini-3-flash-preview` | 2 | 23,518 | \$0.0154 | 03-19 |

> **说明**：[usage-billing-channel-mappings.json](../../packages/dashboard/src/sync/usage-billing-channel-mappings.json) 中另有 6 条已预配的预防性规则在当前库中暂无命中（`antigravity` 的 `gemini-4-neon-low`/`-medium`/`-high`，以及 `deepseekHarness` 的无前缀 `deepseek-v4.1-flash`/`-fast`/`deepseek-v4-flash-vision-exp`），建议继续保留。

---

## 四、当前审批费率目录总览（供核对与防过期）

来自 [dashboard-billing-reference-catalog-2026-11-13.json](dashboard-billing-reference-catalog-2026-11-13.json)（USD / 1M Tokens，Reasoning 默认同 Output）：

| 标准模型名 | Provider | 生效区间 (UTC) | Input | Output | CacheRead | 特殊规则 / 注意事项 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `claude-opus-4-6` | Anthropic | 2026-02-06 起 | 5 | 25 | 0.5 | 无 CacheWrite 单价 |
| `claude-opus-5-5` | Anthropic | 2026-09-23 起 | 4 | 20 | 0.2 | 无 CacheWrite 单价（需 5m/1h 分档） |
| `deepseek-flash` | DeepSeek | 2026-08-16 ~ 09-10 | 0.22 | 0.66 | 0.007 | 每日 UTC 高峰 2x |
| `deepseek-flash` | DeepSeek | 2026-09-10 ~ 2026-12-31 | 0.15 | 0.6 | 0.003 | CN 工作日高峰 2x（含 2026 节假日） |
| `deepseek-flash` | DeepSeek | 2027-01-01 ~ 2027-12-31 | 0.15 | 0.6 | 0.003 | CN 工作日高峰 2x（含 2027 节假日） |
| `gemini-3-flash-preview` | Google | 2025-12-18 起 | 0.5 | 3 | 0.05 | — |
| `gemini-3.1-pro-preview` | Google | 2026-02-20 起 | 2 | 12 | 0.2 | >200K 输入阶梯：4 / 18 / 0.4 |
| `gemini-3.8-flash` | Google | 2026-09-02 ~ 2026-12-31 | 0.75 | 3.75 | 0.075 | — |
| `gemini-3.8-flash` | Google | 2027-01-01 起 | 1.5 | 7.5 | 0.15 | — |
| `gemini-4-argon` | Google | 2026-10-13 ~ 2026-11-30 | 2 | 10 | 0.1 | 首发促销价 |
| `gemini-4-argon` | Google | 2026-12-01 起 | 4 | 20 | 0.2 | 恢复标准价 |
| `gemini-4-hydrogen` | Google | 2026-11-13 起 | 1.5 | 7.5 | 0.075 | — |
| `gemini-4-neon` | Google | 2026-11-19 起 | 3 | 15 | 0.15 | — |
| `glm-5.3` | Zhipu | 2026-09-01 起 | 1.1913 | 4.1696 | 0.2978 | CNY 8/28/2 按 6.7152 折算 |
| `gpt-5.2-codex` | OpenAI | 2026-01-14 ~ 2026-07-23 | 1.75 | 14 | 0.175 | 已退役 |
| `gpt-5.3-codex` | OpenAI | 2026-02-24 ~ 2027-04-01 | 1.75 | 14 | 0.175 | — |
| `gpt-5.4` | OpenAI | 2026-03-06 起 | 2.5 | 15 | 0.25 | >272K 阶梯：5 / 22.5 / 0.5 |
| `gpt-5.5` | OpenAI | 2026-04-24 起 | 5 | 30 | 0.5 | >272K 阶梯：10 / 45 / 1 |
| `gpt-5.6-luna` | OpenAI | 2026-07-31 起 | 0.2 | 1.2 | 0.02 | >272K 阶梯：0.4 / 1.8 / 0.04 |
| `gpt-5.6-sol` | OpenAI | 2026-07-10 ~ 2026-08-21 | 5 | 30 | 0.5 | >272K 阶梯：10 / 45 / 1 |
| `gpt-5.6-sol` | OpenAI | 2026-08-21 ~ **2026-11-30** | 4 | 20 | 0.4 | **注意**：促销价 12 月 1 日到期，目录暂无 12 月后续接版本（可顺手确认是否恢复 \$5 / \$30 / \$0.5） |
| `gpt-5.6-terra` | OpenAI | 2026-07-10 ~ 2026-07-29 | 2.5 | 15 | 0.25 | >272K 阶梯：5 / 22.5 / 0.5 |
| `gpt-5.6-terra` | OpenAI | 2026-07-30 起 | 2 | 12 | 0.2 | >272K 阶梯：4 / 18 / 0.4 |
| `gpt-6-astra` | OpenAI | 2026-09-04 起 | 10 | 50 | 1 | >272K 阶梯：20 / 75 / 2 |
| `gpt-6-luna` | OpenAI | 2026-09-23 起 | 0.1 | 0.5 | 0.01 | >272K 阶梯：0.2 / 0.75 / 0.02 |
| `gpt-6-sol` | OpenAI | 2026-09-23 起 | 2 | 10 | 0.2 | >272K 阶梯：4 / 15 / 0.4 |
| `gpt-6.1-sol` | OpenAI | 2026-09-30 起 | 2 | 10 | 0.1 | >272K 阶梯：4 / 15 / 0.2 |
| `gpt-6.1-terra` | OpenAI | 2026-10-27 起 | 1 | 5 | 0.05 | >272K 阶梯：2 / 7.5 / 0.1 |
| `gpt-6.2-sol` | OpenAI | 2026-11-02 起 | 2 | 10 | 0.1 | 当前无 >272K 阶梯配置 |
| `kimi-k3` | Moonshot AI | 2026-07-23 起 | 3 | 15 | 0.3 | — |
| `mimo-v2.6-pro` | Xiaomi | 2026-09-21 起 | 0.435 | 0.87 | 0.0036 | — |
