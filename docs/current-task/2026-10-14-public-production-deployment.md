# 首次公网生产部署

## 执行约定

用户于 2026-10-14 授权向 43.155.136.83 上传镜像并部署。沿用已验收 Linux/amd64 制品与本地提交 98b77ff，服务器不构建、不安装项目依赖。域名为 43-155-136-83.sslip.io，Caddy 自动 HTTPS。

部署前复查现有数据/配置、系统补丁与资源、SSH、安全端口，核验上传制品 SHA256 和加载后 image ID。已有 /srv/incept 基础目录与 incept 用户，但当前没有容器运行；不得假定这些目录为空或直接覆盖。独立生成生产秘密且不写入日志/聊天。真实离机目标、告警接收尚未提供，不能伪造其验收或启用依赖它们的 timer。

生产 PG/shared/Caddy 状态独立持久，版本目录与配置可回退。首次启动仅使用批准的生产内容；空生产库首发与本地真实内容迁移已请求用户澄清。启动后验证公网 HTTPS、双语页面、健康、权限/媒体门禁、容器内存与端口、一致备份及开机服务配置；不运行生产 seed/reset/down -v。

## 部署过程与结果

完成后追加实测结果及剩余边界。

## [2026-10-14] - Update by AI完成改动:

### 上线结果

公网地址：<https://43-155-136-83.sslip.io/zh>。已上传并加载原验收镜像包和运维包，SHA256 均匹配；应用、Caddy、PostgreSQL image ID 及 Linux/amd64 平台均核验通过。应用仍为 `sha256:f35c6cd83e679cdd08fec14bc14f8d6f1d8da86e80fe3c28c6d54a66824dcd64`，对应提交关联 98b77ff；服务器没有运行构建或项目依赖安装。

服务器 Debian 更新完成：87 项升级、4 项新包，无删除；刷新后的 APT 索引无剩余更新。实际重启进入 Debian 13.7 / 6.12.111+deb13-amd64，SSH 公钥登录仍可用，密码与交互式密码认证保持关闭。Docker、Swap 和独立宿主防火墙均复验正常；不是未来补丁持续自动安装的证明。

`/etc/incept-host.nft` 的独立 inet 表过滤宿主 INPUT，默认 drop，保留已建立连接、loopback、ICMP、DHCP，只允许 TCP22/80/443；不清空 Docker/腾讯云规则。先设置五分钟自动回滚，独立新 SSH 验证后取消，开机服务启用。SSH22 仍允许任意来源的公钥连接，未配置来源白名单。Docker 仅发布80/443，3000/5432/2019仅容器内；INPUT表不能替代 Docker FORWARD 策略。云控制台443开放由用户确认，公网正常访问另以实测支持。

Let’s Encrypt 实际 HTTP challenge 成功并签发公开证书，CN为43-155-136-83.sslip.io、issuer YE2，2027-01-12 07:51（Asia/Singapore）到期。Caddy自动证书维护启动，状态持久化并完成备份恢复；真实未来续期尚未到时间，不声称已经实测续期。初次外部 TLS 曾 ECONNRESET，而服务器 loopback 正常；后续用户确认443开放，独立 Node/Windows curl/浏览器均验证成功。重置根因未确认，不归因于未经证实的网络过滤。

### 真实内容迁移

用户明确选择同时迁移本地真实内容。先核对并暂停属于本仓库的3个 Next 开发进程，保留原 PostgreSQL 与文件；原 snowluma 等其他项目未操作。本地事务一致 pg_dump 导出14文档、12音乐、25 Roadmap条目及既有业务配置/授权，排除32条开发登录会话。SQLite使用备份API读取一致快照，integrity_check=ok；媒体、57份草稿和Dashboard文件共82个，逐文件SHA256核验。源数据未清理或覆盖；本地开发服务器可由用户重新运行 pnpm dev。

在服务器先备份初始空生产状态，随后恢复到新的独立持久目标：

- 生产数据库卷：`incept_content_20261014_data`。
- 生产共享数据：`/srv/incept/import-20261014/shared`。
- 生产 Caddy状态：`/srv/incept/import-20261014/caddy`。
- 版本目录：`/srv/incept/releases/98b77ff`，`/srv/incept/current`指向此版本。
- 私有生产配置：`/srv/incept/.env.production`，0600 root；独立随机Owner/迁移库/业务库密钥未写入聊天或日志。
- 持久卷覆盖：`/srv/incept/compose.content-20261014.yml`，由私有env的INCEPT_COMPOSE_OVERRIDE选择。**后续更新必须保留该文件及变量，否则可能重新选择初始空卷。**

本地库含17次迁移，恢复后由正式 migrate deploy 补第18次；没有运行seed/reset/down -v。迁移后14/12/25计数一致、18次迁移齐全，旧开发会话未导入；生产Owner冒烟会话在finally注销，活跃测试会话0。已有源内容按原发布状态保留，包括原库中命名为测试的文章，未擅自删除或重新发布。

### 真实生产验收与备份

正常信任链的生产代理检查通过：双语200、Owner登录204与安全Cookie、注销204、已认证导入列表200、可信Origin预览400正常校验路径、伪造跨域403、认证超限413、Guest强制采集403、公开汇总不含原始路径/哈希凭据；82个内容文件哈希与SQLite完整性均通过。一次性检查最初把仅POST的内部音乐接口当GET，405是测试脚本错误；改验实际接口后通过，应用未修改。

外部 Windows curl 实测ready200、HTTP308跳HTTPS、真实MP3 Range206/1024bytes、TLS验证0；实际Edge/Playwright打开中文首页、Git真实文章和英文文档，截图目视检查，控制台0errors/0warnings，未忽略HTTPS错误。CLI高亮计数命令参数错误未作为通过证据。浏览器会话已关闭；未冒充手机网络或长期容量验收。

真实服务器手工执行两次一致备份：停止app/Caddy、归档PG/shared/Caddy并自动恢复。使用第二份真实内容备份向独立新空库/目录恢复，14文档/12音乐/25Roadmap/18迁移、SQLite完整性和证书SHA256全部匹配。恢复库停止但卷/文件保留，生产目标未替换。raw备份目录0700，仍是服务器本机备份。

原timer指向offsite，尚无真实目标，未启用名义离机任务。systemd不允许通过第二个Unit字段覆盖触发对象（首次失败已记录）；改用独立 `incept-local-backup.timer`，每日03:00附近（UTC+8，最多5分钟随机延迟）触发已验证backup.service。实际查询确认Unit=incept-backup.service、下一次2026-10-15 03:04附近。失败drop-in已移除，原offsite timer disabled。

正式应用干净停止后再次重启服务器，主应用/防火墙/本地备份timer均自动active，3个容器healthy、14/12/25数据保留、0failed services；最终外网ready200与Git文章200/TLS0。临时tcpdump诊断unit因预期timeout退出而曾failed，已仅清理该诊断状态。曾采样app88.43MiB、PG18.05MiB、Caddy14.88MiB；hard caps768/384/96MiB、app额外Swap256MiB。是短时真实内容采样，不是长期并发容量保证。

### 交付和后续维护

原归档保留于 `output/final-caddy-readiness-2026-10-14/release`，没有重打包。真实宿主防火墙、开机unit、本地备份timer和持久卷覆盖作为公开 `host-additions` 补充交付，附SHA256；凭据、实际数据、日志和截图仅放私有scratch或服务器目录，不进入公开运维包。

初始数据库卷incept_postgres_data、原shared/Caddy目录及初始配置保留。`/srv/incept/rollback/pre-content.env`仅对应首次空库基线，不是当前真实内容的回退数据；当前真实数据应使用已验收备份向新的空目标恢复。未来发布停写/备份、审查迁移兼容性、保留生产env/持久卷覆盖，再切换确切镜像和版本目录，禁止把本地库每次覆盖生产。

仍待接入：另一故障域的加密备份及独立密码托管、外部真实告警接收与送达测试、实际手机网络/持续容量验证。原monitor要求离机receipt/告警，未以虚假配置启用；Docker健康检查和本地每日备份已运行。公网服务已运行，这些运维事项继续保留。

运行证据：`.scratch/public-deployment-2026-10-14/` 中的无凭据smoke结果、真实恢复日志、升级审阅清单、备份manifest及截图；服务器/root保留原始部署/升级/恢复记录。审批基础设施断流的操作未执行，重新审批后完成；未绕过审批。

Commit建议：`docs(deploy): record first public rollout and verified content recovery`。本轮部署记录待提交，未新增应用源码提交；运行镜像与此前验收制品保持一致。
