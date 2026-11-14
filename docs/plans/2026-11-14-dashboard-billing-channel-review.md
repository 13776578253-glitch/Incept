# Dashboard 计费对账汇报

2026-11-14 · revision 843 · 隔离历史重放

本文记录渠道规则初次演练。当前计价契约、费率版本与四窗口结果见[官网 API 等效成本契约](./2026-11-14-dashboard-billing-contract.md)。

两轮使用同一份旧覆盖配置。四窗口的成员、Token、旧金额和未知币种笔数逐项一致。新版目录含 32 个费率版本，54,475 条明细全部保留，其中 44,267 条生成 USD 参考估算，6,840 条保留来源金额，3,301 条审查路由排除计价，67 条缓存写缺分项按原口径静默。缺价审阅从 10 组、2,641 笔降为 0 组。全量 USD 参考估算为 1,214.541170199052269158。[费率目录](./dashboard-billing-reference-catalog-2026-11-13.json) · [渠道映射](../../packages/dashboard/src/sync/usage-billing-channel-mappings.json)

## 本次处理

| 渠道与原始键 | 笔数 | 处理口径 |
| --- | ---: | --- |
| ZCode `GLM-5.3` | 41 | 采用智谱官网的按量参考价。每百万 Token 的输入、缓存命中、输出为 CNY 8、2、28，按 2026-11-13 中间价 USD 1 = CNY 6.7152 固定折算，分别为 USD 1.191327138432、0.297831784608、4.169644984513。保留 CNY 原价及汇率证据，固定汇率适用于本轮参考估算。订阅消耗按套餐记录核账。[智谱 API 定价](https://docs.bigmodel.cn/cn/guide/start/pricing) · [中国外汇交易中心历史中间价](https://www.chinamoney.com.cn/chinese/bkccpr/index.html?tab=2) · [ZCode 接入方式](https://zcode.z.ai/cn/docs/configuration) |
| Antigravity `claude-opus-4-6-thinking` | 42 | 计价键映射至 `claude-opus-4-6`。采用 Google Cloud 全球标准参考价，每百万 Token 输入 USD 5、缓存命中 USD 0.50、输出 USD 25。明细保留原始键。[Google Cloud 合作模型价目](https://cloud.google.com/model-garden/partner-models/pricing) |
| Codex `codex-auto-review` / `codex-auto-review-unpriced` | 3,301 | 作为审查路由，保留用量并标记 `CHANNEL_ROUTE_EXCLUDED`，从估算和缺价提醒中排除。 |
| Claude Code `claude-opus-5-5` | 67 | 缓存写入只有总量。明细保留 `RATE_COMPONENT_MISSING`，缺价审阅和窗口缺价 Token 汇总保持静默。 |

## 特殊渠道的官网参考映射

| 渠道 | 原始键 | 笔数 | 采用的参考价 |
| --- | --- | ---: | --- |
| DeepSeek Harness | `workbuddy-ai/deepseek-v4.1-flash` | 939 | DeepSeek Flash 官网峰谷价 |
| DeepSeek Harness | `workbuddy/deepseek-v4.1-flash` | 835 | DeepSeek Flash 官网峰谷价 |
| Codex | `workbuddy/kimi-k3-1` | 512 | Kimi K3 官网标准价 |
| DeepSeek Harness | `deepseek/deepseek-v4.1-flash-fast` | 194 | DeepSeek Flash 官网峰谷价 |
| Codex | `gpt/gpt-6.1-sol` | 102 | GPT-6.1 Sol 官网标准价 |
| Codex | `ccs-deepseek/deepseek-flash` | 45 | DeepSeek Flash 官网峰谷价 |
| Codex | `ccs-codex1-5x/gpt-6.1-sol` | 1 | GPT-6.1 Sol 官网标准价 |
| DeepSeek Harness | `xiaomi/mimo-v2.6-pro` | 5 | 小米 MiMo V2.6 Pro 官网海外实时价 |
| Antigravity | `gemini-3.8-flash-exp-b` | 4 | Gemini 3.8 Flash 官网标准价 |
| Gemini CLI | `gemini-3.1-pro-preview` | 4 | 四笔均使用 Google 的 ≤200K 标准价 |

DeepSeek Flash 共补齐 2,013 笔，逐笔复算得峰时 393 笔、闲时 1,620 笔。每百万 Token 的输入、缓存命中、输出按 USD 0.15、0.003、0.60 闲时计价，峰时分别为 USD 0.30、0.006、1.20。峰时为北京时间周一至周五 09:00–12:00、14:00–18:00，中国法定节假日除外。已识别的各渠道 Flash 键复用同一份费率及峰谷日历。[DeepSeek 官网价目](https://api-docs.deepseek.com/quick_start/pricing/)

按同一分项顺序，Kimi K3 每百万 Token 为 USD 3、0.30、15，GPT-6.1 Sol 为 USD 2、0.10、10，小米 MiMo V2.6 Pro 为 USD 0.435、0.0036、0.87。`workbuddy/kimi-k3-1` 采用本次指定的 Kimi K3 参考价。`ccs-codex1-5x/` 按标准参考价处理。原始渠道及模型键留在每条明细中。[Kimi 官网价目](https://www.kimi.com/resources/kimi-k3-pricing) · [OpenAI 官网价目](https://developers.openai.com/api/docs/models/gpt-6.1-sol) · [小米官网价目](https://mimo.mi.com/models/en-US/mimo-v2.6-pro)

Gemini 3.8 Flash 实验键按 Google 基础键参考价估算。Gemini 3.1 Pro 按请求输入量选档，计入命中缓存的输入。每百万 Token 的输入、缓存命中、输出在 ≤200K 时为 USD 2、0.20、12，超过 200K 时为 USD 4、0.40、18。日期汇总超过阈值时保留未定价，因为缺少请求级分档证据。[Google 官网价目](https://aistudio.google.com/docs/pricing)

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
