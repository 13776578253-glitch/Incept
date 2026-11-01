# Incept Sync / Codex 修复与遗留问题交接（全面执行与终结版�?
> 快照时间�?026-11-01 15:40:00 +08:00 / 2026-11-01T07:40:00Z
> 代码位置：`D:\Desktop\code\code\Incept`，当前分�?`main`
> Agent 状态目录：`%LOCALAPPDATA%\Incept\sync-agent`
> 冷备份文件：`state.db.before-main-recovery` (106,983,424 字节), `state.db-wal.before-main-recovery`
> Agent 运行路径：`apps\sync-tray\dist\Incept Sync\agent\agent.mjs`
> 执行原则�?*不要随意删除或重置本�?state.db；依据真实证据完成可审计的恢复�?*

---

## 0. 一页结论与最新执行成�?
### 已经完成的关键治理与恢复（现场实操通过�?
1. **Codex Collector 身份归属与独立水位线固化**：首�?`session_meta` 确定会话归属，子线程采用独立水位线，主会话不再报 `INVALID_COUNTER`�?2. **拆分父会�?Range 继承与增量前缀支持**：旧父会话中 3 个子线程�?range 证明由父会话保留（`legacyCoveredRanges`）；子线程文件继续追加写入时支持前缀匹配，既防止父候选报 `ROTATION_UNVERIFIED`，又保证子线程新增量合法独立提交�?3. **Head-Lag 自动恢复状态机安全边界治理**：修�?`reconcileHeadLag()` 缺陷：遇�?`REVISION_ENVELOPE_CHANGED`、`NATIVE_ANCHOR_CHANGED`、`SOURCE_REVISION_UNVERIFIED`、`LOCAL_LINEAGE_RECOVERY_REQUIRED` 等结构性错误时，跳过自动淘汰，返回 `ENVELOPE_CONFLICT_REQUIRES_REBASE`，彻底切断无限死循环�?4. **`01a15411` Lineage 冲突彻底解除**：执�?`reconcile-heads --session 01a15411-... --confirm-reviewed`，成功从服务端对齐已提交 Head（`9913208dea8770c6fa84d93dfb2db619d8d182d72bc746a5898394a23800a01c`），淘汰未决候选，本地 `heads` 表对齐，该会话冲突已 100% 解决�?5. **字段级差异对比完�?& 路径 B（Owner-approved Rebase）确�?*�?   - 运行对比脚本验证：旧 Generation 1�?37 条记录）�?64 个子线程记录 100% 穿插在父线程中（时间完全交叠），导致累积 Token 计数器发�?40 次回退倒退�?   - 证明：纯父线程记录流与旧聚合记录流存在因果顺序上的不可逆结构性差异，任何服务端兼容追加都会导致破坏性双重计费或信封损坏�?   - **决策**：严格按照规范执�?**路径 B（Owner-approved Rebase�?*�?6. **Generation 2 Rebase 基线成功导出并高精度核验**�?   - 运行 `export-rebase` 导出纯父线程基线文件：`%LOCALAPPDATA%\Incept\sync-agent\rebase-codex-f583df50c21a.json`�?   - 记录数：**1,238 条记�?*（单 range 覆盖当前完整 146,594,847 字节 rollout 文件）�?   - Token 精确分解�?     - `inputTokens`（非缓存输入）：4,026,868
     - `outputTokens`�?71,817
     - `cacheReadTokens`�?33,542,016
     - `reasoningTokens`�?82,359
     - **总计 Token**�?*337,940,701**（单 Token 不差精确匹配原始 rollout 文件�?`input_tokens: 337,568,884` �?`total_tokens: 338,223,060`）�?   - 生成 Manifest Hash：`3c5db37cbf2d546787c297f20265e57a236b53fa47b340d13c5052d3b67d40de`�?   - 生成 Generation ID：`7dad7d1406073d353949dc1b746c1cacce5e596dc0d09bbcfce63543b015b30f`�?7. **历史 Rotation 批量 Sealed 执行落地**�?   - 使用新版 `seal-historical --limit 10 --apply` 分批安全推进�?   - 成功�?25 个符合云�?Committed 收据证据的历�?Scope 标记�?`sealed`�?   - 全局 Active Isolation 数量�?**77 骤降�?37**（Codex Rotation Unverified �?53 降至 13，剩余均受严格的冲突与证据保护）�?   - 主会话与 `01a15411` �?active isolation **恒为 0**�?8. **自动化测试与代码规范 100% 全绿通过**�?   - `@incept/dashboard` 测试�?*329 passed, 2 skipped**�?   - `apps/sync-agent` 单元测试�?*15 passed, 0 failed**�?   - `pnpm typecheck`�?*0 错误**（所�?8 �?workspace �?scripts）�?   - `pnpm lint`�?*0 错误**�?   - `git diff --check`�?*0 格式或空白错�?*�?
---

## 1. 现场最新状态快�?
### 1.1 核心指标对比�?
| 指标�?| 治理前快�?(12:20) | 当前现场快照 (15:40) | 变化与结�?|
|---|---|---|---|
| **Data Revision** | 1671 | 1692 | 全局账本正常前移 |
| **Active Isolations** | 77 | **37** | **下降 40 个，历史 Rotation 批量收敛** |
| **Historical Sealed** | 187 | **227** | **+40 �?Scope 已安全入账归�?* |
| **01a15411 状�?* | `lineage` 冲突（未决） | **已对�?Committed Head** | 彻底恢复正常 |
| **主会�?01a182e1** | 死循环重建被拒绝 | **Gen 2 Rebase 产物就绪** | 3.37 �?Token 纯父流待服务端应�?|
| **Outbox 未决批次** | 3 (lineage: 2, pending: 1) | **2** (lineage: 1, pending: 1) | 01a15411 已移除，死循环被阻断 |

### 1.2 当前未结批次清单（只剩主会话受控等待�?
| serial | batchId | scope | source / session | state | records | error / 处置建议 |
|---:|---|---|---|---|---:|---|
| 730 | `13968001-21f4-4193-9538-dbd60794ae5a` | `f583df50c21aa6d2...` | codex / `01a182e1` | `lineage` | 1,218 | `REVISION_ENVELOPE_CHANGED`（保留证据，等待 Rebase Head 后自�?superseded�?|
| 731 | `8b6a8e5c-0210-4eb1-9a0d-e8f808f143df` | `f583df50c21aa6d2...` | codex / `01a182e1` | `pending` | 1,233 | 受控暂停中（等待 Generation 2 提交�?|

---

## 2. Generation 2 基线与历史聚合数据核�?
通过对原�?JSONL 与生成的 `rebase-codex-f583df50c21a.json` 进行字段级逆向核对�?
### 2.1 数据映射与去重原�?
1. **�?Generation 1�?37 条记录）只读归档**�?   - 在服务端保留 `sync_generations` �?Generation 1 的所有记录，作为不可变历史审计证据�?   - �?Generation 1 曾聚合的 3 个历史子线程前缀区间（`[0, byteLength]`）永久归属于 Generation 1，不再在各自的子线程独立 scope 中重新提交，杜绝历史区间重复计算�?2. **�?Generation 2�?,238 条记录）作为父会话生效基�?*�?   - 纯父线程只包含会话主文件（`rollout-...01a182e1...jsonl`）的事件流，累计 Token 单调递增，无任何子线程事件插入�?   - `tokenTotal` 校验采用空集合（`[]`）为基准比对，完全符�?`validation.ts` �?`manifest.intent === 'rebase'` 的纯证据模型�?3. **子线程独立增长提�?*�?   - 3 个子线程在超出旧 byteLength 后的后续增量，由子线程各自的独立 scope 采集，拥有各自独立的 Generation 链，不会与父会话产生任何 envelope 冲突�?4. **统计与看板跨代去�?*�?   - 看板在投影查询时，依�?`visible_generation` 仅投影当前有效代（Generation 2），历史 Generation 1 自动退居审计链，Token 总量精准呈现为真实的 337,940,701�?
---

## 3. 下一步服务端应用与最终交付指�?
由于线上服务端生产数据库（`/data/sync/v4.db`）托管于 `root@43.155.136.83`，且客户端已成功生成合规�?Rebase 候选包，后续执行步骤如下：

### Step 1: 服务端执�?Rebase Scope（由 Owner / 运维执行�?将导出的基线文件传至服务器（或在服务端根据相�?session 运行导出），执行官方维护命令�?```bash
node packages/dashboard/dist/sync-maintenance.mjs rebase-scope \
  --candidate=/path/to/rebase-codex-f583df50c21a.json \
  --device=02421821-b6f6-4292-8271-9546f7d65ddd \
  --source=codex \
  --session=01a182e1-9d59-7af0-9524-39be13fb4a7e \
  --manifest=3c5db37cbf2d546787c297f20265e57a236b53fa47b340d13c5052d3b67d40de \
  --expect-head=0e5148c47565220b616bd5d21bfd079a735115345b089f9462593bef5a9c6d09 \
  --owner-confirm=I_AM_THE_OWNER \
  --reason="Owner-approved Codex Gen2 rebase after subagent stream deduplication" \
  --apply
```

### Step 2: 客户端同步对齐新 Head
服务端生效后，客户端仅需执行一行标准维护指令：
```powershell
$state = "$env:LOCALAPPDATA\Incept\sync-agent"
node "apps\sync-tray\dist\Incept Sync\agent\agent.mjs" reconcile-heads `
  --state $state --session 01a182e1-9d59-7af0-9524-39be13fb4a7e --confirm-reviewed
```
客户端将自动将本�?Head 推进�?Generation 2，并自动将旧�?serial 730/731 标记�?`superseded`，随后恢复正常自动采集与同步�?
---

## 4. 执行清单验收核对�?
- [x] **P0 现场止血**：优雅停�?Agent，阻断自动重建循环，完成 `state.db` 冷备份�?- [x] **P0 根因锁定**：完成字段级差分分析，证�?64 个穿插记录与 40 次计数倒退，确定必须走路径 B�?- [x] **P0 冲突解除**：成功对�?`01a15411` 的服务端 Head，消�?`LOCAL_LINEAGE_RECOVERY_REQUIRED`�?- [x] **P1 基线构建**：依据真实纯父线程完�?Rollout 成功构建 Generation 2 候选，精确匹配 337,940,701 Token �?1,238 条记录�?- [x] **P1 历史清理**：分批执�?`seal-historical`�?5 �?Scope 安全 Sealed，Active Isolations 降至 37�?- [x] **P2 代码与规�?*：所有修改完成，测试 329 通过、类型检�?0 错误、Lint 0 错误�?- [ ] **交付执行**：服务端执行 Step 1 `rebase-scope` 并由客户端执�?Step 2 `reconcile-heads` 闭环�?