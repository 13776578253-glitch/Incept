# Incept 重构后的 P2 执行计划（新 P0 / 新 P1 / 新 P2）

- **定稿时间**：2026-11-28 18:29 UTC+8
- **背景依据**：[collectors-week-evidence.json](../../.scratch/collectors-week-evidence.json)、[collectors-week-model-matrix.csv](../../.scratch/collectors-week-model-matrix.csv) 及本机 `~/.claude/projects` 核查。

---

## 已对齐的核心决策

1. **补充调查范围**：仅定向扩查 **Codex 全历史 116 个隔离会话**（`ROTATION_UNVERIFIED: 105`、`PREFIX_LOST: 6`、`OPENING_PREFIX_MISSING: 3`、`MALFORMED_RECORD: 2`）以及 **11 月 28 日当天增量**；其余 7 个来源全量隔离数均为 0，不再全量重扫。
2. **协议与数据修复边界（分层治本）**：
   - **同路径指纹漂移**（如 `8478030ffc24`：路径一致、`sessionAnchorHash` 一致、完整旧字节前缀 100% 吻合，仅 Windows `st.dev/st.ino/st.birthtimeMs` 变化）：修复 [capture.ts](../../packages/dashboard/src/agent/capture.ts)（`buildCandidate`）与 [contract.ts](../../packages/dashboard/src/adapters/local/imports/sync/contract.ts#L152-L171) 的协议不对称，允许文本日志源（`codex` / `claudeCode` / `geminiCli` / `deepseekHarness`）在同路径下满足「同锚点 + 完整旧字节前缀」时以 `rotation` 自动续传，彻底杜绝未来复发。
   - **父子文件归属拆分**（如 `6a9be12c6ea0` 及同类旧版父子混算会话）：保持协议对「无故少文件」的严格拦截不放松，走受控 `rebase-scope` 迁移并补齐 Agent `reconcileHeads` 对未入 outbox 隔离会话的血缘对齐。
3. **已入账子会话防重口径（同批原子拆净）**：
   - 父会话执行 `rebase-scope` 剥离旧子文件并补齐父增量；
   - 紧接着让对应子会话（如 `gpt-6.1-terra` 的 `781f4c4a2073` / `e7d3eb2b8f71`，共 15 条 / 3,137,795 Tokens）作为独立 scope 正常入账；
   - 预演与正式验收均须证明：旧记录无丢失、子会话 15 条精确一出一进（净差 = 0）、重复运行净新增 = 0。
4. **消灭「静默隔离」（全链路显式上报）**：
   - 修复 `capture.ts` 中 `unattributedTokens: 0` 硬编码，计算真实的 `blockedTokens`（五类 Token 之和）、涉及模型列表、最早/最晚未入账时间、原因码与最近已确认版本；
   - Agent 每次采集（含后台定时与手动触发）持久化上报脱敏完整性摘要至服务端，并同步写入本机 `status.json`；
   - Owner Dashboard「诊断清单」与顶部同步气泡拆分 **设备在线 / 采集完成 / 提交前隔离** 三态，托盘与 `production-monitor.mjs` 同步感知。
5. **执行顺序与 Claude Code 口径归类**：
   - 先落地 **新 P0（扩查 + 协议修复 + 受控回补）** → **新 P1（采集完整性显式上报与 UI/监控暴露）**；
   - Claude Code 的 `output_tokens_details.thinking_tokens` 拆解到 `reasoningTokens`、`cost-state` 内部辅助调用差额诊断（如 `ai-title` 多出 27.8K），以及核对 11/28 ~100K `k3.1-pro` 测试落盘目录，归入紧随其后的 **新 P2**（与缺价重测、模型映射、Kimi 接入一并收尾）。

---

## 分阶段执行清单

### 新 P0 · Codex 116 条隔离扩查、协议修复与受控回补

- [ ] **P0-A 定向扩查（只读）**：对本机 Codex 116 个隔离会话 + 11/28 当天增量做全历史归类与差额核对（分为：同路径指纹漂移 / 父子拆分 / 其他 `ROTATION_UNVERIFIED` / `PREFIX_LOST` / `OPENING_PREFIX_MISSING` / `MALFORMED_RECORD`），输出精确脱敏清单。
- [ ] **P0-B 协议层修复**：
  - 修改 `buildCandidate`（[capture.ts](../../packages/dashboard/src/agent/capture.ts#L199-L215)）与 `qualifyRanges`（[contract.ts](../../packages/dashboard/src/adapters/local/imports/sync/contract.ts#L149-L176)）：当 `locatorHash === old.locatorHash && identityHash !== old.identityHash` 且为文本日志源、旧前缀 `retainedRoot === old.root && retainedBytes === old.byteLength` 且 `sessionAnchorHash === old.sessionAnchorHash` 时，标记 `change: 'rotation'` 并允许通过连续性验证（补齐单测，同时确保前缀不符或无锚点仍严格拒绝）。
  - 扩展 `reconcileHeads`（[review.ts](../../apps/sync-agent/src/review.ts#L32-L51)）支持对 `lineage` 中未入 outbox 的指定隔离会话与服务端 rebase 后的 head 对齐，并在 `observeSessionIsolations` 清理已不再触发的过期 reason。
- [ ] **P0-C 隔离副本预演与线上回补**：
  - 在生产 `v4.db` 隔离副本上跑通全套预演（`6a9be12c6ea0` 及扩查确认的父子拆分会话同批原子拆净 + `8478030ffc24` 及所有指纹漂移会话自动续传），核对五类 Token 净差、自然日分布及幂等重复运行（净新增 = 0）。
  - 同步评估并闭环仍开放的 `#44` Antigravity `PARENT_MISMATCH`（407 条已在库复核）；S01/S03 保持隔离。
  - 验收通过后按维护窗口落地生产并推进账本水线。

### 新 P1 · 消除静默隔离（全链路采集完整性可见性）

- [ ] **P1-A Agent 完整性统计与上报**：
  - `capture.ts` / `engine.ts` / `state.ts` 记录真实被拦截记录数、`blockedTokens`、模型列表、`earliestAffectedAtMs`、`lastAffectedAtMs`、`lastConfirmedRevision` 与原因码；
  - `snapshot.ts` 将活跃隔离汇总（数量、未入账 Token、主要原因）写入 `status.json`，更新 `sync-tray` 弹窗明确提示；
  - 新增 Agent → Server 脱敏完整性上报端点（持久化设备最新采集完整性报告，不含原始会话内容或本地绝对路径）。
- [ ] **P1-B Owner Dashboard 与监控接入**：
  - `devices/status` 返回每个设备的在线态、最近采集态、已确认账本版本与提交前隔离明细；
  - Owner Dashboard 诊断清单与顶部状态气泡拆开「设备在线 / 采集完成 / 提交前隔离（模型、受影响会话摘要、最早未入账时间、最近确认版本、原因）」；
  - 扩展 `production-monitor.mjs` 支持可选隔离告警门槛。

### 新 P2 · Claude Code 口径、模型映射缺价与 Kimi 接入

- [ ] 核对 11/28 ~100K `k3.1-pro` 测试落盘目录；修复 `claude.ts` 的 `thinking_tokens` → `reasoningTokens`（保持总输出守恒）并增加 `cost-state` 内部辅助调用差额诊断展示。
- [ ] 在恢复后的最新全量账本上重测模型映射与缺价（Antigravity Worker / Orchestrator 别名、Claude 缓存写费率、`k3.1-pro` 费率，诊断清单区分缺费率 / 缺分项 / 政策排除）。
- [ ] 待 Kimi Code Desktop / CLI 真实会话落盘后接入共享采集器并完成去重回放测试。
