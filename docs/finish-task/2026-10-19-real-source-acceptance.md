# 真实来源验收：健康会话与 Auto-review 用量通过

最新状态（2026-10-20）：按用户补充，已确认 Auto-review 会话以 `codex-auto-review-unpriced` 提交实测用量，价格保持未知。本地隔离 r5 验收 454 条 / 57,624,007 Token，454 条缺价，价格 null，逐项记录及收据匹配，重复提交 sent=0。此前正常 Codex 63 条与 Antigravity 124 条的 187 条真实验收继续 PASS。两份开头缺失会话继续隔离，25,459,535 个缺失前缀 Token 不归日期；原日志、正式 state 和既有 359 基线未改。原 365 条 reset 调查已关闭，由用户确认的会话用途分类取代，不列入历史异常白名单。证据见 `output/r5-auto-review-acceptance.json`。正式 Agent 保持停止，发布 NO-GO。以下为历史阶段记录。

2026-10-19 23:11–23:16（Asia/Singapore）。用户授权推进真实来源验收。本轮仅执行原路径只读盘点、采集和候选检查；**真实上传0，尚未完成真实来源验收**。正式Agent继续停止，生产及正式state未修改，发布NO-GO。

历史359/359、差异0结果直接沿用；未遍历服务端历史lineage，未重新导出生产数据库。既有本地合成E2E25笔通过结果保留。

## 发现与暂停原因

严格模式 Codex 采集返回 `codex:COLLECTOR_INCOMPLETE`。只读诊断定位到2个会话开头历史不完整：采集器报告25,459,535个先前累计Token未分配到首事件日期，只计最后一轮usage。当前实现将该告警提升为整个Codex来源阻断，连完整会话也不输出。直接只读诊断仍能识别35个历史完整的会话。

旧已验收state `sync-agent-v4-prodcheck` 的 `allowIncomplete=true`，本次真实来源严格预检为false。没有沿用宽松标志或重新开启历史恢复；按遇到问题暂停的要求，在真实上传前停下。只读多来源预检在终止检查前已结束，诊断和候选保留。

本地正式state的心跳PID已不存活，原2项review未动。正式设备缓存授权为commandcode/claudeCode/zcode；本地隔离测试设备原有七来源授权保持不变，本轮没有扩权。

## 各来源当前证据

| 来源 | 只读发现 | 验收状态 |
|---|---|---|
| Codex | 文件有更新，但2个历史开头告警令严格来源采集整体阻断 | 阻塞，未上传 |
| CommandCode | 39个会话无基线之后的新usage；含EMPTY_USAGE_SKIPPED提示 | 等待真实新增 |
| Claude Code | 当前日志4行、assistant0、assistant usage0 | 等待一次真实助手回复 |
| Gemini CLI | 2个历史会话，无基线之后的新usage | 等待真实新增 |
| Antigravity | 9个含基线之后真实usage的原生会话；已选1个新会话，124条记录，最后usage为2026-10-19 21:12:48（本地） | 候选已准备，未上传 |
| OpenCode | 11个历史会话，无基线之后的新usage | 等待真实新增 |
| ZCode | 1个历史会话，无基线之后的新usage；含EMPTY_USAGE_SKIPPED提示 | 等待真实新增 |

候选选择读取原始home，由现有worker创建私有临时快照并保留原路径文件身份；不通过复制home伪造原始身份，不截取日志尾部冒充完整session。只选择usage时间晚于已验收state最后采集时间的会话，候选包含完整记录并通过既有 `qualifyRanges`。所有来源的原始prompt/日志正文未写入D盘报告。

## 证据与下一步

脱敏证据：

- `output/r5-real-source-inventory.json`
- `output/r5-real-source-preparation.json`（status=blocked，uploadPerformed=false）
- `output/r5-real-source-diagnostics.json`

标准化候选和运行目录指针仅保存在原私有验收目录内。新增预检脚本已改为遇到blocking issue立即退出，避免将阻塞来源标为“等待usage”。

后续应先为真实canary提供严格的完整会话选择，隔离两项历史不完整开头的影响，保持完整性检查；随后上传Antigravity和符合条件的Codex会话到本地r5，逐笔验证收据和Token增量。其余来源须在对应真实客户端产生新usage，不使用合成事件补齐真实覆盖；任何会发起付费请求的客户端操作应明确命令与范围后执行。正式Agent启动、正式授权和生产切换仍不在本轮执行范围。

## 本次会话策略修复后的真实验收

用户授权健康优先、损坏会话隔离后，修复已在本地代码实现，未开启allowIncomplete。会话诊断、持久隔离ledger、可靠区间恢复和明确outcome已补齐；两次以上观察不重复新增报警。详细语义和维护命令见 `docs/plans/2026-10-19-session-integrity-policy.md`。

仅向 `http://127.0.0.1:3305` 上传，先复核入口/Ready/测试身份/独立数据库及外网隔离均通过。选用两个原359基线之外的新scope，入队前要求服务端无head；独立state不复制或重写正式state。健康Codex来自原始home的严格快照；Antigravity复用预检时已冻结的124条真实记录。

| 来源 | 逐项匹配记录 | 服务端Token增量 | revision | 结果 |
|---|---:|---:|---|---|
| Codex原生健康会话 | 63 | 6,488,740 | 384→385 | passed；来源覆盖为partial_success，保留隔离 |
| Antigravity原生新会话 | 124 | 13,378,243 | 385→386 | passed；complete_success |
| 合计 | 187 | 19,866,983 | 两次独立提交 | 无重复event ID |

验收逐条比较服务端sync_current记录的全部规范字段、顺序、事件身份、时间和Token；核对本地/HTTP receipt、manifest、generation及每次revision+1。全库token_total前后差值分别等于预期，独立scope总量也一致。固定快照重复运行均sent=0/newTokens=0/reviewNew=0，Outbox为空，服务端revision/总量未再次增长。这是固定真实快照的幂等检查，未将活跃日志宣称为无新增。

两份开头不完整会话分别隔离24,959,374与500,161个前缀累计Token，合计25,459,535；不计入任何日期或批次。隔离原始会话ID、原因、影响范围、发生次数保留于私有ledger和codex-isolations.json。

另有1个会话触发CODEX_RESET_REVIEW，涉及365条记录；与主工作区 `output/v4-reset-exceptions.json` 的原3项逐ID比对，确认未在原清单。Token影响标为未知，不填0。该会话未上传，原始日志保留。按用户遇到新一致性问题暂停的要求，已停止进一步真实上传，没有重分epoch、rebase或修改历史例外。

脱敏总报告：`output/r5-real-usage-final.json`，status=`paused-new-isolated-reset`，verifiedCanaries=`passed`。报告包含私有证据目录位置，目录中的codex/antigravity-record-check.json保留逐条摘要与完整收据。正式state和v4专用已验收state的文件哈希在本轮前后一致；生产、正式授权、正式Agent及原359条基线均未修改，未重做359/359离线对账。

验证：新增15项会话策略回归、原17项Agent回归及10项loader/normalizer回归通过；Agent与Dashboard源码类型检查通过。代码仍在工作区待审阅，未提交或发布。

CommandCode、Claude Code、Gemini CLI、OpenCode、ZCode继续标记等待真实新数据。本轮没有为补覆盖主动调用这些客户端或生成合成usage。当前暂停点为新reset会话的独立审阅，发布保持NO-GO。
