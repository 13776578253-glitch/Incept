<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Docs Directory Index (文档目录索引)

标记：`(A)` 为 AI 优先，`(R)` 为人读优先，`(R/A)` 两者兼顾。Moved here from the former
`docs/.md` on 2026-09-23, and corrected against the tree as it now stands.

| 目录 | 读者 | 回答什么问题 |
| --- | --- | --- |
| `NEXT.md` | A | 现在活跃的产品任务是什么（只列活跃项） |
| `BACKLOG.md` | R/A | 源码 TODO 的唯一清单 |
| `current-task/` | A | 现在在做什么 |
| `plans/` | R/A | 大计划缓冲区（**仅主控写**）：已评审、尚未拆成任务的大型计划 |
| `finish-task/` | A | 以前做完了什么 |
| `runbooks/{en,zh}/` | R/A | 具体怎么操作 |
| `decisions/{en,zh}/` | R | 为什么这样定 |
| `history/dbml/` | R | 历史 schema 快照 |
| `history/decisions/{en,zh}/` | R | 已被取代的决策文档 |

`history/` 只放历史参考。它**不再**包含 `plans/`：计划是大计划缓冲区，位于 `docs/plans/`，
与 `current-task/` 同级。被取代的计划在成果被记录后删除，不归档。

`plans/` **仅由主控书写**。worktree（功能 AI）不得写入：它的计划写在任务已经确定之后，且
出自可能误读任务的同一个 AI，因此结构上抓不到这种误读。必须在执行前存在的计划属于主控，
在交接时记录，而不是执行之后补写。worktree 各自的计划放在该 worktree 自己的 `.agents/`
（已被 gitignore），随 worktree 一并销毁。

反过来，**worktree 刻意未做或受阻的条目必须写进 `BACKLOG.md`**。验收只看 git（工作树是否
干净、领先基点多少、能否无冲突合并），不看 AI 自述；不落进仓库的待办会随 worktree 一起消失。

两个已退役的位置，不要重新创建：

- `docs/modules/` —— 已删除。子系统的当前结构属于 `decisions/`（稳定规则）、`runbooks/`（操作流程）或 `NEXT.md`/`BACKLOG.md`（待办），不存在"描述模块现状"的独立目录。
- `history/plans/` —— 已取消。计划不再是历史类别。

# Code Management Specification (代码管理规范)

## 1. Strict Rules (核心约束规则)
1. **不可删除**：严禁删除、覆盖或清空此文档文件夹的历史记录。
   - **适用范围**：本条约束的是 `docs/` 内的历史记录——任务记录（`current-task/`、`finish-task/`）、决策文档（`decisions/`、`history/decisions/`）、运行手册与 schema 快照。
   - **不在约束范围内**：目录结构本身（如已退役的 `modules/`）、已被取代且成果有记录的工作草稿（如旧 plan 文件），以及**仓库所有者本人明确要求删除的内容**。
2. **实时同步**：
   - 执行代码修改前，必须在此文档中确认逻辑正确性
   - 代码修改完成后，必须更新 `docs/current-task/` 中的任务记录（即本 `docs` 文件夹下的 `current-task` 区域；`READAI.md` 自身不存放任务记录）
3. **生成物不入 docs**：禁止把 skill 自动生成的 HTML/SVG/PNG 等产物（讲解页、ER/结构图导出、对照页面、工作区快照页等）写入 `docs/`（含 `current-task/`、`plans/`、`finish-task/`）。
   - 这类产物一律放仓库根的 `.scratch/`（已被 `.gitignore` 忽略），沿用其子目录命名风格，如 `.scratch/auth-schema-2026-10-14/`。
   - 需要长期保留的结论必须写成 Markdown，人工确认后再手工放进 `docs/`；禁止把生成目录整体移入，也不得让 `docs/` 内出现指向生成文件的相对链接。

## 2. Push Rules (推送规则)
### 2.1 注释需求
- 禁止修改文件内的任何注释内容
- 如果存在错误，向我报告再修改
- 生成代码时默认携带

### 2.2 修改需求
- 对现有代码尽可能做最小侵入式修改，避免大段重构
- 禁止整文件替换代码，如需大规模重构需先制定计划并分步执行
- 单次修改禁止大量重构代码，仅处理核心逻辑
- 若出现缓存命中失败或上下文错乱的情况，立即停止代码生成并等待进一步指示

### 2.3 提交需求
- 生成的新内容及大功能修改，统一存放至 `current-task` 目录
- 输出内容需遵循「3. 提交样式」的格式要求
- 所有内容均以追加方式存储，禁止覆盖原有内容
- 当界面内容条目超过20条时，自动将相关task迁移至 `finish-task` 目录

## 3. Commit Summary Rule (提交摘要规则)
### 3.1 提交信息格式
- [YYYY-MM-DD HH:mm] - Update by AI完成改动:
- 修改了 ... 逻辑，实现了 ...
- 遗留问题: ...
- Commit 建议: [type]: [功能名称] 实现 ...

### 3.2 Commit Type 
| Type        | Description                                     | Corresponding Scene / Directory |
|-------------|-------------------------------------------------|---------------------------------|
| feat        | Add new features                                | New items in roadmap/           |
| fix         | Bug fixes                                       | Debug records in ai-context/    |
| refactor    | Code structure and logic optimization           | No specific directory           |
| milestone   | Project milestone                               | Used with roadmap updates       |
| exp         | Experimental content                            | Recorded in scratchpad.md       |
| anchor      | Snapshot before large-scale refactoring         | No specific directory           |

<!-- END:nextjs-agent-rules -->