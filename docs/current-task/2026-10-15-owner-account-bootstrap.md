# 本地 Owner 账号固定与手机验证器绑定

## 本轮范围

用户要求固定 Owner 账号，补齐安全的凭据生成和 TOTP 绑定，并选择手机验证器。仅处理本机站点，不修改线上服务器、前端样式或权限策略，不构建发布包。

## 工具

- `scripts/owner-local.ps1`：Windows 本地凭据准备、交互显示、设置码续发和状态检查。
- `scripts/owner-local.mts`：受控调用既有账号初始化与恢复逻辑。只接受 loopback 主机上的 `incept` 数据库，并查询实际库名核对。
- `scripts/owner-local.test.mjs`：验证拒绝未确认重置、远程及错误数据库，以及拒绝向重定向输出解密凭据。

密码来自系统加密随机源，32 字节随机值编码为 43 字符。工具只通过子进程 stdin 传递密码，不放入命令行参数、URL或报告。账号沿用现有用户名；本机现有用户名为 `owner`。

初始化材料保存在忽略目录 `.scratch/owner-local-private/account.dpapi`，使用当前 Windows 用户的 DPAPI 加密。目录关闭继承，仅当前用户与 SYSTEM 可访问。修改数据库前先持久保存加密密码；重复准备拒绝覆盖材料。该文件不是可跨机器恢复的备份，凭据应另外保存到密码管理器。

重置复用 `initializeOwner`：更新密码哈希、递增凭据版本、撤销旧 Owner 会话、可信设备、挑战及许可，清除旧 TOTP 和恢复码，签发 20 分钟一次性设置码。不改 Pro 授权或内容。

## 本机使用

在项目目录的自用 PowerShell 7 终端执行，不把显示的内容粘贴到聊天或报告。

```powershell
pwsh -NoProfile -File .\scripts\owner-local.ps1 -Action Show
```

打开 `http://localhost:3000/zh/settings?section=account`，输入账号和密码，再填写设置码。绑定页生成独立随机 TOTP 密钥；在手机验证器选择手动添加、基于时间、6 位、30 秒，并填写该密钥。使用手机生成的动态码确认后，服务端才保存加密 TOTP、签发会话并显示 8 个一次性恢复码。保存恢复码；需要时勾选信任当前浏览器。

本机工具不保存 TOTP 种子、不替手机生成登录动态码，也不注入 Owner Cookie。

若设置码超时且尚未绑定验证器，执行下列命令续发，再运行 Show。旧设置码和未完成绑定挑战失效，密码不变；绑定完成后续发会被拒绝。

```powershell
pwsh -NoProfile -File .\scripts\owner-local.ps1 -Action Refresh
```

只读检查账号、密码匹配和绑定状态，不创建登录会话：

```powershell
pwsh -NoProfile -File .\scripts\owner-local.ps1 -Action Check
```

恢复时由本机受控工具或服务器 SSH 下的 `pnpm auth:owner reset --confirm` 操作。Windows 工具只支持当前本机站点，不能连接生产数据库。不要把本机密码或 TOTP 直接同步为生产账号凭据。

## 自动检查

- 新工具负面测试 4/4 通过。
- Windows 当前用户 DPAPI 加密解密往返通过。
- 脚本 TypeScript 类型检查与 PowerShell 语法检查通过。
- `git diff --check` 通过。

真实手机绑定与浏览器 Owner 登录需要用户确认；工具测试不代替该验收。

## [2026-10-15] 本地执行结果

已通过 `Prepare -ConfirmReset` 固定本地 `owner` 密码，并加密保存一次性设置材料。只读 `Check` 确认密码匹配、TOTP 尚待绑定、有效 Owner 会话 0、有效可信设备 0。没有输出密码、设置码、TOTP 种子或 Cookie。未修改线上账号、推送、部署或提交 Git。
