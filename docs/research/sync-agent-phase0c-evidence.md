# Sync Agent Phase 0C：来源连续性与有限准入契约

日期：2026-10-16，Asia/Singapore。源码基线：`aef64f4`，分支 `codex/production-readiness`。

本页承接 [Phase 0 决策](sync-agent-phase0-decisions.md)、[Phase 0B 契约](sync-agent-phase0b-contract.md) 和 [Phase 0B 证明](sync-agent-phase0b-proof.md)。架构顺序遵守 [正式计划](../plans/incept-sync-agent-implementation-plan.md) R1～R5；本次用户授权将 B1 收敛为有限的来源连续性。Phase 0/0B 文件和业务运行时代码保持原样。本轮停在研究、合成证据适配器与隔离测试；准入结果见 [Phase 0C proof](sync-agent-phase0c-proof.md)。

## 1. 保证的精确定义

| 层次 | 可证事实 | 对外标签 |
|---|---|---|
| 当前快照 | 已登记读取范围的清单、JSON 解析、SQLite 一致备份、读取前/备份/读取后逻辑 root 一致；真实 collector 的输出与 capsule 重放相同 | `snapshot-only` |
| 首次登记 | 服务端保存此时实际观察到的原点、范围、manifest、成员和提交回执；父版为空 | `baseline-observed` |
| 连续观测 | 本次证据与服务端已提交父 manifest 唯一相连；旧范围仍在，变化符合来源专用规则；可见版本与提交回执原子切换 | `since-enrollment` |
| 需要解释的历史 | 旧 v1 重合、已见范围丢失、来源切换或无桥接轮转；保存旧可见版本和冲突 capsule | `review-required` / quarantine |

`since-enrollment` 精确表示**自登记以来已确认观测范围的连续性**。首次观察前消失的历史，以及两次采样间生成后消失、从未被观察到的内容，均没有可恢复的来源证据；producer journal/签封清单才能扩展这一范围。这里不把连续的快照链宣传为永恒全历史。

Gemini 两世界反例得到有限解：当前字节相同，父版 A 只有一条时判 unchanged；父版 B 曾确认两条时判 `PREFIX_LOST`，保留两条。没有父版时登记所见基线；遇到 v1 则先走 B2，不能从相同当前字节推出旧 v1 应被删除。

## 2. 持久 origin、manifest 与回执

代码均在 `packages/dashboard/src/__tests__/phase0c/`，不从运行时入口导出。

| 对象 | 原型实际保存的内容 |
|---|---|
| 注册 | 服务端 scope→origin 绑定、bindingVersion、登记主体；同一 origin 不得换设备/source/session，同一 scope 不得另绑 origin |
| scope | deviceId、canonical source、source session namespace；设备上下文与 payload 分别核对 |
| 原始范围 | locator、`dev/ino/birthtime` 的文件身份摘要、读取时字节长度、JSON 字节 root，或 SQLite schema/逻辑表 root；合成 capsule 保存原始备份字节供重放 |
| manifest | schema=`phase0c/1`、collector=`aef64f4`、source/reader、父版 ID/Hash、三次读取 root、files、桥接、recordCount、序列摘要、经 collector 得到的 native anchors、完整 observations、冻结价格/映射和本版 hash |
| 服务端持久状态 | 历史 accepted manifests、版本选择、v1 引用、adoption grants、隔离 manifests、审计、batch payload hash、提交/审阅回执及 revision |
| 客户端持久状态 | scope、已确认 parent、完整 pending batch/manifest、已核验提交回执、保存的冲突；临时文件写入并 fsync 后 rename |

`manifestHash` 是本版 ID 和内容指纹；父版的 ID/Hash 两项都必须等于服务器当前已确认 manifest。batchId 与 payloadHash/manifestHash/receiptHash 相绑定；同设备同 batch 换 payload 拒绝，原 payload 重试返回原回执。

SQLite 原型使用 WAL、`synchronous=FULL`、busy_timeout=1000ms。manifest、可见集合、隔离/审计和 receipt 在一个事务内保存。客户端只接受与服务端持久记录完全一致的 committed receipt，随后原子推进 parent；网络失败、ACK 丢失和 review receipt 均不推进。已持久的 review receipt 可归档冲突并释放 pending，随后从原已确认 parent 重新扫描；半写恢复等暂态故障由此正常继续。

验证器不信任一个客户端 `complete` 字段：它重算 manifest/root，检查来源读取范围，重放 capsule 中的真实 collectors，逐项比对 observations、数量、anchors 和序列摘要，再从**服务端保存的父版**验证连续性。测试包含篡改完整标记、行内容、字节、父版 hash、source/session 和 batch 的拒绝例。0C 没有调用 0B 的 `certifyFixture`。

原型的设备、Owner 和登记上下文是隔离测试桩。可信 capture 提供文件身份；这些 hash 检查属于协议一致性验证，远程文件系统真实性证明和真实设备鉴权不在本轮实现范围。完整原始 capsule 只含合成内容，用于 correctness oracle；生产传输不得照搬原始对话日志。

## 3. 有限自动接受规则

### 3.1 不变、追加和弱身份

- 同一文件身份、相同范围/内容/collector 序列，提交 `unchanged` 回执；数据不重复。原型仍保存这次 manifest 链节点，revision 表示证明事务序号。
- JSONL 必须逐字节保留已确认前缀，并完整解析新增尾段。尾行 JSON 半写、读取中变化、解析/collector 错误保留旧版本。
- Gemini JSON 使用同一顶层 sessionId、相同外围 envelope 和 messages 的有序前缀。正常 JSON 数组扩展不要求整个文件字节前缀相同。
- SQLite 用 `backup` 冻结，再对 schema、逻辑行/键和范围比较。OpenCode/ZCode 的 session 与 session_id 范围分别验证；VACUUM/物理页变化不视为逻辑丢失。删键、表/schema 消失或无证据换库隔离。
- 弱身份只使用 **session 实体的原子 generation**。内容摘要只是本次前后快照的保留证据；行号、时间、Token 计数不升级为跨代实体 ID。旧弱 observation 的内容与重数必须保留；含糊修订/缺失隔离。
- AIUsage fallback 使用完整旧逻辑行前缀，行顺序变化也保守审阅。其内容 hash 不充当稳定原生请求键。
- 新跨文件 shard 要有真实嵌入式 session anchor，旧 shard 继续保留；Codex 的跨文件累计时间线由真实 collector 统一重算。追加八天前事件的正例直接通过范围证明，不使用事件时间 cutoff。

### 3.2 Codex 的受控累计修订

自动修订要求原始 session_meta.id 保留、非计数 envelope 保留、旧累计点数量/顺序/显式时间保留；允许旧点数值变化以及后续点追加。所有累计字段必须非负、单调，不出现无法解释的 counter epoch/reset；缓存数和 reasoning 数须在对应总量内。计数不参与 session 实体身份。

| 真实 collector 重算 | 可见 input delta | 可见 input 总量 |
|---|---|---:|
| `100 → 120` | `120` | 120 |
| `50,100,200` | `50,50,100` | 200 |
| `50,120,200` | `50,70,80` | 200 |
| `50,120,220` | `50,70,100` | 220 |

session_meta 缺失的所见基线可以登记；其改写返回 `CODEX_SESSION_ANCHOR_REQUIRED`。锚点消失、时间/顺序变化、同时间含糊点、counter reset 和字段 envelope 变化保留旧版本。每个累计点不是由旧计数拼成的稳定事件实体；整个 session 切换 generation，旧 eventId 改变不会产生加法双计。

### 3.3 其他强键修订

CommandCode/Claude/Gemini 原始条目必须保留非 usage envelope、键、顺序和时间；OpenCode/ZCode 要保留逻辑 PK、session、时间、model 和其他非 usage envelope。允许用量/已支持 recorded cost 字段修订，重新调用真实 collector 并在同一冻结价格依据下计算。旧 native anchor 消失或时间改变均隔离。

模型、项目、未知 schema/字段和 alias 变化不通过本轮的窄自动规则；Phase 0B 的完整 fingerprint/Owner 显式变更契约继续适用。Antigravity 的 idx 只是原始表范围线索，BLOB/native alias 改写没有自动修订资格。

### 3.4 轮转、归档和来源切换

原型仅接受两种可复核桥接，均绑定父 manifestHash、旧 locator/root 和新 locator：

1. **same-file**：真实文件身份未变、basename namespace 未变、内容相同或原前缀保留。已验证 CommandCode 目录移动。
2. **embedded-session-copy**：Codex/Claude/Gemini 新旧内容都有同一嵌入式 session anchor，新内容包含整个已确认旧字节前缀。旧新路径同现时，仅在已验证桥接下选择覆盖完整旧范围的表示；旧路径随后消失仍须绑定正确父版交接。

没有桥接的改名、消失或相同 root 副本同现，返回结构化 `ROTATION_UNVERIFIED`，保留旧可见数据。新名字相似、mtime 接近或计数相等均不构成桥接。DB 文件身份改变即使逻辑行相同，也要新登记/Owner 变更证明；本轮没有实现 DB copy/换库自动认领。

fallback→native 会改变 reader 证据范围，返回 `SCOPE_BINDING_MISMATCH`。六来源的既有 coveredSessions 等原生优先机制，以及 CommandCode 精确 source_file 对应，均经实际 exporter 双表示对照。CommandCode 索引指向别处时，旧 exporter 会保留两条（合成 input100+120=220），这是没有同源证明的反例：新 lineage 保留此前100并提示交接冲突，不能仅凭 session/计数自动合并。

## 4. 七来源及 fallback 资格矩阵

### 4.1 身份、追加、修订与丢失

| 来源 | 稳定事实/原始范围 | 普通追加 | 旧点修订 | 截断/删除/覆盖检测 |
|---|---|---|---|---|
| Codex | session_meta.id、显式累计点顺序/时间、JSONL 原前缀；eventId 含计数而不是稳定实体键 | 已见前缀保留、跨 shard 嵌入锚点和累计序列有效时自动 | 上述专用累计规则；缺 metadata 或 reset 审阅 | 前缀损失、锚点/点顺序/时间变化、文件身份替换均保留旧版 |
| CommandCode | filename namespace（外部加 cc-）、obj.id；无 id 为弱 session | 原始 JSONL 前缀自动，弱身份也须保留旧 observation | 有 obj.id、固定 envelope 的 usage 修订自动；无 id 审阅 | 合法截短、行 envelope 改写、旧 anchor 消失可检测 |
| Claude Code | sessionId + requestId + message.id；真实 collector 处理流式表示 | JSONL 前缀自动；新 shard 需嵌入 sessionId | 强键 usage/cost 修订自动；弱行改写审阅 | 损坏/截断、旧键/弱内容丢失保留旧版 |
| Gemini CLI | 顶层 sessionId + message.id；缺 id 为弱 session | messages 有序保留后扩展自动 | 同强 id/time/envelope 的 tokens 修订自动；弱修订审阅 | 合法 JSON 删除也返回 PREFIX_LOST；缺时间估计结果隔离 |
| Antigravity | filename session、native response/provider/message aliases；gen_metadata/steps 原始范围；三个目录均登记 | 一致 DB、旧表行前缀保留、collector 旧成员保留时自动 | 原型不自动接受 BLOB/alias 变动；idx 不当实体 ID | 逻辑行减少/改写、schema、锚点及文件身份变化可检测 |
| OpenCode | session.id、message/session_message 的逻辑键及 data.id/row.id | 同 DB identity、旧 scoped PK/行保留后新增自动 | 保持 PK/session/time/model 的 tokens/cost 修改自动 | scoped PK 删除、表/schema 消失、无法解释的换库隔离；物理页变化可接受 |
| ZCode | session.id + model_usage.id；无 id 降为弱 session | 同 DB、旧 scoped 行保留后新增自动 | 有 id 的 usage 修订自动；无 id 审阅；running 暂缓 | 删除、status/schema/非 usage 改写可检测；running 不当空结果 |
| AIUsage fallback | tool→canonical source、session、原始 records 表范围；无可靠请求主键 | 已确认原始逻辑行前缀完全保留时自动 | 改行/排序/重建索引或切 native 要审阅 | 删除/重建/换库和缺路径可检测；旧内容摘要不作跨代实体 ID |

### 4.2 轮转、首次绑定与人工边界

所有来源首次无 v1 冲突时登记 `baseline-observed`；**同设备/source/session 的既有 v1 memberships 不会自动隐藏**。B2 要求已授权 origin、精确旧 batch checksum/positions、scope、内容一对一、映射/价格一致，或 Owner 对明确旧引用与新 manifest 的一次审阅。不同 device/source 的认领拒绝；一对多、多对一或不明归属保持旧结果。

| 来源 | 可信交接依据与本轮覆盖 | 审阅/限制自动更新的边界 |
|---|---|---|
| Codex | 完整旧前缀 + 相同 session_meta 的归档副本；旧新同现/消失均有正例 | `.jsonl.zst` 能被真实 collector 解压，但本原型明确返回 COMPRESSED_ARCHIVE_UNSUPPORTED；counter reset、无 meta 修订及无桥接丢片审阅 |
| CommandCode | 同一文件身份、basename 保留的移动；跨名无可信 session 键 | 改 basename、缺 obj.id 的历史改写、source_file 与 native 不对应、meta/project 变更审阅 |
| Claude Code | 同 sessionId 的完整旧字节范围副本，绑定父 manifest | 缺原始 sessionId、弱记录改写、复杂流式 envelope 变化和丢 shard 审阅 |
| Gemini CLI | 顶层 sessionId 与完整旧字节范围副本 | 只剩合法较短 JSON、缺键/时间、未确认 prefix 或重排审阅 |
| Antigravity | 原型仅证明同 file identity 与旧表范围；没有 producer 封口/轮转清单 | DB copy/改名、alias 优先级变化、BLOB 修订、多目录身份交接要审阅；CLI/IDE 两目录读取正例已补 |
| OpenCode | scoped 逻辑 PK/表范围能证明 DB 内连续更新 | DB copy/换库、message→session_message 表迁移或删除缺证明时审阅；不按物理 hash 判删除 |
| ZCode | scoped session/model_usage 范围与原 DB identity | 换库、旧 schema 无 id 的改行、running/不完整读和无桥接改名保留旧版 |
| AIUsage fallback | 完整索引旧行范围；原型没有 producer rebuild/handoff manifest | 索引清理、重建、default/推导 session、变 reader/原生恢复不自动认领；保留旧 fallback 结果等审阅 |

遇到新来源格式、collector/schema 版本升级或来源错误，本轮采用明确失败与旧版本保留；后续适配须增加同级正反例再开放。JSONL 压缩证明、DB copy、Antigravity alias 修订等限制都有可执行拒绝测试或当前未开放路径的明确说明。

## 5. v1、费用、回滚的衔接

0C 验证器不使用 0B fixture certificate；仅复用 B2 的确定性 adoption 分类及 B3 价格函数。隔离统一视图先过滤已经认领且有有效 generation 的旧 memberships，再交给真实 `loadImportedEvents`；新 session generation 只读一次。原始 v1 payload/receipts 与批次顺序保留。Owner 审阅保存 manifestHash、旧 checksum/positions、proof 和主体。

registered-origin 一对一认领还校验有效 mappings 与实际相关模型的 captured prices；不一致返回 MAPPING/PRICING_REVIEW_REQUIRED，避免首次认领暗中改价。Owner 的明确审阅可绑定新的价格依据。后续普通设备提交的 basis/mappings 变化返回 `EXPLICIT_REPRICE_OR_MAPPING_REQUIRED`；0B 的显式重算及 rollback 证明保留。

v1 rollback 只撤批次支持，已独立提交的 generation 保留。revision rollback 选择旧未回滚版本，全部 generation 回滚时恢复活跃 legacy。原型对已回滚的最新 lineage 设置 `ROLLED_BACK_LINEAGE_REVIEW_REQUIRED` 栅栏，防止下一扫描把相同内容自动复活；Owner 的恢复/重登记流程留给 Phase 1。价格、nominalCost、CommandCode 峰谷倍率和 API-equivalent 的解释沿用 0B。

## 6. Phase 1 最小准入提案

按上述有限保证，B1 可以从“追求全部历史的 BLOCKED”收敛为**带边界的工程准入**，最终裁决及验证数量只写在 proof 末尾。

Phase 1 必须一起实现下列要求，不能先上线加法写表再补：

1. 持久服务端 origin/scope、已确认 manifest 链、父版 CAS、batch payload 冲突与原子提交回执；保留旧有效 generation 和完整审计引用。
2. 七来源和 fallback 的已证明追加路径；受控修订只按来源规则开放。格式/版本/轮转没有证明时返回结构化冲突，不把缺失转成删除。
3. v1 单一读取视图、明确 adoption 引用、精确价格/映射兼容、零额外重复；既有 Preview/Commit、Owner/TOTP 与人工 Import 保留。
4. 首次历史、截断、来源切换、DB copy、弱改写、Antigravity alias、counter epoch 和 rollback 栅栏均有 Owner 可审阅的明确旧/新版本及影响；审阅后重新建立有审计的新基线/epoch，不冒充自动 prefix 连续。
5. 暂态读取错误可以自动重扫，但只从最后 committed parent 继续。客户端 pending/冲突恢复遵守 durable receipt，不跳过未确定提交的批次。
6. 压缩 Codex、数据库多会话/多表范围、目录别名/sidecar 和 collector 升级必须有明确资格/限制；超出本轮正例的格式继续保留旧结果。分页、资源上限、并发、崩溃恢复和可见查询的生产验收按正式计划补齐。

正常追加和已证明的强键修订不增加 Owner 操作。首次 v1 认领按已登记 origin/旧引用集合一次处理，可批量审阅；不明历史按受影响 scope 审阅。半写、running、读中变化/暂时目录缺失属于可重扫状态，修复后可沿原父版继续。弱来源回写、日志清理/轮转、索引重建或 Owner rollback 会触发持久冲突；本轮没有真实设备长期观测，频率未知，不能据合成样本估算每周次数。

可移入正式设计的是：manifest/receipt 字段、父版和归属约束、来源规则、冲突码、失败保留及测试 vectors。应继续仅作 oracle 的是：保存全部合成原始字节、验证端重放 collector、整份 JSON 状态 SQLite、每次重建 compat DB/完整 projection、esbuild 子进程 runner 和模拟身份上下文。生产不能直接复制这些吞吐/传输方式。

下一轮须先由用户或规划 AI 查看两份报告并确认准入，再交给编码 AI 实施 Phase 1；本轮没有启动该阶段。
