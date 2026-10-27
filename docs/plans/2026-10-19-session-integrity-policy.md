# Agent 会话完整性与隔离策略

2026-10-19。原则：健康数据继续严格同步，损坏证据局部隔离，采集报告保留实际覆盖范围。全局 allowIncomplete 不启用；Agent engine 固定使用严格记录路径。

## 隔离与持久记录

Codex collector 以 sessionIntegrity 返回会话问题：OPENING_PREFIX_MISSING、OPENING_USAGE_UNCERTAIN、INVALID_TIMESTAMP、INVALID_COUNTER、MALFORMED_RECORD。真正无法读取来源的错误仍保留来源级失败。capture 对每个会话执行协议字段、时间、身份、去重、累计差值和候选校验；组内校验异常只隔离对应会话。原始日志仅只读，快照位于私有临时目录。

缺开头时保留原始累计量作为隔离影响证据，不把累计前缀转为事件。无 last_usage 的首个累计点仅建立锚点，不生成日期 usage。原始时间无效时不向 Agent 接纳记录使用文件 mtime。有效会话仍通过既有 header/record、manifest、前缀保留、receipt 和服务端 Token 校验。

隔离记录保存在独立state的 session_isolations 表，包含 source/sessionId/reason、影响时间、记录数、无法归属前缀 Token、locator 摘要、first/last seen、occurrences 与 active。相同source+session+reason只生成一次新增报警；重复观察更新计数与详情。健康修复后清除active，保留审计历史。未能找到的旧原点不自动标记已修复。

## 恢复规则

- 完整、可靠的会话在后续采集中可重新准入，原隔离审计保留。
- 对尚未有完整历史head的隔离会话，可显式设置 recoveryRanges 的 afterTimestampMs。只接纳原始时间严格晚于锚点、具有合法相邻累计 watermark 差值的 usage；时间/计数/格式等其他异常仍阻断该会话。
- 恢复范围的边界保存在私有 RangeProof 元数据，不改变线上wire contract。后续采集沿用同一边界，追加时验证旧前缀，重复采集保持相同事件身份。
- 已接纳完整会话的head不可改解释为截断范围；需要审阅的新谱系处理。此保护保持既有359条基线。完整恢复与新范围恢复均不允许补造缺失累计Token。

维护命令（仅指定独立state执行，本轮未对真实坏会话执行恢复）：

```text
node apps/sync-agent/dist/agent.mjs quarantine-status --state "<独立验收state目录>"
node apps/sync-agent/dist/agent.mjs recover-session --state "<独立验收state目录>" --source codex --session "<会话ID>" --after "<已核实锚点的ISO时间>"
```

recover-session 要求Agent停止、来源已授权、隔离原因可恢复且锚点已核实；不能绕过已有完整head保护。此命令只保存恢复策略，不会启动同步。

## 报告语义

| outcome | 含义 |
|---|---|
| complete_success | 接纳数据严格校验并成功同步，无隔离或阻塞 |
| partial_success | 健康数据可处理，同时有历史隔离或其他局部阻塞；即使本轮sent=0仍显示部分覆盖 |
| no_change | 采集完成、无隔离/阻塞且无新增提交 |
| source_failed | 整体读取失败、全部会话隔离或上传无法完成；全部损坏的run-once以非0退出 |

报告同时返回 sourceReports、quarantineNew、quarantineActive，并持久保存 lastCollectionReport。SESSION_ISOLATED 为局部告警；不自动升级为整个来源不可采集。被未核实轮换等阻断的新usage标为source_failed，不报无新增。

newTokens 为相对已确认会话总量的差值，uploadedTokens 为整批观测量。已确认总量存入lineage_tokens；旧state缺少该值时返回newTokens=null/tokenDeltaKnown=false，成功确认后可计算后续差值。不会把历史整批Token再次当作本轮新增。

## 验证与边界

15项新增策略测试覆盖：坏/好会话隔离、全部损坏、重复报警与重启、跨日期前缀、有效区间与parent恢复、旧head保护、新健康会话增量、异常时间/JSON/counter/协议字段、修复后审计保留、Token差值及旧state未知量、未核实轮换状态。另有17项既有Agent回归、10项loader/normalizer回归及Agent/Dashboard源码类型检查。

真实本地 r5 验收见 `docs/finish-task/2026-10-19-real-source-acceptance.md`。最终回归为 Agent/迁移 45 项、loader/normalizer/purpose 15 项通过，Agent 与 Dashboard 两组源码类型检查通过。生产未修改，正式 Agent 停止，发布 NO-GO。

## Auto-review 用量与缺价政策（2026-10-20）

Auto-review 接纳用量，不按免费模型处理。可靠分类来自精确模型标识或用户已确认用途的精确 session ID；私有 `autoReviewSessions` 政策文件保存会话清单，仓库不硬编码真实 ID。普通模型名和 counter reset 均不是用途识别依据。

已确认会话使用原始合法时间和 `last_token_usage` 的实测逐调用量，重复 total+last 快照去重；缺少独立 usage、非法时间或计数仍隔离。实测差值构造本地单调累计后继续执行协议和收据严格校验，不将原始累计前缀分配到任何日期。普通 Codex 沿用累计/reset 校验；全局 allowIncomplete 不开启。

模型统一标记 `codex-auto-review-unpriced`，rates 为空、missingPricing=true、apiEquivalentCost=null；内部数值 cost 占位不视为已定价免费，旧录入价格也不作为该用途的可靠价格。原 r5 镜像保留，新增模型名已在其运行时验证为缺价。454 条真实用量本地验收、逐记录/Token/收据一致，重复上传为零；两份原始开头缺失会话保持隔离。
