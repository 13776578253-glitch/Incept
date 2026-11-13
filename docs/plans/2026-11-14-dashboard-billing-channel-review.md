# Dashboard 计费对账汇报

2026-11-14 · revision 843 · 隔离历史重放

两轮使用同一份旧覆盖配置。四窗口的成员、Token、旧金额和未知币种笔数逐项一致。新版目录含 29 个费率版本，54,475 条明细全部保留，其中 41,626 条生成 USD 参考估算，6,840 条保留来源金额，3,301 条审查路由排除计价，2,708 条仍未定价。67 条缓存写缺分项计入未定价明细，其余 2,641 条进入缺价审阅。全量 USD 参考估算为 1,172.976897301652269158。 [费率目录](./dashboard-billing-reference-catalog-2026-11-13.json) · [渠道映射](../../packages/dashboard/src/sync/usage-billing-channel-mappings.json)

## 本次处理

| 渠道与原始键 | 笔数 | 处理口径 |
| --- | ---: | --- |
| ZCode `GLM-5.3` | 41 | 采用智谱官网的按量参考价。每百万 Token 的输入、缓存命中、输出为 CNY 8、2、28，按 2026-11-13 中间价 USD 1 = CNY 6.7152 固定折算，分别为 USD 1.191327138432、0.297831784608、4.169644984513。保留 CNY 原价及汇率证据，固定汇率适用于本轮参考估算。订阅消耗按套餐记录核账。[智谱 API 定价](https://docs.bigmodel.cn/cn/guide/start/pricing) · [中国外汇交易中心历史中间价](https://www.chinamoney.com.cn/chinese/bkccpr/index.html?tab=2) · [ZCode 接入方式](https://zcode.z.ai/cn/docs/configuration) |
| Antigravity `claude-opus-4-6-thinking` | 42 | 计价键映射至 `claude-opus-4-6`。采用 Google Cloud 全球标准参考价，每百万 Token 输入 USD 5、缓存命中 USD 0.50、输出 USD 25。明细保留原始键。[Google Cloud 合作模型价目](https://cloud.google.com/model-garden/partner-models/pricing) |
| Codex `codex-auto-review` / `codex-auto-review-unpriced` | 3,301 | 作为审查路由，保留用量并标记 `CHANNEL_ROUTE_EXCLUDED`，从估算和缺价提醒中排除。 |
| Claude Code `claude-opus-5-5` | 67 | 缓存写入只有总量。明细保留 `RATE_COMPONENT_MISSING`，缺价审阅和窗口缺价 Token 汇总保持静默。 |

## 仍需核对的渠道和费率条件

| 渠道 | 原始键 | 笔数 | 待核对 |
| --- | --- | ---: | --- |
| DeepSeek Harness | `workbuddy-ai/deepseek-v4.1-flash` | 939 | WorkBuddy AI 的计费路径与计划 |
| DeepSeek Harness | `workbuddy/deepseek-v4.1-flash` | 835 | WorkBuddy 的计费路径与计划 |
| Codex | `workbuddy/kimi-k3-1` | 512 | WorkBuddy 上游模型版本及计费路径 |
| DeepSeek Harness | `deepseek/deepseek-v4.1-flash-fast` | 194 | `-fast` 的实际端点与服务档位 |
| Codex | `gpt/gpt-6.1-sol` | 102 | `gpt/` 的端点及计费归属 |
| Codex | `ccs-deepseek/deepseek-flash` | 45 | `ccs-*` 转接路径及费率 |
| Codex | `ccs-codex1-5x/gpt-6.1-sol` | 1 | `1-5x` 的计量语义及上游费率 |
| DeepSeek Harness | `xiaomi/mimo-v2.6-pro` | 5 | 小米 API 或其他网关的计费路径 |
| Antigravity | `gemini-3.8-flash-exp-b` | 4 | 试验键对应的参考费率 |
| Gemini CLI | `gemini-3.1-pro-preview` | 4 | 按单次请求的输入长度区分标准价和长上下文价。[Google 价目](https://aistudio.google.com/docs/pricing#gemini-3.1-pro-preview) |

## 币种未知的历史来源金额

| 渠道 | 原始键 | 笔数 |
| --- | --- | ---: |
| CommandCode | `deepseek/deepseek-v4.1-flash` | 3,916 |
| Antigravity | `gemini-3.8-flash` | 1,645 |
| CommandCode | `xiaomi/mimo-v2.6-pro` | 734 |
| CommandCode | `deepseek/deepseek-v4.1-flash-fast` | 330 |
| OpenCode | `deepseek-v4-flash-vision-exp` | 116 |
| OpenCode | `deepseek-v4-flash` | 65 |
| OpenCode | `deepseek-flash` | 34 |
| **合计** | | **6,840** |

逐笔保留原金额及空币种。后续币种核对以渠道账单或来源契约为准。当前默认 USD 折算用于有原价及汇率证据的参考费率。
