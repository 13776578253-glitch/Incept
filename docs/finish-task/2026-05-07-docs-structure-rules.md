[2026-05-07 17:10] - Update by AI完成改动:
- 为 `docs` 建立了新的双语目录骨架，用于后续的人读文档分类与翻译。
- 新增 `docs/INDEX.md`，正式约束 `current-task`、`finish-task`、`runbooks`、`decisions`、`modules` 的职责与双语规则。
- 保留现有旧目录与旧文档不动，避免破坏历史上下文，后续采用渐进迁移。

## 本次新增目录

- `docs/runbooks/en/`
- `docs/runbooks/zh/`
- `docs/decisions/en/`
- `docs/decisions/zh/`
- `docs/modules/docs/en/`
- `docs/modules/docs/zh/`

## 结构规则结论

- `current-task/` 与 `finish-task/` 主要服务 AI 上下文与任务归档
- `runbooks/`、`decisions/`、`modules/` 主要服务人读文档
- 人读文档后续采用 `en/` 和 `zh/` 平行目录
- 旧文档不删除，只做渐进式迁移

## 当前状态

- 新目录骨架已经准备好
- 根目录索引规则文档已经建立
- 下一步可在另一个窗口继续做翻译与迁移，不必占用当前开发上下文

遗留问题:
- 现有核心稳定文档还未迁移到 `en/zh` 新目录
- 旧目录中文档与新目录之间还未建立一一对应关系

Commit 建议: docs: add bilingual docs structure and root index rules
