# 采集器能力审计

基线 `aefdab427ef90bf53f4f83c3713994735b582488`。本页中“已采集”指解析器将值放入 `RawUsageEvent`，实际覆盖由原始记录、读取成功与后续同步范围共同决定。以下源码链接均相对于仓库根目录，行号对应上述 revision。真实样本只输出字段名与计数。

## 统一事件与选择

`RawUsageEvent` 保存源、会话、项目、模型、时间、五种 token 计数、费用、可选事件 ID、设备和导入批次。`usageInterval` 可描述累积差分的前一锚点，`timestampPrecision` 可标记 `day`。原始请求 ID、provider/channel、请求开始结束、finish reason、错误、重试、父子 Agent、tool call、effort 没有统一字段。缺省 token 经 `usageEvent` 补零，不能据此推断来源实际提供零值。证据 [types.ts:24](../../../packages/dashboard/src/adapters/local/types.ts#L24)、[common.ts:19](../../../packages/dashboard/src/adapters/local/collectors/common.ts#L19)。

`collectAiusageAndRawAgentEvents` 按被原生采集覆盖的 session/file 排除索引事件，再由 loader 针对未覆盖部分尝试 ccusage，失败时保留 indexed 记录。CommandCode 单独采集，导入层再做匹配。ccusage 用新加坡时区按日、会话、模型查询，时间写为当地中午并标为 `day`，部分查询不能替换历史。证据 [agents.ts:13](../../../packages/dashboard/src/adapters/local/collectors/agents.ts#L13)、[loader.ts:64](../../../packages/dashboard/src/adapters/local/loader.ts#L64)、[ccusage.ts:15](../../../packages/dashboard/src/adapters/local/collectors/ccusage.ts#L15)。

## 各平台

I/O/R/W/T 分别指普通输入、可见输出、缓存读取、缓存写入、推理。✓ 表示源码采集，0 表示当前代码填零，? 表示依赖记录且无法从解析器确定全部原始来源能力。每行均保留模型、会话和归属时间，事件 ID 的稳定性见说明。

| 来源 | 存储与粒度 | I/O/R/W/T | 身份、时间与重要限制 | 证据 |
|---|---|---|---|---|
| Codex CLI | 会话 JSONL，token_count 计数快照与增量 | ✓/✓/✓/0/✓ | 输入减缓存读取，输出减推理；按 session、时间和计数生成 ID 并处理重复、计数重置和缺失开头；相邻可靠累积锚点产生 `usageInterval`，结束时间无法证明区间内小时分布。无有效时间时使用文件 mtime 并诊断 | [codex.ts:102](../../../packages/dashboard/src/adapters/local/collectors/codex.ts#L102)、[codex.ts:133](../../../packages/dashboard/src/adapters/local/collectors/codex.ts#L133)、[codex.ts:200](../../../packages/dashboard/src/adapters/local/collectors/codex.ts#L200) |
| CommandCode | 项目目录 JSONL 中 usage 记录，附可选 meta | ✓/✓/✓/✓/0 | 输入含缓存读取，解析时扣除。ID 由 session 和记录 ID 或行号构造，行号后备受重写影响。时间字段缺失时用 mtime 并报告数量；支持记录费用和峰谷处理；项目目录有显式映射和后备 | [commandcode.ts:63](../../../packages/dashboard/src/adapters/local/collectors/commandcode.ts#L63)、[commandcode.ts:133](../../../packages/dashboard/src/adapters/local/collectors/commandcode.ts#L133) |
| Gemini CLI | session JSON 内 message | ✓/✓/✓/0/✓ | 输入扣缓存；消息 ID 可生成事件 ID。消息时间无效时使用 mtime，采集器未单独标注估计精度；项目由目录推导 | [gemini.ts:10](../../../packages/dashboard/src/adapters/local/collectors/gemini.ts#L10)、[gemini.ts:48](../../../packages/dashboard/src/adapters/local/collectors/gemini.ts#L48) |
| Claude Code | 项目 JSONL 的 assistant usage | ✓/✓/✓/✓/0 | session + requestId + message ID 合并同一消息的重复副本，取 token 总量较大版本；某文件存在无效记录时整文件不接纳；带 costUSD 可记录费用 | [claude.ts:9](../../../packages/dashboard/src/adapters/local/collectors/claude.ts#L9) |
| OpenCode | SQLite session 与 message/session_message，assistant message | ✓/✓/✓/✓/✓ | session + message ID 去重；数据库 created 时间；session 关联项目及标题；支持记录 cost。失败 session 被剔除 | [opencode-usage.ts:9](../../../packages/dashboard/src/adapters/local/collectors/opencode-usage.ts#L9) |
| ZCode | SQLite model_usage，排除 running | ✓/✓/✓/✓/✓ | row ID 加 session 生成事件 ID；completed_at 优先，否则 started_at。两个原始时间在事件中被压为一个，无法计算时长 | [zcode.ts:9](../../../packages/dashboard/src/adapters/local/collectors/zcode.ts#L9) |
| DeepSeek Harness | session JSONL 或 zstd，assistant、标题请求和压缩摘要 usage | ✓/✓/✓/✓/0 | 需要数值时间和 message/response ID，合并 legacy/v4、seed 副本，冲突隔离。parentSession 用于 replay 检查，未进入统一事件；total 必须与四类 token 相符 | [deepseek-harness.ts:17](../../../packages/dashboard/src/adapters/local/collectors/deepseek-harness.ts#L17)、[deepseek-harness.ts:70](../../../packages/dashboard/src/adapters/local/collectors/deepseek-harness.ts#L70)、[deepseek-harness.ts:112](../../../packages/dashboard/src/adapters/local/collectors/deepseek-harness.ts#L112) |
| Antigravity IDE / CLI | conversation SQLite 的 protobuf generation 和 step | ✓/✓/✓/✓/✓ | generation/step 依据 request identities 合并、逐项取最大值；重试 identity 分开。模型名优先本地 metadata，缺失时保留 numeric ID 占位；时间依次使用 event、关联 step、generation、conversation 创建时间 | [events.ts:5](../../../packages/dashboard/src/adapters/local/collectors/antigravity/events.ts#L5)、[events.ts:53](../../../packages/dashboard/src/adapters/local/collectors/antigravity/events.ts#L53)、[metadata.ts:16](../../../packages/dashboard/src/adapters/local/collectors/antigravity/metadata.ts#L16)、[antigravity.ts:53](../../../packages/dashboard/src/adapters/local/collectors/antigravity.ts#L53) |
| aiusage | SQLite records 索引行 | ✓/✓/✓/✓/✓ | 无原生 ID 的历史可按内容哈希识别；Codex 输入和输出按子集扣除；部分原始文件不可用时保留，缺失 timestamp 时后备当前时间 | [aiusage.ts:45](../../../packages/dashboard/src/adapters/local/collectors/aiusage.ts#L45)、[aiusage.ts:106](../../../packages/dashboard/src/adapters/local/collectors/aiusage.ts#L106) |
| ccusage | 离线日 × session × 模型报表 | ✓/✓/✓/✓/✓ | 报表字段依版本可缺省，合成中午时间仅表达日期；只接纳未覆盖 session/file | [ccusage.ts:30](../../../packages/dashboard/src/adapters/local/collectors/ccusage.ts#L30) |
| WorkBuddy | 当前没有独立采集器 | ? | `workbuddy/` 和 `workbuddy-ai/` 是模型 provider 名称映射，Harness 可采集带该前缀的模型；不证明 WorkBuddy 客户端原生日志已支持 | [model-registry.ts:23](../../../packages/dashboard/src/domain/model-registry.ts#L23)、[deepseek-harness.ts:97](../../../packages/dashboard/src/adapters/local/collectors/deepseek-harness.ts#L97) |

## 字段覆盖与待扩展项

下表逐源列出非 token 字段。`C` 为源码采集并保留在原始事件，`D` 为原字段用于去重或判定但事件未保留，`P` 为部分记录、后备或推导，`U` 为原始来源是否提供尚未验证，`—` 为当前统一事件没有对应字段。斜杠两边分别对应列标题中的字段。设备列指原生采集时的状态，导入及同步可以补设备归属。provider 名称可由模型注册表推导，不能自动视作独立采集的实际计价渠道。

| 来源 | Provider / Channel | Effort | Request / Session | Timestamp / Start-End / Duration | Finish / Error / Retry | Parent-child / Tool | Project / Recorded cost | Account / Device |
|---|---|---|---|---|---|---|---|
| Codex | P / U | U | P，事件哈希而非原始请求 ID / C | P，时间和部分累计区间 / — / — | U / P，完整性诊断 / U | U / U | P，由 cwd 归因 / —，按价格估算 | U / — |
| CommandCode | P / U | U | P，记录 ID 或行号哈希 / C，文件名 | P，时间或 mtime / — / — | U / P，读入诊断 / U | U / U | P，映射及目录后备 / C，若存在 costUsd | U / — |
| Gemini CLI | P / U | U | P，message ID 哈希 / P，sessionId 或文件名 | P，message 时间或 mtime / — / — | U / P，解析诊断 / U | U / P，样本存在 `tokens.tool`，事件未保留 | P，目录推导 / — | U / — |
| Claude Code | P / U | U | D，requestId 与 message ID 用于哈希和去重 / P，字段或文件名 | C，记录时间 / — / — | U / P，文件失败诊断 / U | U / U | P，cwd / C，若存在 costUSD | U / — |
| OpenCode | P / U | U | P，message ID 哈希 / C | P，message 创建时间 / — / — | U / P，session 失败诊断 / U | U / U | C，session 目录 / C，若存在 data.cost | U / — |
| ZCode | P / U | U | P，row ID 哈希 / C | P，完成时间优先，起始时间后备 / D，原始两列压为单一时间 / — | U / U / U | U / U | C，session 目录 / — | U / — |
| DeepSeek Harness | P，model 前缀 / U | U | D，response/message 用于哈希去重 / C | C，usage time / — / — | U / P，诊断独立存放 / P，重复副本与冲突判定 | D，parentSession 用于 replay 检查 / U | P，session header cwd / — | U / — |
| Antigravity | P / U | P，可能反映在模型名称，独立 effort 未采集 | D，response/provider/message identities 哈希合并 / C | P，event、关联 step、generation、conversation 的时间回退 / — / — | U / P，解析错误 / D，解析 retry usage 后未保留角色 | U / U | P，conversation metadata / — | U / — |
| aiusage | P / U | U | P，记录内容哈希 / P，缺省 default | P，记录时间或当前时间 / — / — | U / P，读取诊断 / U | U / U | P，cwd 或元信息推导 / P，非 Codex 的正值 | U / — |
| ccusage | P / U | U | — / C，session 报表 | P，日级，合成中午 / — / — | U / P，报告失败 / U | U / U | P，报表路径 / P，按报告字段 | U / — |
| WorkBuddy | P，模型前缀 / U | U | U / U | U / U / U | U / U / U | U / U | U / U | U / U |

逐行实现证据见上一节同一来源的源码链接。`—` 描述当前事件契约，`U` 留待进一步对原始版本取样或协议证据确认。

所有平台的 `modelName`、会话和项目都可能来自回退或推导。单独保存真实 provider、渠道、effort、父子关系、request ID、开始和结束时间需要扩展统一事件及下游契约。`eventId` 是用于幂等的派生哈希，不能直接作为真实请求次数。原始 total 通常被分项重建或验证，未统一保存。recorded cost 仅在具体解析器读取了相应字段时可用。账号身份没有通用采集字段，设备由导入或同步链路提供。工具调用、错误及 finish reason 的整体覆盖尚未验证。

原生事件的时间也有回退，例如 Gemini 文件 mtime、Antigravity conversation 创建时间、ZCode 开始时间。`timestampPrecision` 缺省不提供这些回退的精度标签，因此小时分桶须额外记录 provenance。Codex 差分如跨桶，存在 `usageInterval` 的情况下应保留区间不确定性，不做均摊。时间归日由 [normalization.ts](../../../packages/dashboard/src/adapters/local/normalization.ts) 执行。

## 脱敏本地样本

2026-11-24 对每来源最多前 20 个发现文件做只读扫描，仅统计 usage 对象字段名。样本按文件发现顺序，非随机样本，不代表全历史覆盖。Codex 20 文件的 3,275 条 usage 均存在 input_tokens、cached_input_tokens、cache_write_input_tokens、output_tokens、reasoning_output_tokens、total_tokens；源码的 Codex 采集未将 cache_write_input_tokens 传入事件，存在原始字段未采集。Gemini 2 文件的 6 条均有 input、output、cached、thoughts、tool、total，其中 tool、total 未作为字段保留。CommandCode 20 文件 603 条均有 inputTokens、outputTokens、cacheReadTokens、cacheWriteTokens、costUsd。Claude 1 个文件中未发现 usage；本次明文 JSONL 扫描未发现 DeepSeek 文件，该扫描未检查压缩文件，完整原生采集核验见 [验证附录](appendix-verification.md)。默认 aiusage 索引文件不存在。样本未输出消息、路径、ID 或数值。字段出现说明该样本有字段，值的语义与完整性仍需逐源验证。

## 采集完整性

本地常规 loader 缓存过期后重新扫描，Sync capture 对来源生成独立 scope，识别文件变化与损坏并记录 isolation，具体连续性和回滚见同步章节。JSONL 的部分读取、轮转、失败并非所有采集器采用统一策略。Claude 以文件为单位拒绝损坏，OpenCode 按 session 排除，Harness 记录诊断和可用前缀，Codex 记录会话完整性。证据 [capture.ts:76](../../../packages/dashboard/src/agent/capture.ts#L76)、[capture.ts:105](../../../packages/dashboard/src/agent/capture.ts#L105)、[README.md](../../../packages/dashboard/README.md)。
