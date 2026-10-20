# Incept Sync Tray

Windows 托盘客户端，用来查看和控制已绑定的 Incept Sync Agent。托盘只调用现有
Node Agent 的命令并读取 `status.json`，不重复实现采集、上传、鉴权或定时逻辑。

## 目标环境

- Windows 10 1803+ 或 Windows 11，x64。
- Node.js 24.15–24.x 在 `PATH` 中（Agent 运行时依赖，托盘不打包 Node）。
- 不需要安装 .NET 运行时：exe 用 Windows 自带的 .NET Framework 4.8 构建。
- 需要先完成设备绑定（`windows\Bind.ps1`）。

## 快速开始

```powershell
Expand-Archive .\incept-sync-tray-win-x64.zip -DestinationPath C:\Incept
cd C:\Incept\Incept Sync

# 首次使用：绑定设备，Token 走隐藏输入
.\windows\Bind.ps1 -Endpoint 'https://your-domain' -EnableRemote

# 双击启动，或：
.\InceptSync.exe
```

托盘启动后会：

1. 读取 `%LOCALAPPDATA%\Incept\sync-agent\status.json` 显示状态。
2. Agent 未运行时，用现有 supervisor 启动（`node agent.mjs supervise`）。
3. Agent 已运行时直接接管显示，不会启动第二个实例。

## 托盘菜单

左键或右键点击托盘图标，打开状态卡片：

| 区域 | 内容 |
| --- | --- |
| 状态 | 正常运行 / 上传中 / 已暂停；异常时显示需要处理 / 未运行 |
| 信息 | 上次同步、同步间隔、待上传批次 |
| 立即同步 | 调用 `agent.mjs sync-now`，不阻塞界面 |
| 打开 Incept Dashboard | 用默认浏览器打开绑定时的 Endpoint |
| 暂停 / 恢复同步 | 写入持久标记，Agent 重启后仍然生效 |
| 查看日志 | 打开状态目录下的 `agent.log` |
| 设置 | 设备 ID、端点、状态目录、登录自启开关、外观主题 |
| 退出 Incept Sync | 询问“仅退出托盘”或“停止 Agent 并退出” |

图标使用提供的高清资源：正常运行（绿）、上传中（黄色 8 帧动画）、已暂停（黄）、
未运行（灰）。需要处理时增加红色提示角标。上传动画每 120ms 切换一帧，
其余状态停止动画。打开的卡片会每秒更新状态、时间和计数。

卡片与弹窗采用紧凑尺寸，在 150% 缩放下状态卡片为 454×542px，宽度与
Docker Desktop 默认托盘菜单接近。设置页为 655×542px，退出弹窗为 554×265px。

左键、右键与第二次启动唤出都以托盘图标为锚点，卡片固定在图标左上方展开，
右边缘对齐图标右侧。接近屏幕边缘时夹紧到所在屏幕工作区，不再跟随鼠标。
Shell 暂时无法返回图标位置时复用最近锚点；首次无锚点时回退到主屏工作区右下。

## 外观

设置页提供“跟随系统 / 浅色 / 深色”，切换后立即更新卡片和弹窗。
选择保存在状态目录的 `tray-settings.json`，下次启动自动恢复；默认跟随系统。
跟随系统时自动响应系统明暗变化。

按钮统一采用无彩色描边的圆角实心样式，保留绿色与蓝色配色。
浅色模式采用柔和底色，深色模式采用深绿、深蓝底色与浅色文字。
“完成”使用绿色，“取消”使用中性灰色，其他操作使用蓝色；停止操作保留明确文字。
主题选择采用轻量分段控件，仅选中项显示中性圆角底色，未选中项显示文字。

服务器状态监控提议与桌面验收截图已单独归档，未纳入运行时交付。

## 登录自启

默认不注册任何登录项。打开“设置”，勾选“登录 Windows 时启动托盘”，
会在当前用户的启动文件夹创建一个快捷方式。取消勾选即删除。
该操作不需要管理员权限，也不会修改现有 Agent 的计划任务。

## 退出与卸载

- **仅退出托盘**：托盘进程结束，Agent 继续在后台同步。
- **停止 Agent 并退出**：先发送 `stop`，再退出托盘。outbox 与凭据保留。
- 卸载：删除整个目录即可。若开启了登录自启，先在设置里取消。

## 安全边界

- 托盘不读取、不显示、不传递设备 Token；Token 仍由 `Bind.ps1` 通过 stdin
  写入 DPAPI。
- 托盘只执行固定命令 `status / sync-now / pause / resume / stop / supervise`，
  没有任意 Shell 入口。
- 不监听网络端口。托盘与 Agent 之间只用本地文件与命名管道（单实例激活）。
- 状态文件 `status.json` 只包含计数、时间戳与错误码，不含凭据或回执。

## 构建

```powershell
# 需要先有 apps/sync-agent/dist/agent.mjs
node apps/sync-agent/tools/build.mjs        # 在完整 pnpm 环境中
powershell -File apps/sync-tray/tools/build.ps1
powershell -File apps/sync-tray/tools/test.ps1 # 对构建产物运行 44 项回归
node apps/sync-tray/tools/package.mjs       # 生成 dist/package/*.zip
```

`build.ps1` 使用 `%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe`，
不依赖 .NET SDK、NuGet 或网络。

图标原图、帧顺序与透明资源生成方式见 `assets/icons/README.md`。
桌面点击结果与截图保留在本次 Git 整理的独立证据备份中。

桌面自动化可在测试进程设置 `INCEPT_TRAY_UI_TEST=1`，配合合成状态目录与
`--no-agent-start --show` 使用。该开关让自绘窗口可被 Computer Use 发现，
并保留卡片直到显式关闭，避免捕获工具切换焦点时卡片消失。正常启动时卡片
保持托盘窗口行为，点击外部自动关闭。测试模式请使用独立状态目录。

## 已知限制

- 尚未做 Authenticode 签名，首次运行可能出现 SmartScreen 提示。
- 设置窗口只读展示端点与设备 ID；更换设备仍需重新运行 `Bind.ps1`。
- 托盘未接入远程 Job 的实时进度，只显示 Agent 上报的心跳与统计。

## 性能（空闲）

90 秒采样（16 逻辑核，`tools/benchmark.ps1`）：

| 进程 | 私有内存 | CPU（单核） |
| --- | --- | --- |
| `InceptSync.exe` | 约 24 MB | 0.10% |
| Agent daemon | 约 28 MB | 0.31% |

复现：

```powershell
powershell -File apps/sync-tray/tools/benchmark.ps1 -StateDirectory "$env:LOCALAPPDATA\Incept\sync-agent" -Seconds 90
```
