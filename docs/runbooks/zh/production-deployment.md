# 单机生产发布与恢复

本方案只面向一个 Linux 实例：Nginx → 非 root Next.js → 内网 PostgreSQL。上传及 Dashboard SQLite 位于共享目录，使用鉴权 Route Handler 提供媒体，不能给受限媒体添加 Nginx 静态 alias。隔离验证结果见 [整改记录](../../finish-task/2026-10-13-production-readiness-remediation.md)；公网验收另行执行。

## 主机与目录

安装 Docker Engine、Compose v2（支持 `up --wait`）、Node 24.21.0、GNU tar、util-linux、Certbot。生产主机只开放 80/443 和限制来源的 SSH；不要发布数据库端口或应用 3000 端口。应用容器 UID/GID 1000，PostgreSQL 不发布宿主端口，业务角色没有 DDL 权限。Docker 管理由 root 操作，业务进程非 root。

```sh
sudo useradd --system --create-home incept
sudo install -d -m 0755 /srv/incept/releases /srv/incept/acme
sudo install -d -m 0700 /srv/incept/certificates /srv/incept/backups
sudo install -d -m 0700 -o 1000 -g 1000 /srv/incept/shared
```

在本机 Docker 的 Linux 环境对审核通过的提交执行仓库 Dockerfile（冻结 lockfile、生成 Prisma、类型检查、Lint、测试和构建）。服务器只接收已构建的 Linux/amd64 镜像、对应 deployment 目录及必要运维脚本，放入 `/srv/incept/releases/<revision>`，`current` 指向该版本。保留上一个版本及其镜像；服务器不执行 install、build 或开发脚本。

```sh
docker buildx build --platform linux/amd64 --load -t incept:<revision> .
docker image save -o incept-<revision>.tar incept:<revision>
```

从 `deployment/.env.production.example` 创建 `/srv/incept/.env.production`，权限 0600。独立生成三个随机 64 位十六进制值（迁移库密码、业务库密码、Owner 密钥），例如分别运行 `openssl rand -hex 32`，在本机安全录入；不要写进 Git、聊天或操作日志。配置镜像 digest、真实域名、共享目录和证书目录。密码不要直接放在命令参数中。

`INCEPT_TRUST_PROXY=1` 仅由生产 Compose 注入；Nginx 覆盖 Host/转发协议/客户端地址。应用必须只能通过该代理访问，防止任意调用者提交伪造代理头。

## 初始化与 HTTPS

第一次签证书前，DNS 应指向目标主机且 80 可达；尚未切流时可先进行受控维护窗口。Nginx 尚未运行，先用 Certbot standalone 获得证书，替换域名与邮箱：

```sh
sudo certbot certonly --standalone -d site.example --email operator@example.com --agree-tos
sudo install -m 0600 /etc/letsencrypt/live/site.example/fullchain.pem /srv/incept/certificates/fullchain.pem
sudo install -m 0600 /etc/letsencrypt/live/site.example/privkey.pem /srv/incept/certificates/privkey.pem
cd /srv/incept/current
docker compose --project-name incept --env-file /srv/incept/.env.production -f deployment/compose.production.yml config --quiet
docker compose --project-name incept --env-file /srv/incept/.env.production -f deployment/compose.production.yml up -d --wait postgres
docker compose --project-name incept --env-file /srv/incept/.env.production -f deployment/compose.production.yml run --rm migrate
docker compose --project-name incept --env-file /srv/incept/.env.production -f deployment/compose.production.yml up -d --wait
```

新空库通过初始化脚本建业务角色，迁移由独立 migrator 完成。不要使用 `migrate dev/reset`，不要在生产运行 seed/test-cleanup。业务角色只能读写已迁移的数据表。已有 PostgreSQL volume 不会再次执行初始化脚本；密码轮换需通过受控 SQL 和停机配置更换，不能只修改 env。

代理启动后将续期方式改成 webroot，配置成功续期后复制证书并校验、热重载代理。Certbot 需支持 `reconfigure`：

```sh
sudo install -m 0750 deployment/certificate-deploy.sh /etc/letsencrypt/renewal-hooks/deploy/incept
sudo certbot reconfigure --cert-name site.example --webroot --webroot-path /srv/incept/acme
sudo certbot renew --dry-run --run-deploy-hooks
```

检查 Certbot 安装提供的自动续期 timer，避免额外创建重复任务。依据 [Certbot 官方续期与 hook 文档](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates)，dry-run 还需明确启用 deploy hooks。监测证书有效期并在真实域名上验证 TLS/SSL Labs；localhost 自签演练不替代这一步。

## 内容迁移与进程守护

在停写维护窗口中，备份旧库以及旧媒体/草稿/SQLite（包含 WAL/SHM）。复制旧 `public/_docs-media` 到 `shared/docs-media`、音乐镜像到 `shared/music-media`、草稿到 `shared/docs-drafts`，Dashboard 导入数据库及快照/覆盖设置到 `shared/dashboard`；校验文件哈希和权限后再启用新版本。不要删除原文件直到恢复演练和引用检查通过。已有媒体 URL 保持不变，但通过鉴权 API 服务。未被已发布可访问文档引用的旧图片返回 404。

安装 `deployment/incept.service`、`incept-backup.{service,timer}`、`incept-monitor.{service,timer}` 到 `/etc/systemd/system`，执行 daemon-reload，然后启用主服务和 timers。Compose 管理进程重启和日志轮转，systemd 负责开机启动。业务容器只读根目录，只有持久目录和缓存 tmpfs 可写。

监测用 Node 也必须为 24.x。`/srv/incept/.env.monitor`（0600）配置：

```text
INCEPT_HEALTH_URL=https://site.example/api/health/ready
INCEPT_DATA_DIR=/srv/incept/shared
INCEPT_LAST_BACKUP_MANIFEST=/srv/incept/latest-backup-manifest.json
```

赋予 incept 用户该配置及共享目录的必要只读/遍历权限（可使用 ACL，不能公开敏感文件）。Monitor 检查 HTTPS/数据库、剩余空间 15% 和备份年龄 24h。失败写入 journald 并退出非零；必须将 systemd 失败接入运营者实际告警通道并人为触发验证，单独日志不等于已送达告警。查看 `journalctl -u incept-monitor.service` 和 `docker compose ... logs`；Docker 每容器日志 10MB×3，仓库提供额外 logrotate 模板。

## 备份、恢复与回退

先手工执行 `sudo systemctl start incept-backup.service` 并验收，再启用每日 03:00 的 timer。脚本短暂停写，停止 app 后备份 PostgreSQL custom dump 和全部共享数据，保存 SHA256 manifest，自动重启 app。停用其他导入 CLI/后台写入者，否则不是一致备份。离机复制完整备份目录至受控加密存储，验证 manifest 哈希；保留至少 14 天，只清理已成功离机且经过恢复抽检的旧备份。本机备份不能防主机/磁盘丢失。

恢复使用另一套 **空库、空共享目录、独立 Compose project**（env 指向独立目标，禁止混用现有生产 volume）：

```sh
docker compose --project-name incept-recovery --env-file /srv/incept/.env.recovery -f deployment/compose.production.yml up -d --wait postgres
node scripts/production-backup.mjs --env-file /srv/incept/.env.recovery --project incept-recovery --restore /srv/incept/backups/<completed-backup> --confirm-empty-target
docker compose --project-name incept-recovery --env-file /srv/incept/.env.recovery -f deployment/compose.production.yml up -d --wait app
```

恢复命令检查校验和与空目标，拒绝覆盖已有数据；数据库恢复与文件恢复跨介质，过程中失败应保留现场、使用新的空目标重新演练。核验文章、会话、导入回执、SQLite、草稿、媒体和播放后才考虑切流。记录实际 RTO/RPO。首次恢复不要先运行 migrate；dump 已含 schema 与迁移表。

日常发布顺序：停写并备份 → 保存旧镜像和版本 → 审阅 migration 可逆/兼容性 → 独立 migrate deploy → 更换 env 镜像及 current 指针 → `up -d --wait` → Guest/Pro/Owner 和 HTTPS 冒烟验收。若新镜像失败且 schema 向后兼容，将镜像/current 指回旧版本并重新 `up -d --wait`，共享目录保留。若 schema 不兼容，应停写并向另一空环境恢复发布前备份，再核验切流；不能仅降镜像或运行 reset。回退可能丢失备份后写入，先记录并保留这些数据。不得用 `down -v` 操作生产。

正式放行还需真实云防火墙、域名/续期、主机重启、告警送达、离机恢复与外网移动端验收。没有这些证据时保持 NO-GO。

## 2026-10-13 补充：自动告警与加密离机备份

以下步骤补全上文的人工接线部分，以本节为准。隔离复验见 [validation README](../../../deployment/validation/README.md)。

安装 Restic 0.19.1，按官方 release SHA256SUMS 校验下载。建立独立 SFTP/HTTPS 仓库；SFTP 使用专用账户、密钥和固定 known_hosts，SSH 设 BatchMode=yes、StrictHostKeyChecking=yes。从 `.env.backup.example` 创建 `/srv/incept/.env.backup`（0600），设置唯一稳定的 host ID；可用 `RESTIC_SFTP_COMMAND=ssh -F /srv/incept/.secrets/ssh-config incept-backup -s sftp`，脚本将其作为 Restic 的结构化选项传递。

将 `openssl rand -hex 32` 生成的独立密码写入 RESTIC_PASSWORD_FILE（0600），不复用数据库/Owner 密钥。恢复密码另存受控密码库，不能只保存在原主机。完成原始备份后，明确初始化新仓库一次：

```sh
sudo node scripts/production-offsite.mjs --env-file /srv/incept/.env.backup \
  --backup /srv/incept/backups/<completed-backup> --init --apply-retention
```

已有仓库不要重复 --init。上传前校验完整 manifest 和两个数据文件 SHA256，Restic check --read-data 成功才生成 receipt。自动保留策略只作用于当前 host 和 incept-production tag：最近 14 天且至少 2 个快照，不清理其他应用/主机。参见 [Restic 保留策略](https://restic.readthedocs.io/en/stable/060_forget.html)。本机明文原始备份保持目录 0700，旧包仅在已离机且恢复抽检后人工清理；失败/未验证包不自动删除。

安装 incept-offsite.service 和更新后的 backup timer，daemon-reload。每日 03:00 timer 触发 offsite，其 Requires/After 先执行停写原始备份，再进行加密上传/校验/保留策略；原始备份退出时恢复 app。首次手工 `sudo systemctl start incept-offsite.service`，确认成功后再启用 timer。查看 backup/offsite 两个服务日志及最新 manifest/receipt，不能只看 timer 存在。

从 `.env.monitor.example` 创建完整配置（0640、root:incept）；创建 `sudo install -d -m 0700 -o incept -g incept /srv/incept/monitor`。配置真实 HTTPS 告警接收端和所有 manifest/receipt/state 路径，为 incept 赋予必要的只读/遍历 ACL，禁止公开共享数据。可选 Bearer token 单独放仅 incept 可读的私有文件。HTTPS 必须可信且不跟随跳转；默认剩余空间门槛 15%，原始备份和已验证离机备份都须在 24 小时内。

接收端接受 JSON POST，返回 2xx，并按 Idempotency-Key 去重。字段固定为 eventId、service=incept、status=failure/recovered、check=configuration/health/disk/backup（恢复为 null）、occurredAt；不发送会话、路径、错误原文或密钥。状态先持久化再发送，失败重试使用同一 eventId。首次正常不通知，持续故障默认每 60 分钟提醒，类型改变/恢复另发通知。投递失败退出非零，不能当作已送达；生产必须人为触发故障并由实际接收方核验，再测试恢复。

离机恢复先用 `restic restore <snapshot> --target <new-private-directory> --verify` 下载，验证 manifest SHA256，再执行上文独立空库恢复。密码/SSH 配置单独安全备份；真实数据规模的 RTO/RPO 仍需实测。

证书 hook 先校验域名、剩余有效期与公私钥匹配；Nginx 校验/重载失败恢复旧文件并保留私有 previous 目录。隔离 ACME 已执行真实 HTTP challenge 与续期，真实域名仍需 dry-run、TLS 评级和续期 timer 检查。

Nginx 各 server 覆盖镜像默认日志，邀请 URL（含无语言前缀）脱敏，不记录查询字符串。普通页 Referrer-Policy=same-origin 以支持原生同源发布表单，邀请=no-referrer。请求级 error_log 限制为 crit，避免上游错误记录原始邀请 URL；故障用探活、访问状态码及脱敏应用日志诊断。容器轮转不限制整台主机 journald；生产另设 journald 保留上限并按磁盘规模确认。

可将 `deployment/journald-incept.conf` 作为 `/etc/systemd/journald.conf.d/incept.conf` 安装（0644 root:root），重启 systemd-journald 后检查 `journalctl --disk-usage`。模板上限为持久日志 256MiB、临时日志 64MiB、保留 14 天；这是全机日志策略，已有其他服务时先与主机运营策略协调。本轮没有改动当前机器的全局 journald 配置。

最终Dockerfile将构建门禁与生产依赖阶段分开；运行镜像离线冻结安装 --prod，保留Prisma/tsx迁移与内容CLI、已生成迁移引擎及编译后的Dashboard Worker，不安装开发测试工具。发布更换app容器后，执行 `docker compose ... up -d --no-deps --force-recreate proxy` 再检查ready及HTTPS，确保Nginx重新解析app的容器地址；停写备份仅停止/启动原app容器不会改变该地址。

## 2026-10-14 本机构建、更新审查与灾备流程

上面的build/save命令仅在本机运行，revision使用审核提交ID。首发默认SSH/SCP传输，无需先配置镜像仓库账号。本机Docker构建并验收最终Linux/amd64镜像，不上传Windows node_modules或单独.next目录冒充Linux制品。使用save -o避免PowerShell文本重定向处理二进制数据；服务器核对归档SHA256后 `docker image load -i <archive>`，再核对两端image ID。离线交付在env中使用完整 `sha256:<image-ID>`；registry交付则使用仓库manifest digest，两者不能混淆。参见 [Docker save](https://docs.docker.com/reference/cli/docker/image/save/)、[load](https://docs.docker.com/reference/cli/docker/image/load/) 与 [平台构建](https://docs.docker.com/build/building/multi-platform/)。

交付镜像、deployment目录和生产backup/monitor/alert/offsite脚本；镜像包含Next编译产物、生产依赖、Worker及Prisma迁移引擎。密码/env保留在服务器私有位置，PG volume与shared独立于版本目录。首次生产内容迁移单独备份和验收，不将本地开发库随代码更新覆盖生产数据。

1. 本地功能/实验分支开发，审查diff与migration，选择确切审核提交构建；运行typecheck/lint/test/build与生产依赖审计。
2. 用独立库和持久目录验证候选镜像的页面、三身份权限、媒体与迁移；实验版不能连接生产DB/SQLite/媒体。
3. 记录commit SHA、平台、镜像ID（registry另记digest）、部署包SHA256、验证证据、schema兼容性、上一版本和恢复路径；人工发布审查通过才切换生产，不以build成功或可变latest自动部署。
4. 上传并校验候选制品，保留旧版本。短维护窗口停写及停止导入CLI，生成并验证PG/SQLite/媒体一致备份，保留旧镜像、配置和私有env。
5. 执行审查通过的migrate deploy，更新镜像/current并启动；HTTPS ready、双语真实文章、Guest/Pro/Owner、媒体冒烟通过后恢复写入。2GB主机不同时运行两套完整应用。
6. 失败停新应用：schema向后兼容则恢复旧镜像/配置并复验；schema破坏或数据错误则先保存故障数据，再向独立空库/目录恢复发布前备份，核验后切流。不要反复重跑失败迁移、盲目降镜像或reset生产库。

灾备需要每日及发布前一致备份、加密离机保存、至少14天/两个离机快照、独立恢复密码和真实恢复演练。Git/旧镜像不能恢复业务数据，本机备份不能防磁盘或主机丢失。回到发布前数据可能丢失备份后的写入，需保留故障数据，不承诺零损失。

备份/恢复、Restic和监测工具已完成隔离验收；真实另一故障域存储、告警接收及Caddy适配仍待落地。当前没有GitHub Actions自动发布工作流，后续可接入Actions构建与私有GHCR，在发布批准后按digest拉取，仍不在服务器构建。Caddy+sslip.io需先补齐证书持久卷、Go内存目标与运维适配。

## 2GB Lighthouse 的资源预算与 SSH 加固

当前 Compose 针对 2 vCPU / 2GB RAM / 4GB Swap 裁剪：应用 768MiB、PostgreSQL 384MiB、Nginx 96MiB，常驻容器上限共 1248MiB；迁移容器 320MiB。上限不是预留内存，不能保证各种峰值同时发生时主机仍有余量。迁移和内容 CLI 顺序执行，发布迁移时先停应用写入；生产镜像在本机或 CI 构建。不要在该主机运行完整 Next 构建或开发服务器。

应用 `NODE_OPTIONS` 限制每个 isolate 的 old-space 256MiB、semi-space 8MiB，Worker 继承相同选项；实际 V8 总堆上限为 280MiB，Buffer、原生库与线程栈另占内存，由容器总限制兜底。迁移 old-space 128MiB。应用额外 Swap 上限 256MiB，其他容器为零；4GB 主机 Swap 是应急缓冲。两个应用 tmpfs 各 64MiB，媒体写入持久化 `/data`。

PostgreSQL：20 连接、shared_buffers=64MB、work_mem=2MB、hash_mem_multiplier=1、maintenance_work_mem=32MB、autovacuum_work_mem=16MB、单 autovacuum worker、查询/维护并行关闭、JIT 关闭。`effective_cache_size=128MB` 是规划器估计；`max_wal_size=256MB` 是软目标，均不是硬内存/磁盘配额。work_mem 按每个排序或哈希操作计算，不能简单以连接数相乘当作总内存。fsync、full_page_writes、synchronous_commit 和 autovacuum 保持开启。见 [PG16 资源说明](https://www.postgresql.org/docs/16/runtime-config-resource.html) 和 [Docker 内存/Swap 说明](https://docs.docker.com/engine/containers/resource_constraints/)。

SSH 使用 `deployment/ssh-hardening.sh` 的两步事务。先从独立终端以 `BatchMode=yes`、`PreferredAuthentications=publickey` 验证 root 公钥登录；保留现有已连接终端与云控制台恢复入口，再通过该连接运行 `bash deployment/ssh-hardening.sh prepare`。脚本安装 `000-incept-hardening.conf`、验证语法与当前 root 连接上下文、安排五分钟自动回滚后 reload；备份保留在输出的 STATE 目录。必须在五分钟内通过另一个新公钥连接运行 `bash deployment/ssh-hardening.sh confirm <STATE>`，验证后取消回滚。失败时不要取消回滚或关闭原终端。

生效值应为 PasswordAuthentication=no、KbdInteractiveAuthentication=no、PermitRootLogin=prohibit-password（`sshd -T` 可能显示等价值 without-password）、PubkeyAuthentication=yes。以 `sshd -T -C ...` 和新连接为准；OpenSSH 优先采用先读到的值，不能只在配置末尾追加。现有 authorized_keys 已可登录时不重复写入。见 [OpenSSH 配置手册](https://man.openbsd.org/sshd_config)。

这套 Compose 当前仍是已验收的 Nginx 路径。Caddy 自动 HTTPS 的配置、证书持久卷、运维脚本接入与真实 sslip.io 域名验证在部署阶段完成；不要同时运行两个占用 80/443 的代理或将 Next 3000、PG 5432 暴露公网。SSH/小内存实测结果见 [加固记录](../../finish-task/2026-10-13-lighthouse-security-memory-hardening.md)。

## 2026-10-14 最终 Caddy 交付（取代上文 Nginx 首发步骤）

本轮完成Caddy适配。首发在 `.env.production` 设置 `INCEPT_PROXY=caddy`、`INCEPT_CADDY_STATE_DIR=/srv/incept/caddy`，使用统一入口 `sh deployment/compose.sh`；systemd和备份均选择同一覆盖文件。保留Nginx模板作历史兼容，生产只启动Caddy。代理固定官方2.11.7及digest，非root UID1000、只读根目录、仅NET_BIND_SERVICE能力，内存96MiB/无Swap，Go软目标64MiB/GOMAXPROCS=1。

服务器只导入离线镜像包，不构建。交付目录含images-linux-amd64.tar、SHA256、运维包及manifest；manifest记录确切应用ID与Caddy/PG镜像。核验SHA256后docker image load，应用env使用完整image ID。部署脚本和镜像以交付manifest为准，不能使用历史8c84镜像或失败候选。

```sh
sudo install -d -m 0700 -o 1000 -g 1000 /srv/incept/shared /srv/incept/caddy/data /srv/incept/caddy/config
cd /srv/incept/current
sh deployment/compose.sh config --quiet
sh deployment/compose.sh up -d --wait postgres
sh deployment/compose.sh --profile ops run --rm migrate
sh deployment/compose.sh up -d --wait --wait-timeout 120
```

以上启动仅在正式部署获准后运行。Caddy自动申请/续期，/data和/config持久化；不要执行旧Nginx/Certbot签证/复制hook步骤，避免两套证书管理占80端口。正式部署前检查原Certbot timer用途，确认无其他证书任务后停用。主机只监听80/443与受控SSH，3000/5432/2019不发布；确认云安全组，宿主INPUT ACCEPT及云厂商IP黑名单不等于端口白名单。

普通响应Referrer-Policy=same-origin，邀请含无locale/大小写路径为no-referrer；访问和运行错误日志删原URI、请求/响应头，记录安全路径并隐藏查询。所有媒体走应用鉴权。认证4KiB、音频128MiB、Dashboard预览64MiB、其他请求1MiB；重音频/预览共用一个已认证上传槽，忙时429/Retry-After=5。Caddy不引入限流插件，认证/采集沿用应用限流，不能声称与旧Nginx所有连接限流完全等价。实际HTTPS修复了Dashboard导入Origin使用内部URL的问题，并保留跨域拒绝。

备份入口会短暂停app和Caddy，以锁避免并发执行，生成database.dump、data.tar.gz和caddy.tar.gz及完整SHA256，然后自动恢复服务。shared归档包括SQLite/WAL/SHM、媒体、草稿和快照；外部导入CLI也须停写。备份/恢复工具发现Caddy仍运行会拒绝，恢复同时要求独立空PG、shared与Caddy目录。人工恢复使用统一入口起PG（不要先migrate），然后 `node scripts/production-backup.mjs --env-file <recovery-env> --project <new-project> --restore <backup> --confirm-empty-target`，核验后再起app/proxy。

定时器每日03:00触发offsite，依赖一致备份，启用前先手工验收。Node备份/监测/离机old-space分别128/64/64MiB，Docker CLI/Restic Go软目标64/128MiB。Debian当前 `/usr/bin/restic` 0.18.0-1+b4的同哈希副本已验证本轮init/backup/check/forget/restore --verify；可使用系统版本，无需为版本号升级。Linux密码文件必须0600且独立托管；Windows共享目录的777权限在隔离Linux中被正确拒绝，测试改用容器私有文件，未绕过权限校验。

真实离机目标仍需另一个故障域，SFTP固定known_hosts与专用账户/密钥，或配置可信TLS的S3兼容存储。不要把同机SFTP测试当作灾备已经落地；没有实际存储、告警接收与恢复验证时不启用名义上的生产timer或宣称GO。

只读主机核查发现security来源待升级包含内核6.12.111；今晚未更新系统。明天先审阅/安装适用更新、必要重启后复验Docker/SSH/Swap，再确认云防火墙、公网ACME/续期及外网设备。详细事实/边界和最终镜像见 [最终交付记录](../../finish-task/2026-10-14-final-caddy-release-readiness.md)。

更新迁移必须在停app的维护窗口执行：新版本的挂载路径/PG配置可能触发数据库容器重建，旧应用连接会中断。备份完成后明确 `sh deployment/compose.sh stop app`，停止其他写入者，再切换部署目录/执行migrate，最后启动新app并等待ready、检查HTTPS和业务后恢复写入。隔离夹具已观察并恢复这一连接中断，不能拿迁移命令成功替代应用恢复验收。
