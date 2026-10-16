# Lighthouse SSH 与 2GB 内存加固

## 执行前约定（2026-10-13）

用户授权处理 SSH 密码登录风险、容器与 Node 堆上限、PostgreSQL 内存裁剪。沿用 `codex/production-readiness`，保留此前验收及工作区改动；本轮不发布应用、不提交 Git。此前“无服务器”的记录是历史状态，现有 Debian 13 / 2 vCPU / 1.9GiB RAM / 4GiB Swap 主机。

纯公钥新连接已成功，现有 authorized_keys 无需重复添加。使用独立 drop-in，语法及实际连接上下文检查后 reload，预设五分钟回滚；另一个纯公钥新连接验证后才取消回滚。保留原配置和 authorized_keys。

内存预算：常驻应用 768MiB、PostgreSQL 384MiB、现有 Nginx 96MiB，共 1248MiB；迁移临时容器 320MiB。应用最多另用 256MiB Swap，其余容器禁用 Swap。Node 每个 isolate 的 old-space 256MiB、semi-space 8MiB；这不是整个进程 RSS 上限。应用临时目录各 64MiB。PG 使用 20 连接、64MiB shared_buffers、2MiB work_mem、32MiB maintenance_work_mem、单 autovacuum worker / 16MiB；禁用查询并行和 JIT，保留写入持久性。

本轮先落实当前已验收 Compose 的资源配置。用户指定的 Caddy 自动 HTTPS 接入在实际部署阶段执行；现有 Nginx 验收不代表 Caddy 已部署。镜像在本机或 CI 构建，不在 2GB 主机执行 Next 构建。

## 验收标准

- SSH 生效配置禁用 password / keyboard-interactive，root 仅允许公钥；reload 后独立新连接通过，回滚定时器取消。
- 隔离 Linux 容器检查真实 cgroup 上限、Node/Worker 堆上限与 PG SHOW 参数；迁移、权限、核心 HTTP 和双语 SSR 可用。
- 记录实际内存、OOM 计数与限制；不把小夹具验收等同于真实内容容量测试。

## 执行结果

待本轮检查后追加。

### [2026-10-13 23:23] - Update by AI完成改动

SSH 已在腾讯云主机实际完成，资源配置已在隔离 Linux 容器完成验证。

- 通过本机代理中的 `incept_ed25519` 新建纯公钥连接成功；现有密钥已被服务器接受，`/root/.ssh` 0700、authorized_keys 0600，不重复添加或替换密钥。
- 新增 `/etc/ssh/sshd_config.d/000-incept-hardening.conf`；`sshd -t` 及真实 root 连接上下文检查通过，再 reload ssh。独立新连接确认后取消 `incept-ssh-rollback-VuDuSqNw.timer`，最终 ssh active / timer inactive。
- 生效值：passwordauthentication=no、kbdinteractiveauthentication=no、permitrootlogin=without-password、pubkeyauthentication=yes。without-password 是 prohibit-password 的等价值。禁用客户端公钥且不提供密码的单次方法探测只收到 `Authentications that can continue: publickey` / `Permission denied (publickey)`，没有发送密码或反复尝试。
- 主配置原有 yes 保留，前置 Include drop-in 生效；参考配置、原 drop-in（若存在）及事务状态保留在服务器 `/root/incept-ssh-hardening.VuDuSqNw`（0700）。未修改授权密钥、SSH 端口、防火墙、云安全组或 Certbot。

### 资源与功能证据

独立项目 `incept-memory-20261013`，合成库 `incept_readiness`、独立 PostgreSQL volume 和 shared 目录；没有连接原开发库或生产库。使用此前验收镜像 `incept-readiness:01a133a5`，实际摘要 `sha256:8c84cca92c2bcc7dde0c1d49721217d4079294f8399939be538abe4636f5f31c`。本轮只改部署配置与验证工具，没有重建业务镜像，也不把本次测试称为工作区全部改动的重新验收。

| 项目 | 实际验证结果 |
| --- | --- |
| app | cgroup memory.max=768MiB、swap.max=256MiB；主线程和 Worker V8 heap_size_limit=280MiB；两个 tmpfs 各64MiB |
| migrate | cgroup memory.max=320MiB、swap.max=0；V8 heap_size_limit=152MiB；18个迁移全部成功 |
| PostgreSQL | Docker硬限制384MiB/无Swap，pg_settings确认全部裁剪参数来源为command line；fsync/full_page_writes/synchronous_commit/autovacuum均on |
| proxy | Docker硬限制96MiB/无Swap；可信合成CA的HTTPS、双语高亮文档SSR、Owner无Origin读取、邀请no-referrer与日志脱敏通过 |
| 核心业务 | 真实PG事务回滚/并发幂等、DML角色禁止DDL、Guest/Pro/Owner访问与撤销、运行中上传/重复上传/206通过 |
| 内存边界夹具 | Owner强制刷新checkedAt为本次新时间，真实Worker采集成功；独立客户端上传128MiB WAV成功并Range读取；10个并发读全部200 |

测试后 cgroup memory.peak：app 286474240 bytes（约273.2MiB）、PG 103010304（约98.2MiB）、proxy 23040000（约22.0MiB）。三个常驻容器 memory.events 的 max/oom/oom_kill 都为0，Swap实际使用0、重启0。Docker stats 会减去部分缓存，故不以其数字替代 cgroup 峰值。

证据在忽略目录 `output/lighthouse-hardening-2026-10-13/`：ssh-prepare/confirm/auth-methods.log、migrate/seed/transactions/http/reading.log、heap.log、migrate-limits.log、limits.json、postgres-settings.json、memory-http.log、cgroups.log、stats.log、proxy-https/redaction.log。事务测试中的 permission denied 是预期 DDL 拒绝。验证程序与步骤在 `deployment/validation/memory-check.mjs` 和 README；SSH事务在 `deployment/ssh-hardening.sh`，Linux bash语法通过。Git diff --check通过，未提交/推送。

### 剩余边界

云端还没有应用容器，因此容器/PG参数尚未在云主机运行；本轮不会将隔离 Docker 主机称为真实 2GB 主机压测。结论是低并发基础场景可运行且已限制资源，真实导入规模、NCM解密峰值、长时间运行与整机并发备份仍需部署后观察。迁移/导入顺序执行，主机仅运行生产镜像；达到OOM或持续Swap时先降低并发/调整内存预算，再评估升配。

Caddy + sslip.io 是下一步真实部署路径，当前 Nginx 的96MiB验证不能当作Caddy验证。Caddy配置/Go内存目标、持久证书卷、备份及systemd接入、实际80/443云防火墙与HTTPS续期尚未执行。此前“无服务器”历史记录不再代表现状，但正式公网放行仍需实际部署、离机恢复、外网设备验收。

遗留问题：上述生产门禁。Commit 建议：`fix: harden SSH and bound production memory for 2GB Lighthouse`。

收尾：按 incept.audit 与 Compose project 双标签核对后，已停止本轮三个测试容器，保留数据库volume、shared与证据；现有 snowluma / incept-postgres 继续运行。最终差异及新文件空白检查通过。


## 2026-10-14 本地材料迁移说明

原 output 下的审查/复现证据、普通日志、截图、测试夹具及备份已迁入私有 .scratch；最终发布包仍保留 output/final-caddy-readiness-2026-10-14/release。历史证据路径原文保留，当前定位与清理范围见 [本地材料规则](../runbooks/zh/local-artifacts.md) 及 [整理记录](2026-10-14-local-artifacts-and-final-commit.md)。被替代的中间构建记录不再作为最终验收依据。
