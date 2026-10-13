# 两轮提交与本机构建发布流程

## [2026-10-14 00:20] - Update by AI完成改动

用户授权将已验收的两轮工作分别提交：生产上线准备、SSH/小内存加固。只创建本地 Git 提交，不推送分支、镜像，不在云端发布应用。沿用 `codex/production-readiness`，基点 `b623e13`，保留用户已验收的 loading.tsx 删除及现有工作区内容。

共享文件通过 Git 索引分阶段暂存：第一笔包含原上线准备配置/文档，第二笔只追加内存/SSH改动；工作树完整文件不回退。真实云SSH已完成；第一笔“生产部署准备”不代表公网部署完成。现有历史审查、整改、验收记录保留。

用户确认生产主机不执行构建。修正手册中旧的服务器 docker build 示例，明确本机 Docker Linux/amd64 构建、不可变制品、传输校验、发布审查与灾备边界。当前没有 GitHub Actions 工作流或自动部署脚本，本轮说明操作流程，不将计划写成已实现的自动流水线。

## 发布决策

首发用本机 Docker 构建并验收同一 Linux/amd64 镜像，docker image save -o 导出，SSH/SCP上传，校验包SHA256及导入后的image ID。另上传对应版本deployment目录和必要运维脚本；服务器密钥/env、数据库、SQLite和媒体不进入镜像或Git。镜像包含必要运行代码/迁移脚本，服务器执行启动与迁移，不执行install/build。

后续仍在本地分支开发；通过代码差异审查、typecheck/lint/test/build/生产依赖审计、独立库HTTP与迁移兼容性验收后，将确切提交构建成候选镜像。本机验收通过不自动替换线上：发布前审查制品ID、迁移风险、备份、旧版本和回退方式，再进入短维护窗口。实验版本只连接合成或脱敏复制库，不连接生产DB/媒体/SQLite。

保留上一镜像和部署包。向后兼容schema可回退镜像/配置；破坏性schema或错误数据写入需停写并在独立空库/共享目录恢复发布前一致备份，核验后切流，并保留故障数据供分析。另一故障域加密备份及恢复密码托管必须实际落实；现有同机SFTP夹具不构成真实灾备。全机/磁盘丢失从另一存储恢复，不依赖原主机本地备份。

Caddy+sslip.io尚待接入与真实TLS验收；当前配置为已验收Nginx，首次发布前需补齐Caddy持久卷、Go内存目标、备份/systemd适配。2GB主机采用停写切换，不在同机并行跑两套完整生产应用。

遗留问题：真实部署、外部告警与离机恢复、生产内容迁移及外网设备验收。Commit 建议：第一笔 `fix(deploy): prepare audited production release and recovery`，第二笔 `fix(security): harden SSH and bound production memory`。

## 提交结果

完成后追加提交ID与检查结果。
