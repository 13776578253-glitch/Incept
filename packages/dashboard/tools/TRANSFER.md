# 跨机器 Token 导出与导入

另一台电脑安装 Node.js 24 LTS，将 `dashboard-data.mjs`、`export-tokens.cmd` 放入同一个可写目录，双击 `export-tokens.cmd`。Linux/macOS 执行 `node dashboard-data.mjs export`。无须安装本仓库或 npm 包。生成的 `token-export-*.json` 包含可读取的 Codex、CommandCode、Antigravity、Claude Code、OpenCode、ZCode、Gemini CLI 用量；不会发送任何网络请求。

采集目录：当前用户的 `~/.codex/sessions`、`~/.codex/archived_sessions`、`~/.commandcode/projects`。自定义用户目录可执行 `node dashboard-data.mjs export --home "用户目录" --label "电脑名称" --out "导出文件.json"`。输出文件不得已存在。设备 UUID 在该用户目录的 `.incept/token-device.json` 持久保存；请保留，以便增量导出时识别同一设备。

其他原生来源为 `~/.claude/projects`、`~/.gemini/tmp`、`~/.gemini/antigravity*/conversations`、`~/.local/share/opencode/opencode.db` 和 `~/.zcode/cli/db/db.sqlite`；原始记录不可用时读取 `~/.aiusage/cache.db` 的历史索引。原始文件恢复后优先读取原始记录。CLI 摘要列出全部七种来源及记录数。

新工具必须与支持七来源的服务器一起交付。旧服务器只接受 Codex/CommandCode 时，需要先更新服务，再导入新工具生成的包；不能仅替换工具后直接上传给旧校验器。新接收端继续兼容旧版两来源 v1 文件。

导出只包含用量、模型、时间、会话编号、会话标题、项目名称/路径和可读取的参考价格，不包含对话正文或认证配置。文件仍含个人路径与标题，按私有数据保管。校验和仅检测文件损坏，不证明文件来源可信。

在仪表盘电脑以 Owner 登录，点击「导入」，选择 JSON；检查新增/重复/冲突数量、模型和价格匹配。其他电脑的项目默认独立保留，需要合并时手动选择本机项目，重新校验后确认导入。有冲突不能提交。没有价格的用量仍可导入，费用继续标为未知。

每次导出都是完整快照，后续再次导出并导入会按原始事件编号去重，只累计新增事件。不会替换本机日志。导入后每 60 秒读取活动批次并结合本机采集；另一台电脑的新数据需再次导出导入，不会自动跨机器同步。

接收端兼容旧索引哈希和旧原始聚合哈希，仅在内容、费用和项目对应且候选唯一时桥接。多个独立请求具有相同时间和计数时，保留各自原生请求 ID；若旧索引无法唯一对应，预览显示冲突并阻止提交。不要通过修改 ID 或删除冲突事件绕过预览。

非 Codex 原始费用（包括 0）优先保留。未记录费用时优先使用接收方显式费率，再使用本批次参考费率；仍缺价时使用最新活动批次的参考目录。回退提供价格的批次后重新计算；缺失费率继续显示未知。

确认导入时若需要近期身份验证，密码与当前六位 TOTP 表单直接显示在本导入窗口中。验证成功后仅续接一次原提交，取消或失败保留文件和预览。网络中断后先重新校验，不自动重复提交。

## 历史与回退

窗口右侧历史独立滚动，最多展示最近十次；更早批次仍记录在数据库，可用下方 CLI 查看及回退。

在仪表盘仓库根目录：

```powershell
corepack pnpm dashboard:imports history
corepack pnpm dashboard:imports rollback <批次ID>
```

也可以直接执行 `node dashboard-data.mjs history` 和 `node dashboard-data.mjs rollback <批次ID>`。默认存储为当前用户 `~/.incept/dashboard-imports.db`；若网站运行用户不同，应使用相同用户，或传入 `--store "网站的实际数据库路径"`。网站和 CLI 均支持 `INCEPT_DASHBOARD_IMPORTS_FILE` 环境变量。

回退只停用指定批次，保留历史索引和回退时间。本机原始日志不变，其他活动批次共同持有的重复记录仍保留。刷新页面即可看到结果。再次导入已回退快照会产生新批次。

命令行也支持两阶段导入：`preview "导出文件.json"` 返回预览 ID，然后 `commit <预览ID>`。可用 `--mapping "映射.json"` 指定源项目 key → 本机项目 key，`null` 表示独立保留。预览 30 分钟有效；相关数据改变需重新校验。

## 本仓库构建便携工具

```powershell
corepack pnpm dashboard:build-tools
```

输出位于 `packages/dashboard/dist`。复制上述两个脚本和本说明即可在另一台电脑使用。
