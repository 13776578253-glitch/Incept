# 正式 state 副本迁移重演与待决项

2026-10-20，Asia/Singapore。状态 `prepared_pending_review`；正式 Agent 停止，发布 NO-GO。仅操作独立候选副本，正式 state、v4 专用 state 与原日志的前后指纹一致。

## 重演结果

- 旧正式 state 的 39 scopes / 39 receipts：39 个 same_head，未解决 head 0，receipt 冲突 0。
- 两批旧 review 共 72 条完整保存原 batch、records 和原因到归档；未置为 committed，未制造收据。
- Claude Code 67/67、ZCode 5/5 记录在既有 v4 副本中精确匹配，basis 与 manifest 均相同。只核对旧两批 review，未重做 359/359 历史对账或重新导出数据库。
- 独立 candidate 继承已验收 v4 快照，升级副本 schema，清理自身 remote jobs/commands 与旧心跳。固定 loopback 3305、remote=false、allowIncomplete=false、空采集 home，复用测试凭据和私有用途政策。
- 两源 Agent 通过只读实例检查均停止。原目录 state/WAL/SHM/config/DPAPI/log 前后指纹一致；未解密正式凭据。

脱敏报告：`output/state-migration-1792426923303.json`、`output/state-migration-review-coverage.json`。

私有候选、归档及详细证据：`%LOCALAPPDATA%/Incept/v4-acceptance-20261019/state-migration-REDACTED_ID`。重演脚本拒绝目标重叠、重复覆盖、设备不一致、生产 endpoint 及收据内容冲突；7 项迁移回归均通过。

## Owner 待确认的具体处置

建议确认两批旧 review 已由 v4 既有记录覆盖，继续保留完整归档，不再进入迁移候选的活跃上传队列；旧 batch 保持原审计状态，不伪造 committed。当前 disposition 仍为 `pending_owner_review`，正式 state 未执行迁移。

## 部署准备门槛

今日 00:24 远端只读预检：可用内存 1,088,188,416 bytes（约 1.01 GiB），低于 1.5 GiB 门槛。生产 v2 App/Caddy/gateway/PG 均 healthy；旧 staging 运行且共挂生产可写目录，旧辅助恢复 PG 已 exited/unhealthy。本轮没有停止或修改容器。

需先决定扩容或独立验收主机，再冻结种子卷填充和传输方案，单独申请远端部署。完整模板及保卷回滚见 `docs/plans/2026-10-20-production-preparation.md`。沿用 Plan A：迁移审阅与重演、独立远端验收、正式授权和 Owner 确认、迁移切换，最后才申请启用正式 Agent。
