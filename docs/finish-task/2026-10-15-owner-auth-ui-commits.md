# Owner 认证、账户界面与本地工具提交记录

## 范围

2026-10-15 用户授权提交本会话最近几轮改动。分支 `codex/production-readiness`，本轮起点为 `e91a95f`。按认证逻辑、账户界面、本机工具与手册、占位设置清理拆为四个本地提交。

| 顺序 | Commit 标题 | 内容 |
| --- | --- | --- |
| 1 | `feat(auth): add risk-based Owner sign-in` | 可信设备与风险分流、快捷登录的近期认证隔离、挑战 Cookie 期限、8 字符密码约定、认证测试和验收脚本类型适配 |
| 2 | `feat(settings): polish Owner login steps and security dialogs` | 固定三步与免验完成动画、恢复码弹窗、密码可见按钮、自定义校验、全宽改密面板及中英文提示精简 |
| 3 | `feat(auth): add encrypted local Owner setup and Aegis guide` | Windows 用户加密的本地凭据生成／查看／续发／核验工具、拒绝误操作测试、完整 Aegis 手册 |
| 4 | `chore(settings): remove unused model settings placeholder` | 移除 AI 空壳设置，记录 scratch 清理、路由盘点及 Owner 只读核查结论 |

## 验证

- 提交前认证、账户、设置渲染测试：6 个文件，36 项通过。
- 本机工具拒绝误操作测试：4 项通过。
- 真实 PostgreSQL 隔离认证验收：本轮实现此前已完成 28/28，库名及所有者由运行器核对。8 字符密码改密、新密码登录及旧会话撤销均通过。
- Web 类型检查及本轮 Web 文件 ESLint 已通过。前轮全仓类型检查亦通过。
- 每个提交暂存区单独核对文件清单，并执行 `git diff --cached --check`。
- `.scratch` 加密凭据、HTML、截图及临时脚本均保持忽略。

## 其他工作区内容

README、docs/assets 及正在独立推进的 Dashboard 用量审查代码和一次性脚本保留在工作区，不混入本轮提交。四个待审独立页面保留原状；正式发布包与线上环境未变更。

各提交哈希以本分支 Git 日志为准。本轮仅本地提交。
