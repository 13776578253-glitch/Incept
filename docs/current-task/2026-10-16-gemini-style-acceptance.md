# Gemini 样式改动验收与提交

## [2026-10-16 09:56] - Update by AI完成改动:

本轮验收 Gemini 现有的三个界面修复，提交范围为四个源码文件和本记录。

### 验收结果

- UI-BUG-01：共享 PasswordInput 隐藏 Edge 原生 reveal/clear 图标。Windows Edge 本地页面用无效测试文本检查，仅显示一个自定义眼睛按钮；点击后切换到 text，再次点击恢复 password，最后清空输入。未提交登录表单。编译后的 CSS 包含原生图标的 display: none 规则。
- UI-BUG-03：Owner 设置分区在中文显示“文档”，英文显示“Docs”。直接执行 schema 核查两个语言及 admin 可见性，访客均无 Docs 分区。
- UI-BUG-04：模型矩阵首列由 170px 扩为实际的 240px，最小宽度计算同步更新；内部文本使用省略号，外层保留完整模型名称 title。1280px 桌面和 390px 窄屏浏览器验收通过。窄屏矩阵在 297px 容器内横向滚动，内容宽 1260px；页面宽度保持在视口内。桌面十个名称列均为 240px，title 均与完整名称一致。

### 检查

- 设置面板及 renderer：8 项通过。
- 登录认证及 Owner 安全面板（含密码显隐）：16 项通过。
- Dashboard overview presentation：4 项通过。
- Web 两个修改文件 ESLint 通过。
- Web、Dashboard 类型检查通过。
- 提交前检查暂存范围和 git diff --cached --check。
- 浏览器截图保存在仓库忽略目录 `.scratch/gemini-style-acceptance-2026-10-16/`。

### 遗留问题

UI-BUG-01、UI-BUG-03、UI-BUG-04 本地验收完成，等待后续修复包部署。原记录中 UI-BUG-04 的 220px 为历史建议，本轮验收值为 240px。

UI-BUG-02 导入时的就地二次认证弹窗继续待办。七来源导入/导出、跨批次计费、README 及此前计划/上线验收文档保留各自工作区改动，待后续处理；导出费用丢失和索引/原始事件重复计数仍按下一步计划修复。

Commit 建议：`fix(ui): polish password visibility, docs label and model matrix`
