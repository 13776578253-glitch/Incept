# Sync Agent Phase 0B：候选数据契约与决策记录

日期：2026-10-16，Asia/Singapore。基线：`aef64f4`，`codex/production-readiness`。

## 1. 准入判断

**BLOCKED：B1 尚未关闭，继续暂停 Phase 1。** 方案 A 的身份、费用、归属和回滚规则已形成可执行候选契约；隔离原型证明会话原子替换可消除 100→120 的双计。剩余阻断是实际来源的历史完整性证据，尤其是首次绑定、合法截断、弱身份改写和轮转交接。

| 阻断项 | 状态 | 本轮证据 |
|---|---|---|
| B1 身份与完整会话 | BLOCKED | 七来源在受控 fixture 证明下替换正确；真实 collector 的一致读取只有 snapshot 证据。Gemini 两个不同历史、相同当前字节的反例说明额外历史证据是必要条件 |
| B2 legacy adoption / projection | 契约及隔离证明闭合 | 显式注册归属；一对一桥接；歧义留审计；批次中断续跑、两次重建、同批100次、回滚、多设备测试通过 |
| B3 费用 | 契约及隔离证明闭合 | v1/native 保留 live 兼容通道；v2 固定价格与别名版本；用量修订和 Owner 显式重算分开，保留 CommandCode nominal/peak 来源 |
| B4 删除与回滚 | 契约及隔离证明闭合，自动删除依赖 B1 | 只有限定 scope 的完整替换产生 tombstone；不完整结果保留旧版本；revision/batch rollback 与设备撤销边界明确 |

本轮文件均在测试目录、测试配置或研究文档内。`phase0b-shadow.ts` 使用隔离 SQLite 日志和全量重放，作为正确性原型；现有 collector、loader、导入服务、Owner/TOTP、生产 SQLite/PG、Docker/Caddy、Docs/Music 与 Windows 启动配置保持原样。

## 2. 核心领域契约

### 2.1 identity 与 fingerprint

逻辑 scope 为 `(serverVerifiedDeviceId, canonicalSource, sourceSessionNamespace)`。`originId` 是预注册的来源归属证明，单独核对，不加入逻辑身份来绕过修订/重命名检查。同一 origin 不允许被另一设备抢占。

- **强身份实体：** `hash(entityVersion, scope, verifiedNativeRequestKey)`。原生键须由适配器在原始数据中验证；从客户端传来的 canonicalTransferId 或十六进制字符串本身不构成证明。
- **弱身份/Codex 实体：** 整个 scope 的 session 实体。generation 内的 observation 有顺序和内容指纹，但不声称跨 generation 的每个行号都是同一请求。完整替换在 session 层发生。
- **fingerprint：** 版本化 canonical JSON，覆盖完整 TransferEvent（Token、模型、原始 recordedCost、项目、路径、标题、时间等）、经验证的 native anchor、捕获价格/别名/峰谷规则版本。身份不随费用、模型、计数或展示归属改变。
- **generationId：** 对 scope、父 generation、完整 observations、evidence、价格依据、项目映射、显式替换意图和移除清单求 hash。旧 generation 和原始观测保留供审计/重放。

设备身份来自服务端鉴权上下文，须等于请求 deviceId；设备不能创建 adoption 或显式重新计价。source/session/注册 origin 均与服务端绑定比对。跨设备、跨来源及同名不同 session 的请求键相同也不覆盖其他实体。两个独立注册的物理 origin 可以存在相同原始请求 ID；同一 origin 的跨设备认领产生冲突。

### 2.2 SessionManifest / SessionGeneration 候选字段

下表是领域契约，未固化为生产 SQL 或公开 API。测试原型的精确类型见 `phase0b-contract.ts`。

| 字段组 | 候选内容与约束 |
|---|---|
| 协议 | contract/schemaVersion、collectorVersion、agentVersion；原型标识 `phase0b-candidate/1` |
| scope | 服务端设备、canonical source、session namespace、已注册 origin/binding 版本 |
| 清单 | 所有已知 origin 的身份与 locator hash、文件范围或 DB snapshot root、record 数、顺序摘要、完整 inventory hash |
| 读取证据 | 读取前 root、冻结副本 root、读取后 root、目录 inventory；解析/时间/覆盖错误码；DB 一致快照标识 |
| 完整性 | captureStatus=`complete/partial/unavailable/failed`；另有 coverage=`snapshot-only/session-certified`；prefix/轮转/历史覆盖证明 |
| generation | parentGenerationId、完整 observation 集合与摘要、显式 replace 意图、限定 scope 的 removed anchors |
| 计价/展示 | rawModel、resolvedModel、captured rates/aliases、配置版本、recorded/API-equivalent/nominal 来源、项目映射 |
| 提交 | batchId、payloadHash、已提交 receipt、dataRevision、可见 generation、审计 actor/reason 和前版本 |

正常增量可传 generation 的分页差异，但只有全部分页到齐并验证完整集合后，才允许原子切换 session 的可见 generation。原型以最多500条 observation 的完整 generation 演示事务边界；大 session 分页/最终提交屏障留待正式实现，不裁减长期七来源目标。

### 2.3 complete 的两层含义

本轮证据适配器执行实际文件/SQLite 操作，而不是直接填写 `complete: true`：

1. 对已注册的 origin 清单核对 inventory，缺失路径返回 unavailable，新/少路径返回 partial。
2. JSON/JSONL 冻结副本；SQLite 通过 Node `backup` 冻结一致快照。
3. 比较读取前、冻结副本和读取后三个内容 root，以及 inventory；不相等则 partial。原始内容相同但副本不同也拒绝。
4. 检查每条 JSON，包括半写尾行；调用真实 collectors；校验错误、Codex historyIncomplete、ZCode running 状态、Gemini 缺时间导致的 mtime 估计、请求键冲突和 session 绑定。

这些步骤产出 **完整读取当前已知快照**，coverage 仍为 `snapshot-only`。代码内 `history: known-scope` 指已注册的读取范围，不宣称拥有完整历史。来源曾经丢掉哪些有效历史记录，需要另一个证据链回答。

原型正例使用 **fixture writer 已知的完整集合**作为外部 oracle，生成 `fixture-certified` 测试证书；shadow 将证书和 scope/evidence/observations 摘要绑定到日志。该证书仅用于受控样本。普通 collector 输出即使 status=complete，也会收到 `HISTORY_CERTIFICATE_REQUIRED`，不会成为可见替换版本。

### 2.4 逐来源锚点与证据

| 来源 | 原始锚点和 session namespace | 退化、改名/归档 | 当前可取得的读取证据与缺口 |
|---|---|---|---|
| Codex | session_meta.id；累计 token_count 序列 | 当前 eventId 混入累计计数，不是稳定请求键；缺 session_meta 时退化为文件名。已验证带 metadata 的归档副本去重 | JSONL/副本清单、显式时间、累计前缀、historyIncomplete。仍需完整 shards、counter epoch 与轮转交接证明 |
| CommandCode | filename session、usage 行 obj.id；对外 session 加 cc- 前缀 | 无 id 为 line:index；插行/重命名改变当前 ID/namespace | 全行解析、目录清单、时间估计 warning；缺少生产者封口/截断证据 |
| Claude Code | sessionId + requestId + message.id | 无 message.id 退化；缺 sessionId 使用文件名 | 完整 JSONL；损坏记录会导致整文件回退。流式多版本和被移走的旧分片需来源清单 |
| Gemini CLI | 顶层 sessionId + message.id | 缺 id 为弱身份；缺时间走文件 mtime；缺 sessionId 使用文件名 | 完整 JSON messages、显式时间。合法 JSON 截断仍可通过读取检查，是本轮最小阻断反例 |
| Antigravity | filename session；response/provider/message aliases | 缺请求键退化；更高优先级 alias 新出现可改变当前 hash；文件名变化影响 session | 一致 DB 副本、metadata 解码与时间；需保存 alias 集合与原始 generation/step 覆盖关系，不能只保存优先键 |
| OpenCode | session.id + data.id/row.id；message/session_message | 同请求多表表示先去重；原生键缺失或混合版本须隔离 | DB 一致 snapshot + session/message 表覆盖与解析；现有 collector 多 SELECT 没有包在同一读事务，原型用 backup 冻结 |
| ZCode | session.id + model_usage.id（若存在） | 旧 schema 无 id 时弱化；running 不进入现有结果 | DB 一致 snapshot、schema、状态；存在 running 时原型标 partial。还需历史删除/归档证据 |
| AIUsage fallback | tool/session/时间/模型/计数内容；现有 SELECT 未取稳定原始请求键 | 内容变化改变弱 ID；default session 和文件来源增加歧义 | DB snapshot 只能证明现存索引；恢复原生记录后按同来源 coveredSessions/文件排重。索引完整性不替代原生历史证明 |

raw tool 别名（如 claude / claude-code）先经现有 collector 归一为 canonical source。真正的 source 变更不能仅靠字符串近似自动认领。

## 3. B1 决策阻断：历史无法从单个当前快照反推

可执行反例：`two different history worlds have identical current bytes...`。

- 世界 A：Gemini 会话一直只有 request0，input100。
- 世界 B：曾有 request0 与 request1，input合计200；随后日志合法改写，只留下 request0，没有 tombstone 或 rotation manifest。
- 两个世界当前 JSON 字节、目录清单、读取前后 root、冻结副本、collector 输出完全相同。读取器都只得到100。

因此，仅从当前源码这些输入生成“完整历史”的确定性证书不可行。增加15分钟回溯、hash、重复读取或 `complete=true` 不补充缺失信息。当前 safe outcome 是保留此前可见集并 quarantine，而不是把新集合无条件替换成100。

**可行的最小补充路线（保留已批准的方案 A）：**

1. 建立持久 origin inventory 和上一代原始范围/内容摘要，记录首次绑定的历史基线证据。
2. 对 append-only 增长提供可验证的前缀连续性；对 DB 使用逻辑 snapshot/变更证据，不能只靠 mtime。
3. 对改写、rotation、归档与弱 alias/key 变化逐来源证明前后范围唯一；来源没有证明时进入 Owner 审阅，保留旧数据。
4. 如果来源可提供封口/导出 manifest，将其作为独立证据输入；否则首次绑定/无法解释的重写继续由明确的审阅记录处理。
5. 在测试证书之外实现一个可用于真实来源的资格判定原型，重放“两世界/合法截断/改写前缀/半写/归档”反例，确认它能拒绝歧义而接受有充分连续性证据的变更。

这是当前 **决策阻断**，不是改成只支持强来源的许可。下一轮先补这些证据实验；Phase 1 保持暂停。

## 4. B2 adoption、可重入迁移和唯一 projection

### 4.1 adoption 分类与审计

| 条件 | 分类与动作 |
|---|---|
| 设备/source/session 相符，已注册 origin 的明确凭据，旧 batch checksum 相符，内容一对一且映射相容 | auto-adopt；这里的自动是已有归属授权下的确定匹配 |
| 只有 ID、时间或费用相似；没有注册证明；弱记录一对多/多对一；项目映射改变 | review-required，保存结构化冲突；旧视图保持 |
| 设备归属不同、真实 source 不同、origin 已被其他设备占用或旧引用已指向其他实体 | conflict，拒绝自动认领 |
| Owner 审阅后提供明确旧引用→新实体证据 | 显式 owner-reviewed 操作；不通过模糊相似性补全证据 |

审计至少包含：旧 batch ID/checksum、rowid 顺序、eventId/位置、原 device/source/session、原 mappings、新 scope/entity IDs、注册/审阅 evidenceHash、映射规则、操作主体和父版本。原型保留日志、versions、memberships、adoptions、conflicts 与 receipts，重建不会删除这些依据。

### 4.2 provenance 与版本选择规则

1. 未认领 v1 走现有兼容语义：最早活跃批次优先；现有一对一弱→强桥接；native 优先；native indexed 替代例外沿用原 loader。
2. 已认领且有可见 v2 generation 的旧 membership 在兼容读取前排除，不能再与 v2 相加。一个 scope 只有最后提交且未回滚的 generation 可见。
3. v2 generation 具有自己的观测 membership，不依赖某个旧 batch 持续 active。回滚 v1 只停用该 batch 的支持，不删除后续 v2 修订。
4. 回滚 v2 revision 选择此前未回滚 generation；若无可见 v2，则重新使用仍 active 的 legacy 支持。回滚过的 generation 不接受新 batch 静默重新激活。
5. 多个 legacy batch 支持同一表示时，回滚其中一个不删除其余支持；原始 payload、receipt 和 batch 映射始终保留。
6. 对 native 重合继续使用原生优先规则。v1/native 的实时价格配置属于兼容通道；v2 的价格冻结适用于被选中的 v2 表示。来源与 pricingVersion 使该选择可追踪。

### 4.3 三个具体时序

| 时序 | 当前可见结果 |
|---|---|
| v1 input100 → 原点认领 → v2基线100 → v2修订120 → v1 rollback | 100 → 100 → 100 → 120 → 120；再回滚修订则100；全部 v2 回滚且 v1已回滚后为0 |
| 两个 v1 各含相同7条 → 回滚其一 → 回滚另一 | total input700 → 700 → 0；membership 分别停用 |
| v2 input100 → next120在写 projection 后故障 → 同 batch 重试 → 再试100次 | 100 → 100 → 120 → 120；故障前后读者看到的 revision/集合一致，成功回执原样重放 |

### 4.4 原型重入与切换边界

迁移按旧 rowid 读取，source DB 以 readOnly 打开；旧 batch ID 是重放键。相同 batch 的 payload、映射、receipt 不可变部分改变时拒绝。后续真实 v1 rollback 单独成为状态/receipt 事件，不重写原 batch。

已提交日志是重建依据。projection、versions、memberships、adoptions、conflicts、receipts 和 dataRevision 在同一 SQLite 事务维护；重建重放原日志，不新增 revision。原型还有持久 switch 标记，读入口始终返回单一 read model。正式双版本切换/并发控制将在 Phase 1 实现。

## 5. B3 费用与展示语义

源码事实：`layer.ts` 对导入事件优先使用接收端 pricing，再用最早活跃事件所在 batch 的 captured prices；`overrides.ts` 的别名和价格会影响后续重算。UI `cost-metrics.tsx` 显示 `data.costs.totalCost`，该数来自 event.cost，包含 recorded 和 calculated 值。当前运行时没有独立 apiEquivalentCost 字段。

为保持兼容，候选规则分为两个有来源标签的通道：

- **legacy/native live：** 继续现有选择与 override 行为。最小反例已测：input价格1→2，v1 费用0.000145→0.000245；不能把这一行为静默改成冻结。
- **v2 frozen：** 固定 captured price、aliases 和 schedule 版本。计数/模型/项目/录得费用修订形成新 observation 版本；同一价格语义下重算 usage。新模型没有完整费率时标 unpriced；单独的 API-equivalent 估算为 null，而不是把未知写成免费。

| 操作 | 可见费用与审计 |
|---|---|
| Token 修订 | 同一冻结 basis 重新计算；raw observation 和父 generation 保留 |
| 模型字段修订 | 新 fingerprint；用已验证的价格/别名依据解析；缺费率保留 unpriced 状态 |
| 项目/标题/映射修订 | 新 fingerprint 和归属版本，Token不重复，费用按既有 basis |
| recordedCost 修订 | 新 raw recorded 值及版本；优先于估算，原值保留 |
| captured rates / alias 配置变化 | 常规设备批次拒绝隐式历史重算；Owner 显式 reprice 操作记录前版本、actor/reason 和新 basis |
| reprice rollback | 重新选择旧 generation/价格依据；不是把所有历史价格覆盖回去 |

Codex 不接受 recordedCost，保持 calculated 规则。CommandCode 保留原始 nominalCost，再按事件时间和已捕获 schedule 计算倍率；此转换保持幂等。例：nominal0.2，峰值 quota cost0.4，API-equivalent0.00029；谷值 quota cost0.2。二者含义分别保存，避免混成一个失去来源的 cost 字段。

## 6. B4 缺失、tombstone、rollback 与撤销

- complete+完整历史证据+同 scope+合法 parent+显式 replace 才能关闭旧 generation。强记录移除清单必须精确匹配被移除 anchors；弱记录在整个 session 实体上替换，不猜单条请求对应。
- partial/unavailable/failed、未知前缀、缺路径、半写和无历史证据的空结果均不切换当前集合。
- 有证据的空 generation 是限定会话的显式 tombstone；旧 generation 仍可重放，revision rollback 可恢复。
- v1 rollback 改 batch membership；v2 rollback 改 generation eligibility；撤销设备只拒绝后续设备请求，保留历史。已撤销设备连旧 batch 的重试请求也拒绝。
- 回执描述当次事务提交事实，重复 batch 原样返回；新视图还要核对 dataRevision/当前 generation。后续 Job 成功条件仍按正式计划 R4。

## 7. Owner 决策与下一步

**没有新增、必须立即交给 Owner 的产品政策选择。** 方案 A、七来源目标、保守 quarantine、v1兼容、v2冻结和显式审计操作均来自已批准附件。

剩余 B1 是证据能力缺口。推荐先完成持久 source lineage 与历史资格判定的隔离实验，使用本轮反例作为拒绝用例；实际来源仍缺充分证明时继续走已有审阅/冲突规则。只有 B1 也关闭后，才建议开始 Phase 1。该轮不修改原计划/调查/P0文件，不实施后续阶段。
