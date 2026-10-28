# Phase 0B：Antigravity Review Lineage 审计

日期：2026-10-28（Asia/Singapore）。本轮只在只读审计副本和生产库只读连接上查询，没有写生产 DB、没有执行 review acceptance、没有修改冻结逻辑。

## 输入与状态

- Phase 0A app 镜像：`sha256:9f0d7f9f…`；app healthy，sync-maintenance `status` 为 ok。
- 审计副本：`/srv/incept/shared/sync/phase0b-audit.db`（由 `phase0a-20261028T031245Z.db` 派生）。`PRAGMA integrity_check` 为 `ok`，schema 2，data_revision 843，receipts 915，reviews 31，resolutions 31，adoptions 0，legacy batches 0。
- 生产库只读核对：`/data/sync/v4.db`。审计期间 data_revision 855，receipts 927，generations 914，manifests 927，reviews 31，未解决 reviews 0。
- 生产在审计期间从 Phase 0A 的 revision 852/924 推进到 855/927；新增的是正常 committed 观测，没有新增 review。

## Review #28–#31

`review` 命令只读取 `reviewPage(id, 0, 500)`，`hasMore` 仅表示第一页是否达到 500 条；实际成员数从 `sync_review_members` 读取。

| Review | Session summary | 命令结果 | 实际成员 | 后继 generation | 回执 | 当前状态 |
|---|---|---|---|---:|---|---|---|
| #28 | `6a1cbf11fd82` | 22，`hasMore=false` | 22 | `9b3c3af1…` | committed / owner-reviewed，rev 822 | e7 scope visible 祖先，后代 `f86d0e75…` 27 条 |
| #29 | `8603a4e3fc96` | 500，`hasMore=true` | 2974 | `ac8f8119…` | committed / owner-reviewed | 798 scope visible 祖先 |
| #30 | `8603a4e3fc96` | 500，`hasMore=true` | 2999 | `0d8206a7…` | committed / owner-reviewed | 798 scope visible 祖先 |
| #31 | `8603a4e3fc96` | 500，`hasMore=true` | 3021 | `7282b13f…` | committed / owner-reviewed | 798 scope visible 祖先；生产 head `507444be…` 3118 条 |

四个 review 的完整成员均通过以下核对：

- `sync_review_members` 数量等于 manifest `recordCount`；所有 observation 都存在。
- 用 `stableJson` 重算 review members 的 `sequenceHash`，与 manifest 完全一致。
- 成员 token 总和等于对应 `sync_generations.token_total`；event IDs/native keys 无重复，source/session 与 scope 一致。
- #29 → #30 → #31 → 生产当前记录是严格前缀扩展：2974/2974、2999/2999、3021/3021 条逐条相同；#28 → e7 当前 27 条也是 22 条严格前缀。
- 四个后继 generation 均 `rolled=0`，均在对应 scope 的 visible 祖先链上，均有 committed receipt。
- 生产当前 head 仍包含 #29–#31：`ac8f8119…`、`0d8206a7…`、`7282b13f…` 都在 798 scope 的 visible ancestry；生产 head `507444be…` 只是在其后追加正常 committed 代次。

## 全部 31 条 review 的分类

| 分类 | 数量 | 说明 |
|---|---:|---|
| `PREFIX_LOST` / accepted-successor | 22 | 全部在 visible 祖先链上，全部有 committed receipt，全部 `members` 和 `sequenceHash` 匹配 |
| `PREFIX_LOST` / dismissed | 8 | 无 committed successor；review 记录和成员保留 |
| `PARENT_MISMATCH` / dismissed | 1 | 无 committed successor；review 记录和成员保留 |
| 未解决 | 0 | `sync_review_resolutions` 覆盖全部 31 条 |

`sync_adoptions` 为 0，`sync_legacy_batches` 为 0；这些 review 不涉及 v1 adoption，不存在需要认领的 legacy 批次。

## PREFIX_LOST 的实际触发点

不是记录数变少。#28 的 parent 为 9 条、proposal 为 22 条；#29–#31 的 parent 分别为 2742、2974、2999，proposal 分别为 2974、2999、3021。记录数均未下降。

实际失败点是 Antigravity SQLite range 的 append proof：

- proposal 的 `previous.retainedRoot` 固定为 `635ba311…`；
- parent manifest 的当前 `root` 已经变化（#28 `0b140e34…`、#29 `ad164047…`、#30 `5a039946…`、#31 `1fd2cfca…`）；
- `qualifyRanges` 要求 `proof.retainedRoot === old.root`，因此返回 `PREFIX_LOST`（`contract.ts` 的 append/current 两个分支都会命中）。

`acceptReview` 不调用 `qualifyRanges`；它校验完整成员数、sequenceHash、记录级前缀/修订和 token 汇总后直接建立 successor。因此这些 historical acceptance 是“Owner 审阅 + 完整记录快照”路径，不是 byte-range append proof 路径。

## 可重放 / 不可证明

**记录级可重放：** #28–#31，以及全部 22 条 accepted-successor。完整记录在 `sync_review_members` / `sync_observations` 中，sequenceHash、token 总量和前缀连续性都可独立验证；后继 generation 和 receipt 已存在。若重建 ledger，可以从这些快照重放这四段历史，不需要重新运行 `qualifyRanges`。

**范围级不可证明：** 所有 `PREFIX_LOST` review 的 Antigravity append-range proof 都不自洽。`retainedRoot` 与 parent root 的链条无法从 ledger 自身闭合；只能证明“记录快照完整且 Owner 接受”，不能证明“字节区间是从 parent 按 append 连续增长的”。报告和后续工具必须显式记录这一例外，不能宣称 range-certified history。

**人工审阅覆盖不可证明：** #28 只有 22 条，第一页即全部；#29–#31 的 2974/2999/3021 条中，`review` 命令只展示了前 500 条，`hasMore=true`。完整 payload 的 hash 完整性已证明，但 Owner 是否实际看过尾部 2474/2499/2521 条，现有命令输出无法证明。若审计标准要求全量人工审阅，应补一份可分页的完整导出或 Owner 明确 attestation；否则只能声明“hash 完整 + 前 500 条已展示”。

**dismissed 的 9 条：** 没有 committed successor，不能作为正向历史直接重放；成员记录仍保留。要重新考虑只能新建 proposal/review，而当前 `PHASE0_ACCEPTED_REVIEW_CODES` 为空，acceptance 仍被冻结。

## 结论与建议

1. #28–#31 已经 materialize 在当前 visible history 中，不需要重新 accept；`resolve-review --accept` 现在会被 `REVIEW_ACCEPTANCE_FROZEN` 拒绝，`resolve-review` 对已有 resolution 也是 no-op。
2. 冻结继续保持。不要为了“让 review 变绿”而放开 acceptance，也不要用直接 SQL 改写 `sync_scopes`/`sync_generations`。
3. 如进入 ledger 重建，按记录快照重放 22 条 accepted-successor，并在审计记录中标注 Antigravity range proof 例外；不要重新用 `qualifyRanges` 判定这些历史 review。
4. #29–#31 若作为正式审计证据，需要补全量分页导出/attestation；当前 CLI 只能看第一页 500 条。
5. dismissed 的 9 条保持隔离/历史状态，不做自动重放；需要 Owner 重新审阅时再生成新 proposal。

本轮未修改生产 DB、未修改冻结逻辑、未执行 acceptance、未提交代码。
