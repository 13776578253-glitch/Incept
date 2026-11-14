# Dashboard 官网 API 等效成本契约

适用于 Dashboard 的主要费用、费用汇总、费率目录和渠道映射。自 2026-11-14 起生效。

1. **统一 USD 参考成本。** Dashboard 主要费用按模型提供方的官方 API Token 费率估算。优先采用官方 USD 刊例。仅采用 CNY 刊例时，随费率版本记录官方原价、汇率来源、汇率日期及换算值，发布后固定。订阅、账户折扣、第三方实付与按次工具费用保留各自的来源口径。
2. **按规范模型选费率。** 渠道和原始模型键用于识别来源，特殊前缀经显式规则映射至规范模型。费率只按规范模型和事件发生时间选取，同模型同条件跨渠道共用。每条明细保留原始来源、原始模型、规范模型及实际使用的费率版本。别名对应关系放在映射文件中维护。
3. **历史原额只用于审计。** 保留历史 `recordedCost` 原额，未知币种保留为空。费用总额只汇总 USD 估算。同一条用量有足够计量证据时照常估算，币种查证从发布前置条件中移除。
4. **保留未估算的 Token 和原因。** 规范模型、适用费率、计量分项或时段无法确定时，留存原因和用量，费用留空。窗口显示已估算 Token、未估算 Token 与计价范围外 Token。覆盖率 = 已估算 Token ÷（已估算 Token + 未估算 Token）。分母为零时显示空值。内部审核路由仍计入总用量，列入计价范围外 Token。Claude Opus 5.5 缓存写入缺少 5 分钟和 1 小时拆分的记录保留 `RATE_COMPONENT_MISSING`，计入未估算 Token，静默处理。
5. **费率版本及重估必须可复核。** 目录每项记录官网证据、适用区间、计费分项和适用的长上下文或时段条件。同一规范模型的区间不得重叠。官价或汇率更新时显式发布新版本，并用新 `--run` 执行重估。复用批次名要求账本、目录、映射和基线均相同。旧批次明细及金额保持可审计。Owner 发布件绑定账本版本、费率目录和审核证据。

## 文件与维护入口

- [USD 费率目录](./dashboard-billing-reference-catalog-2026-11-13.json)由 `publish-usage-rates` 显式发布。DeepSeek V4 Flash 保留 8 月旧版每天的 UTC 峰谷时段，9 月 10 日 04:00 UTC 起采用 V4.1 Flash 版本。V4.1 Flash 在北京时间周一至周五 09:00–12:00、14:00–18:00 收峰时价，周末和配置中的节假日全天用闲时价。目录保存每周规则和节假日日期范围，适用期截至北京时间 2027 年底。小米 MiMo V2.6 Pro 的官网仅给出发布日，本目录将 2026-09-22 按北京时间日期生效。[DeepSeek 旧版费率](https://api-docs.deepseek.com/img/v4_260813_price_en.png) · [V4.1 Flash 变更](https://api-docs.deepseek.com/news/news260910/) · [DeepSeek 现行价目](https://api-docs.deepseek.com/quick_start/pricing/) · [2027 放假安排](https://english.www.gov.cn/policies/latestreleases/202611/06/content_WS6aed74dcc6d00ca5f9a0e22e.html) · [小米模型更新](https://mimo.mi.com/docs/en-US/updates/model)
- [渠道映射表](../../packages/dashboard/src/sync/usage-billing-channel-mappings.json)记录 `(channel, model)` 的精确匹配、规范模型和证据。原始键已是规范模型时可直接选价。新增有前缀的模型时补显式映射，保留原始键用于对账。
- [发布与撤回步骤](./2026-11-13-dashboard-sync-billing-refactor.md#owner-灰度读取)描述同期四窗口对账与 Owner 开关。旧 Dashboard 的 `baselineCost` 供迁移验收使用。新版 Owner 界面仅展示 USD 估算与覆盖率。

## Revision 843 历史重放

隔离副本批次 `phase0b-843-canonical-usd-legacy-rates-2026-11-14` 使用 27 个费率版本和 27 条映射或策略规则。目录重复发布新增 0 项。旧覆盖配置下四窗口 Token 和 `baselineCost` 与上次历史重放逐项一致，原旁路库的 7 个已有批次保留相同的输入标识和结果。

| 窗口 | 总 Token | USD 参考成本 | 估算覆盖率 |
|---|---:|---:|---:|
| 7 天 | 630,542,569 | 33.71 | 100.00% |
| 14 天 | 4,704,773,136 | 460.24 | 100.00% |
| 30 天 | 6,553,577,086 | 785.26 | 99.80% |
| 全量 | 9,166,166,372 | 1,377.43 | 99.86% |

54,475 条明细中，51,107 条完成估算，3,301 条内部审核路由在计价范围外。其余 67 条是已知的 Opus 5.5 缓存写入分项问题，共 12,678,053 Token。6,840 条历史原额逐笔核对一致，关联用量均按官网费率重新估算。Revision 843 继续用作历史重放。灰度放行以目标环境同版本的四窗口结果及待发布目录审核为准。

Revision 846 的 v1 导入与 v2 回滚组合副本另跑了同口径重估。62,419 条明细包含 7,944 条可见 v1 成员，58,945 条完成估算，3,407 条内部审核路由在计价范围外，仍有相同的 67 条缓存写入分项缺失。新增 GPT-5.2-Codex 和 GPT-5.3-Codex 的 USD 费率版本覆盖了组合副本的 1,256 条旧用量，生效与停止日期按官网公布日期的 UTC 日界限登记。[GPT-5.2-Codex 价目](https://developers.openai.com/api/docs/models/gpt-5.2-codex) · [GPT-5.3-Codex 价目](https://developers.openai.com/api/docs/models/gpt-5.3-codex) · [API 变更日志](https://developers.openai.com/api/docs/changelog) · [退役时间表](https://developers.openai.com/api/docs/deprecations)

## 目标环境四窗口验收

2026-11-14 对生产 release `4666731` 的活动 v4 账本做只读采集。SQLite 一致副本和四个已发布窗口均为 revision 3265，四窗口共用截止时点 `2026-11-14T05:49:59.952Z`。基线使用现网覆盖配置及当前旧读取代码解析出的 26 个接收端价格键和 3 个别名。四窗口的 Token 和旧口径金额逐项精确相等。

| 窗口 | 总 Token | 现网旧口径金额 | 官网 API 等效成本（USD） | 估算覆盖率 |
|---|---:|---:|---:|---:|
| 7 天 | 1,755,761,265 | 151.5467466329999 | 224.36 | 100.00% |
| 14 天 | 3,648,479,614 | 313.64474746300056 | 416.78 | 100.00% |
| 30 天 | 10,428,157,643 | 942.4908630039923 | 1,067.56 | 100.00% |
| 全量 | 14,889,550,879 | 1,803.513759448228 | 1,984.76 | 99.91% |

重估批次 `target-3265-reviewed-usd` 使用 29 个费率版本和 30 条渠道映射或策略。将 69 条 `gemini-4-argon-trial`、1 条 `claude-opus-5-5-low` 和 1 条 `deepseek/deepseek-v4.1-flash-ultrafast` 分别映射到对应规范模型。Argon 使用 11 月 30 日前的官网首发价和 12 月 1 日起的标准价，以 UTC 日期为边界。全量 84,677 条明细中 80,601 条完成估算，4,009 条审查路由列在计价范围外，67 条已知 Opus 5.5 缓存写入缺拆分，待审缺价分组为 0。12,553 条来源原额仅供审计。该副本中 GPT-5.6 Sol 和 Terra 在 UTC 7 月 30 日、8 月 21 日及相邻两侧日期均无可见调用。[Google Argon 发布与定价](https://cloud.google.com/blog/products/ai-machine-learning/gemini-4-argon-available-on-google-cloud) · [Antigravity 模型访问](https://antigravity.google/docs/models) · [Anthropic Effort](https://platform.claude.com/docs/en/build-with-claude/effort) · [DeepSeek Flash 价目](https://api-docs.deepseek.com/quick_start/pricing/)

已在隔离容器中加载审核件和账本副本，使用独立 PostgreSQL 的测试 Owner 会话验证开关关闭返回 404、开启时访客返回 403、Owner 的四个窗口均返回 200，以及账本推进后返回 503。线上复查时已到 revision 3268。受控试读开始时重新采集并审核同版本发布件。

GPT-5.6 Sol 的促销价从 2026-08-21 生效，GPT-5.6 Terra 的降价从 2026-07-30 生效。目录以官网公布日期的 UTC 零点衔接两个费率版本。Revision 3265 重放的四窗口金额和覆盖计数保持一致。[OpenAI API 变更日志](https://developers.openai.com/api/docs/changelog?mw_entry=2026-08-20-974ac0734e053853) · [Terra 降价公告](https://openai.com/index/advancing-the-price-performance-frontier-with-gpt-5-6/)
