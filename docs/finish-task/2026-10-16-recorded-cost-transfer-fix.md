# 原生记录费用导出修复

## [2026-10-16] - Update by AI完成改动:

前置提交已完成：`42356fc` 提交导入窗口内验证与历史展示；`78a1c48` 提交 README 精简、生产验收和后续计划。

执行前确认：通用原生 `usageEvent` 已根据有效 recordedCost 选择原始费用或费率计算，但未填写 costSource；导出器仅保留标记为 recorded 的非 Codex 费用。本轮在费用来源产生处补齐标记，保持现有费用计算、Codex 无原始费用字段和缺价规则。

验证要求：从真实格式 Claude JSONL、OpenCode SQLite 经采集、导出、校验、提交、重载，确认原始 $0.20 和零费用保留，缺失/非法费用不伪装为已知费用；按接收方费率估算的费用不受原始费用覆盖策略影响。

遗留问题：索引/原始事件重复计数与七来源发布配套按下一步计划继续处理，本轮聚焦记录费用丢失。

Commit 建议：`fix(dashboard): preserve native recorded costs in token exports`

### 修复与验证

- 在通用原生事件生成处按有效记录费用设置 `costSource: recorded / calculated`，导出器随后可按既有规则保留原始费用。
- 新增 18 项回归：Claude JSONL、OpenCode SQLite 的 $0.20 与零费用往返；缺失、负值和非法文本费用；导出估算费率与接收方重估；Codex 原始费用字段排除；五种通用采集来源的费用标记。
- 修复前新增 15 项测试中 9 项失败，明确复现 $0.20、零费用丢失与来源标记缺失；补齐来源标记后，扩充的 18 项全部通过。
- Dashboard 全套 163 项测试通过，Dashboard / Web 类型检查、本轮 ESLint 和 `git diff --check` 通过。
- 独立工具 `build:tools` 成功。打包后的 CLI 在隔离来源/接收目录中完成 export → preview → commit → history：两条记录共 260 Token，费用 `[0.2, 0]` 保留到导出文件及 SQLite 批次存储。

本轮费用修复留在工作区，等待与后续数据修复一起整理。此前 Gemini 的五个数据脚本/类型/测试文件改动保留，索引/原始事件身份问题和七来源发布配套继续待办。

## [2026-10-16 13:20] - Update by AI完成改动:

费用修复及现有 Gemini 数据脚本已提交为 `48a679a`；后续身份/费率/历史修复为 `b0132d9`，路由/检查器为 `1a29a92`。完整 Linux/amd64 候选通过 655 项测试及真实隔离导入、认证、回滚、TLS 和空目标恢复；进入配套发布评审。详情见 [自主修复包记录](./2026-10-16-autonomous-fix-release.md)。

遗留问题：线上仍需切换至配套接收端，再使用同版七来源工具上传。Commit 建议：`docs: record validated fix release and paired token tools`。
