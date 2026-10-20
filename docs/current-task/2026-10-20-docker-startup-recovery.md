# Docker Desktop 本地启动错误恢复

2026-10-20（Asia/Singapore）。用户要求暂停 App 构建，优先修复 Docker Desktop 截图中的启动错误；构建继续暂停。

## 诊断与处理

Docker Desktop 4.89.0.238018 启动时，依次在 Ingest、Inference、Secrets Engine 的运行 socket 更名操作上返回 Windows Error 1920。逐个移开 socket 后重启，会在后续模块崩溃时重新留下先前模块的 socket，因此没有完成恢复。

本机对照检查发现，同一个 `%LOCALAPPDATA%\Docker\run\sailor-ingest.sock`：

- Codex 启动的命令环境执行 `fsutil reparsepoint query` 返回 Error 1920。
- 通过 Windows WMI 创建的正常 Windows PowerShell 进程执行相同只读查询，返回 0，识别到 AF_UNIX reparse tag `0x80000023`。

表现与 MSIX AppData 路径虚拟化相关的启动上下文问题吻合。修复使用正常 Windows 父进程启动 Desktop，避免继承 Codex 的 AppData 访问上下文；没有修改 Codex manifest、Docker 设置、注册表或权限。

已确认失效的运行 socket 通过现有 Ubuntu-22.04/WSL 保留更名，原始对象留存于 Docker 的 `run.recovery-*` 目录及 Secrets Engine 的 `engine.sock*.recovery-*` 文件；没有删除。仅处理已检查的零字节临时 socket，未移动 Secrets Engine 的整个目录。

## 恢复验收

正常 Windows 进程执行 `docker desktop stop --timeout 45` 返回 0，再由正常 Windows 父进程隐藏启动 Desktop，成功恢复 Linux Engine 29.7.2/API 1.55。

重启前后清单逐项一致：66 个容器的 ID/名称/镜像、39 个镜像的标签/ID、36 个卷名全部保留。原有 `snowluma` 与 `incept-postgres` 按原策略恢复运行，PostgreSQL 为 healthy。未执行 build、compose up、重置、删卷、WSL unregister 或生产操作；正式 Windows Agent 未启动。

后续启动 Docker Desktop 使用 Windows 开始菜单/桌面快捷方式，或通过正常 Windows 父进程启动。Codex 构建任务只连接已经运行的 Docker Engine，不直接从自身子进程执行 `Start-Process Docker Desktop.exe`。

## 本地证据

- `output/docker-auto-refresh-recovery-20261020.json`：完整恢复过程及最终结论。
- `output/docker-outside-context-probe-20261020.json`：正常 Windows 进程 socket 对照结果。
- `output/docker-normal-context-restart-20261020.json`：正常停止/启动及前后清单。
- `output/docker-normal-context-restart-20261020.ps1`：本次重启验证脚本，包含 stop；后续不要为普通构建反复执行。

App 最终源码、Agent ZIP 与候选 state 已保留。App 镜像构建和发布清单冻结等待用户恢复构建的指示。
