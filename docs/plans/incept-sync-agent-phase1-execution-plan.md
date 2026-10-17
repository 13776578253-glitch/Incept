# Incept Sync Agent — Phase 1 执行计划（Phase 0C 准入修订版）

> 决策日期：2026-10-16  
> 状态：**Phase 1 开发准入：CONDITIONAL PASS；生产迁移/部署：未获授权**  
> 源码参考基线：`aef64f4`；执行前以当前工作树为准。  
> 上位计划：`docs/plans/incept-sync-agent-implementation-plan.md` 的 Phase 1、R1–R5。  
> 必读报告：`docs/research/sync-agent-phase0-decisions.md`、`sync-agent-phase0b-contract.md`、`sync-agent-phase0b-proof.md`、`sync-agent-phase0c-evidence.md`、`sync-agent-phase0c-proof.md`。

## 一、准入裁决与边界

Phase 0C 的 381 项通过、零统计差异与完整正反例使有限连续性规则具备实施资格。B1 被定义为 `baseline-observed`（第一次可信观察）和 `since-enrollment`（由已提交父版证明的连续观察），并非模型可追溯的绝对全历史。以下情形进入持久 quarantine/review，保持上一代数据可见：不明截断、弱身份旧点改写、来源切换、无可验证轮转、DB 替换、未支持压缩档案证据、Antigravity BLOB/alias 修改、Codex 计数 epoch/reset、rollback 栅栏。暂时读取失败可重试，不视为删除。

**授权仅限：本地源代码、测试、隔离 SQLite/构建产物、文档。** 不接触生产库、不执行生产迁移、不重启线上服务、不改 Caddy/Compose、不安装 Windows 常驻进程、不注册设备密钥、不开发 Phase 2–6。可以新增运行时模块，但应通过默认关闭的特性入口或未挂载的私有服务隔离，避免更改现有业务行为。

## 二、必须保持的数据契约

1. **身份/版本分离。** 逻辑 scope 为服务端已验证设备 ID、canonical source、source session namespace，另有 origin 绑定；强身份使用原始可验证请求键，弱身份/Codex 按 session generation 原子替换。行号、计数、时间、内容哈希不得伪装成修订稳定主键。
2. **父版与回执。** 每次自动变更必须核对服务端已提交的 `parentGenerationId`/`parentManifestHash`（CAS）；`batchId` 与 payload hash 绑定。成功提交后 batch/manifest/可见版本/审计/receipt/dataRevision 同一事务持久化；重试同 batch 同 payload 回原 receipt，换 payload 拒绝。
3. **有限来源资格。** 七来源及 fallback 的不变/普通追加有明确接受规则，强键 usage 修订仅在 0C 已证明的 envelope/时间/键约束下放行。Codex 原生累计点修订按完整 session 重新计算，严禁 100+120 双计。未证实轮转、压缩、缺失、修改不引发自动删除或替换。
4. **旧 v1 兼容。** `TransferBundle v1`、Preview/Commit、敏感操作门禁、已有批次和 rollback 的外部行为保留。旧 batch 原始 payload、receipt、顺序和 memberships 保留；显式 adoption 认领后，统一读视图对相同实体只采用一次，不能将 v1 与 v2 相加。人工/自动重合不能重复。
5. **计价语义。** legacy/native 保留现有 live override；v2 保存 captured pricing/aliases/schedule 版本，常规设备修订按已有 basis 重算；Owner 显式 reprice/映射变更必须有审计，保留 recorded、calculated、nominal、API-equivalent 的来源差异，未知报价不记为零。
6. **删除/回滚。** 消失不等于删除，只有具备完整连续性证据与明确替换意图、限定 scope 的新 generation 可关闭旧代；rollback 保留可审计支持关系；已回滚 lineage 不得被下次普通上报静默复活。
7. **验证信任边界。** 0C 的合成 raw capsule、服务端重放真实 collector、模拟认证是测试 oracle，**不得作为生产上传协议**。正式服务端校验结构、来源约束、已知父版和授权 scope；原始本地文件真实性以经过认证的受信设备采集器为信任前提，Phase 2 需完成真正设备鉴权。上传只携带必要统计事件、派生证据和最小元数据，不传原始聊天内容或原始日志全文。

## 三、Phase 1 分步工作包与阻断门槛

### P1-A：生产级类型与业务规则抽离

- 阅读全部报告及对应原始实现，先提供与最新仓库相符的实现映射；尊重已有修改和未跟踪文件，不覆盖研究原型。
- 在可供 Node 运行时导入的 domain/adapters 模块定义 v2 schema（包括字段、大小限制、版本、origin/manifest、scope、generation、batch、receipt、review/conflict），区分读取完整性和历史连续性。
- 从 0B/0C 原型**选择性移植规则**，不直接复制整套 oracle；建立 per-source acceptance adapter 与稳定单元测试。真实采集器调用优先复用现有 TS collectors。
- 强制拒绝伪造 `complete`、错误来源绑定、未知 parent、同批异 payload、缺少原生锚点的冒充强身份、隐式模型/价格修正。
- 完成后运行全部旧测试与 Phase 0/0B/0C 回归，专用编译通过，新增 lint 错误为零。**未过则停止后续 P1 包。**

### P1-B：隔离的 SQLite 规范化事件存储与可重放日志

- 新建增量 persistence/service（具体文件/表名以仓库约束为准）；与旧 `batches` 不冲突。设计 origin/scope、manifest、generation、observation、legacy membership、adoption/review、审计、batch receipt、dataRevision 的规范化表及索引，禁止以每五分钟全量 batch 大 JSON 的方式增长。
- 事件的当前可见状态与不可变历史分层存储；事务短、WAL、有限 busy 重试；一个 durable event log/版本账本可重建 projection。对于真正无变更的扫描，避免无意义的统计 revision 增长；如需保存观察检查点，明确与 `dataRevision` 的区别。
- 增量分块传输时，分页 stage 为不可见状态；验证完整 generation 与 `parent` 后才能一次性切换可见集合；部分分页、中断、超额/超时、非法顺序需清理或保留可恢复 staging 并给出状态。
- 固定 batch 同内容重传返回原 receipt；并发写入遵守父版 CAS，审计失败不能先暴露新视图。
- 所有 DB 操作写在隔离路径，禁止默认访问用户现有 `~/.incept/dashboard-imports.db` 或生产 `/data/dashboard/imports.db`。

### P1-C：v1 shadow 迁移、认领与统一只读视图

- 对 **复制出来的隔离 v1 DB** 做可重入 migration/shadow 回填；按旧 rowid/批次原始顺序、映射、captured pricing、rollback 状态建立不可变来源关系。原 DB 继续可用，迁移不删原表、不覆写 payload。
- 对可证明一对一且 scope/映射/价格一致的记录允许精确认领；无法确认的保留 legacy 可见并生成 `review-required`。必须提供明确受信 Owner 操作语义以授权 adoption、reprice、重新登记/epoch 和 rollback；本阶段可为未公开的 service API + 授权上下文测试桩，不提前开放未鉴权 HTTP 入口。
- 统一 `read model` 让已认领的 v1 引用与有效 v2 generation 只显示一次，未认领的 v1 保留旧 loader 语义（最早有效批次、弱转强桥接、native 优先）。不靠构建一份临时兼容 DB 再全量反序列化作为长期生产路径。
- shadow reader 与原 loader 在相同隔离数据集全对象比较：7d/30d/all 的 totals、costs、daily/monthly、sources、models、projects、sessions、峰谷/缓存/recorded/API-equivalent 字段；迁移与重建反复执行无额外重复。生产读路径的切换留给独立后续准入，不能在本地阶段悄然改变默认入口。

### P1-D：回归、故障恢复及容量验收

- 覆盖 0B/0C 证明的全部关键正反例，尤其：Codex 100→120；多点累计修订净量；Gemini 两世界；早于窗口但晚到的事件；v1 adoption/rollback；same-batch 100次；失 ACK；进程在提交前崩溃；transaction fault injection；SQLite writer contention；分页缺页；旧弱记录多对一；拒绝隐式 reprice；回滚栅栏。
- 进行 700/7k/70k/当前约15.7k 事件的隔离读写、内存、延迟和 DB 大小基准；用 288 个重叠批次证明查询不再出现按批次 × 全量事件次数线性膨胀。针对 768MiB app 约束记录峰值与安全余量，超标则优化/缩减单页；测试不能访问线上真实数据。
- 验证数据更新后快照通过持久 `dataRevision` 失效或确定的读版本约束生效；尚未引入远程 `Job`，不要伪造远程成功回执。
- 保留既有 36 条全量 Dashboard TypeScript 诊断基线，报告新旧诊断的 **逐行差异**；新增代码专用 TS、source/node TS、ESLint 和全量 Dashboard tests 不得退化。既有 Web/PG 环境缺口单列，不作为跳过新增覆盖的理由。

## 四、最终 Phase 1 验收和交付

**通过条件（须全部具备证据）：**

- 新增 v2 schema、来源规则和标准化存储可在真实运行时代码中调用（非仅在 `__tests__` 下）；受限于隔离 DB，不存在对现网隐式读写；测试 oracle 继续保留。
- 能独立完成：基线登记、受证据约束的追加、合法修订、冲突隔离、精确 adoption、回滚、显式 reprice、同批幂等和崩溃恢复。
- 旧手动 Import 与统一 read model 对照零统计差异；默认旧读路径和 Owner/TOTP 行为无退化。
- 批次分页上限、性能数据与最坏情况内存阈值具有可复现实测，查询不遍历全部历史 JSON 表示；`dataRevision` 不在未提交事务前对外可见。
- 全部旧 + 新 tests、专用 TS、源/Node TS、变更 lint 通过；既有 36 条老诊断无新增差异。
- 产生 `docs/research/sync-agent-phase1-proof.md`，含修改文件、接口/表结构、测试命令、准确对照、资源基准、已知限制、回滚方法、Phase 2 前置条件。

**停止条件：** 任何可信状态跨 scope/设备污染、旧数据双计、隐式价格变化、回滚复活、崩溃后可见半事务、证明之外的自动删除、无授权访问原始日志或生产配置，立即停止并报告最小复现，不以绕过断言或删除测试解决。

**后续边界：** Phase 1 全部验收后方可规划/执行 Phase 2 的设备身份与安全 HTTP 上报。Phase 3 常驻 Agent、Phase 4 Gateway、Phase 5 UI、Phase 6 生产上线继续独立授权。产品目标仍是 Windows 每 5 分钟采集、线上可远程 `Refresh now`；Docs/Music 保持原先按需上传策略。
