<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Code Management Specification (代码管理规范)

## 1. Strict Rules (核心约束规则)
1. **不可删除**：严禁删除、覆盖或清空此文档文件夹的历史记录。
2. **实时同步**：
   - 执行代码修改前，必须在此文档中确认逻辑正确性
   - 代码修改完成后，必须更新文档内 'current-task' 区域

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