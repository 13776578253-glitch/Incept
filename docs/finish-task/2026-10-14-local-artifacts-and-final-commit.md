# 本地材料整理与本轮生产准备提交

## 执行约定

用户要求启用私有 `/.scratch/`，参考 1002bot/scratch，把临时推进/单次复现脚本、审查证据、普通日志与测试备份迁出 output；output 保留每版发布构建包与配套运维文件；清理无用脚本和构建记录。用户随后明确授权创建本地 Git commit，不推送、不上线。

沿用 `codex/production-readiness`，基点 `d6b4540`；本次提交包含此前最后一轮 Caddy/备份修复及本轮材料整理。已有 `.gitignore` 的用户 scratch 规则保留；补 Docker 构建上下文排除 `.scratch`，防止临时私有文件进入后续构建。

## [2026-10-14] - Update by AI完成改动:

- 把 6 类本地材料迁入 `.scratch/`；最终 `output/final-caddy-readiness-2026-10-14/release/` 保持原位置，发布包未改字节。迁移共 92 个目录/文件入口（非 92 个总文件），包括发布目录里的两个核验日志。
- 清理 12 份已被成功候选替代的中间构建日志、3 个已完成历史提交的 staging 脚本和 1 份已有解压工具的 Restic 下载压缩包，共 16 文件、11,911,918 字节。逐文件原始 SHA256 与精确迁移清单保存于私有 `.scratch/maintenance-2026-10-14/migration-manifest.json`。
- 保留最终通过构建日志、原始审查/故障诊断证据、截图、全部备份/恢复数据及可复用检查工具。正式任务记录继续在 docs；历史记录原文未覆盖，附加迁移定位说明。4 个隔离证书相对链接随整目录移动，不读取密钥内容；原开发容器与数据库未修改。
- `scripts/`、`deployment/validation/` 中已有运行手册、构建或 package.json 使用的工具属于可复用能力，继续受版本控制。旧私有夹具的绝对路径不改写，复验须生成新独立配置，不能直接重启旧容器。
- 同一提交纳入前轮已验收 Caddy 覆盖/统一 Compose 入口、可信 Origin 导入修复、上传并发槽、Caddy 状态一致备份/空目标恢复与内存配置。详情见 `2026-10-14-final-caddy-release-readiness.md`。

## 发布制品

镜像 `incept-final:20261014`，Linux/amd64，ID `sha256:f35c6cd83e679cdd08fec14bc14f8d6f1d8da86e80fe3c28c6d54a66824dcd64`。

镜像包 SHA256 `e2d1c56875943096c0b65e9826ba2d9e7228a696d5f43f303131afd39235c5a3`，运维包 SHA256 `c073631de5906b662d20cdf5bc58ff5cef0e9a4bf2d3973d451b900fcb891d05`；迁移前后相同。此前构建 464 测试、typecheck/lint/build 与隔离 Linux/HTTPS/恢复验收通过；整理不改变这些运行实现或归档。提交后的源码关联另附 provenance，不改写既有构建时 manifest。

## 验证与提交

收尾结果完成后追加。

Commit 建议: `fix(deploy): finalize Caddy recovery and organize local artifacts`

遗留问题: 公网部署、安全更新/重启、安全组、公网 ACME/续期、真实独立离机备份/告警与实际内容/外网设备验收仍按前轮报告处理。本轮仅本地整理与提交。

### 收尾验证（2026-10-14 08:35，Asia/Singapore）

- 本机定向回归：Dashboard 导入 Origin 5/5、上传并发槽 2/2、运维告警/不完整备份拒绝 2/2，共 9/9。首次沙箱 realpath/rename EPERM 未作为通过证据；在获批正常本机权限下重跑全部通过。
- Git diff --check 通过，scratch/output 的 Git 忽略生效，Dockerignore 排除 scratch/output。output 仅剩发布包及配套公开配置/说明，未含普通日志、测试媒体或数据备份。
- 7 个运行实现 SHA256 仍匹配此前镜像 manifest；两份交付归档 SHA256 均匹配迁移前值。4 个测试证书链接迁移后仍保持原相对目标。
- 提交清单 35 文件，仅正式源码/测试、公开部署配置、Git/Docker 排除规则及正式文档；私有材料不暂存。原开发 snowluma/incept-postgres 继续运行，6 个本轮验收容器均已停止，未操作 Docker 资源或云主机。
- 创建本地提交，后续源码关联写入发布目录独立 provenance；既有构建 manifest 和归档不重写。本轮未重复完整构建，沿用此前已验收 Linux 镜像；新增整理不修改运行源码。
