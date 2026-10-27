# 本地临时材料与发布制品

`/.scratch/` 是私有、被 Git 与 Docker 构建上下文忽略的工作区。临时推进脚本、单次审查/复现报告、截图、普通运行日志、测试夹具及合成备份放在这里，按任务与日期建目录。这里可能含测试凭据、Cookie、密钥和原始数据，不作为交付包发送。

`/output/` 仅保留各版发布构建包和配套运维文件：镜像归档、运维归档与解包目录、SHA256、版本 manifest 和交付说明。按版本建目录，保留已验收归档的原始字节；不要把测试数据、备份或下载工具混进发布目录。两处都不提交 Git。

`scripts/` 和 `deployment/` 保留正式运维入口、构建门禁、可复用回归检查及其测试；已进入 package.json、Docker 构建或运行手册的工具不因名称含 check/test 就迁到私有目录。正式验收结论、任务清单和操作手册继续提交在 `docs/`；临时报告与原始证据保存在 `.scratch/`。

## 2026-10-14 整理后的定位

| 原位置 | 当前位置 | 内容 |
| --- | --- | --- |
| `output/final-caddy-readiness-2026-10-14/release/` | 原位置保留 | 已验收 Linux/amd64 镜像和运维包 |
| `output/final-caddy-readiness-2026-10-14/` 的其他内容 | `.scratch/final-caddy-readiness-2026-10-14/` | Caddy、恢复与主机审查证据和夹具 |
| `output/production-readiness-2026-10-13/` | `.scratch/production-readiness-2026-10-13/` | 初轮审查、整改和恢复证据 |
| `output/lighthouse-hardening-2026-10-13/` | `.scratch/lighthouse-hardening-2026-10-13/` | SSH 与内存验收材料 |
| `output/playwright/` | `.scratch/playwright/` | 浏览器截图、配置与证据 |
| `output/readiness-tools/` | `.scratch/readiness-tools/` | 临时复现工具及工具构建夹具 |
| `output/two-round-commits-2026-10-14/` | `.scratch/two-round-commits-2026-10-14/` | 已完成两轮提交的说明与记录 |

历史报告中的旧证据路径保持原文，按上表定位。已被成功候选替代的中间构建日志和已完成提交的 staging 脚本被清理；精确清单与文件哈希在 `.scratch/maintenance-2026-10-14/migration-manifest.json`。最终通过的构建、故障诊断结论、备份、恢复证据仍保留。

旧夹具中的绝对路径、停止的验收容器挂载配置与 Restic 快照内路径属于历史现场，不自动改写。复验前按新根目录生成独立夹具/Compose 配置，勿直接重启旧验收容器；不得针对现有开发库或生产库运行 seed/reset。生产备份仍由 `deployment/backup.sh` 显式写入 `/srv/incept/backups`；本地演练也应显式指定 `.scratch` 下的 `--output`，不要使用发布目录存储备份。

## 2026-10-15 已完成阶段材料清理

用户要求清除无用测试和阶段验收报告后，上述历史演练目录、生成报告、普通日志、合成备份和旧迁移 manifest 已清理。原任务结论和历史证据路径作为历史记录保留，不再保证临时证据文件存在。复验应重新生成隔离材料，不能重启依赖已清理 bind mount 的旧验收容器。

当前保留的本地认证验收入口是 `.scratch/owner-auth-2026-10-14/verify-db.cjs`，同目录保留专用测试库配置及建库脚本。真实内容迁移包、真实库备份和账号恢复材料不属于本轮测试垃圾，仍保留；`output` 发布包和正式运维脚本未动。

清理结果与路由盘点见 `docs/finish-task/2026-10-15-scratch-cleanup-and-route-audit.md`。精确文件清单仅保存在本轮私有临时目录中。
