# 最后一轮：Caddy、主机核查、备份与 Linux 制品

## 执行前约定（2026-10-14）

用户授权完成只读服务器核查、连通/镜像路径验证、Caddy适配、持久化/备份/空目标恢复，交付已构建并验收的Linux/amd64镜像；今晚不正式上线。沿用codex/production-readiness，基点d6b4540。用户确认暂无另一故障域存储，本轮完成离机配置与隔离恢复，实际外部接入保留为正式上线门禁。

服务器只读取版本、包来源/更新缓存、服务启动/Swap/防火墙/OOM日志及HTTPS公共端点，不执行apt update/upgrade、修改防火墙或部署容器。已发现Debian缓存列出待升级包（包括security来源），unattended-upgrades未安装；不能宣称系统补丁已经齐全。明天先升级审查及重启复验再上线。

Caddy使用固定官方版本，保留Nginx基础配置用于历史验收，新增Compose覆盖及统一入口；生产选择Caddy。GOMEMLIMIT=64MiB为Go软目标，容器上限96MiB且不使用Swap，总常驻容器上限仍1248MiB。Caddy /data、/config与PG、共享数据均独立持久化。代理只暴露80/443，应用/数据库仅私网；所有媒体走Next鉴权，不添加静态alias。

迁移转发头、各路由请求体限制、邀请no-referrer和日志脱敏；使用Caddy内置组件，不引入插件平台。应用已有鉴权/限流保留；Caddy核心不包含Nginx相同的请求频率模块，上传重处理并发须在应用端限流补齐或明确验证，不虚称完整等价。

一致备份短暂停app与Caddy，归档PG、整个shared（含SQLite/WAL/SHM、媒体、草稿）、Caddy状态；恢复到独立空目标，校验完整哈希，禁止覆盖运行中的生产数据。Restic离机加密配置和隔离恢复继续验证，实际另一故障域及外部告警待明天准备。

构建在本机Docker Linux/amd64执行，冻结依赖与完整门禁；新的候选镜像必须重新验收，不能用旧8c84镜像代替。交付镜像归档、SHA256、image ID、版本化运维包及验收记录；暂不推送或在云端启动应用。

## 结果与证据

完成后追加。

## [2026-10-14] - Update by AI完成改动

完成本轮代码、只读核查、隔离Linux/Caddy和恢复验收。没有在云端安装软件、升级系统、发布容器、签发公网证书或上传应用；没有创建第三笔Git提交/推送。首发构建路径确定为本机Docker/Linux amd64 + SSH离线交付，Actions/GHCR私有发布工作流仍未接入。

### 主机事实与边界

- Debian13.2、内核6.12.107、2vCPU、1.9GiB RAM/4GiB Swap，约33GB可用。Docker Server29.9.0/Compose5.6.0来自download.docker.com的trixie stable签名源。SSH/Docker enabled，Nginx/Caddy unit未安装，Certbot4.0 timer enabled但无live/renewal证书文件。
- /swapfile已在fstab，权限0600，当前Swap使用0。0 failed services。journald仅保留当前启动（2026-10-13 18:09起），可见日志无OOM/I/O/EXT4错误；不是30天完整历史证明。
- 宿主IPv4/IPv6 INPUT ACCEPT；Docker转发规则和云厂商YJ SSH IP黑名单存在，不是端口白名单。TCP仅22监听，UDP为DHCP/本地chrony；云控制台安全组无法从报告确认，正式上线前另查。
- APT缓存列出8个security来源候选（bind9三项、pcre2、png、内核/header/libc-dev等），内核候选6.12.111；另有普通更新。unattended-upgrades未安装，apt timers存在不代表自动安装安全更新。仅使用缓存，未apt update/upgrade；不能宣称补丁全部最新。
- GitHub/API/npm均TLS验证成功200；GHCR/Docker Hub v2根端点401是认证挑战，服务器用匿名令牌实际取得公共GHCR镜像manifest200/linux-amd64。私有仓库授权与Actions未验证。本机实际拉取官方Caddy固定镜像成功；首次Hub令牌EOF重试后恢复。
- 43-155-136-83.sslip.io实际解析为43.155.136.83。Node24.21.0、GNU tar/flock可用。Restic0.18.0-1+b4来自Debian main，候选同版本；通过只读SCP取得同SHA256二进制，在本机隔离副本完成init/backup/check/forget/restore --verify，保留现有版本可行。

### Caddy与代码修复

新增固定版本Caddy覆盖、统一compose.sh入口及持久data/config目录。Caddy非root1000、只读root、只保留NET_BIND_SERVICE、96MiB/无Swap、Go64MiB软目标/单CPU。实际启动发现官方可执行文件带端口能力标记，cap_drop ALL会EPERM；补唯一能力后健康，CapEff/CapBnd仅0400、NoNewPrivs=1。

应用/PG仍768/384MiB，常驻总上限1248MiB；迁移320MiB。迁移/应用/Worker堆128/256MiB，监测/离机Node64MiB，备份Node128MiB；Go CLI/Restic软目标64/128MiB。Go目标不是RSS硬上限，容器上限也不是物理预留。

迁移转发头、各类body上限、普通same-origin/邀请no-referrer与访问/错误日志脱敏，禁止媒体静态alias。应用添加单重上传槽，真实慢音频流期间Dashboard预览429、完成后恢复400正常验证路径。认证/采集沿用应用限流，不把Caddy核心说成Nginx全部限流的等价实现。

真实HTTPS揭示Dashboard导入预览/确认Origin错误对比内部URL，现由Web可信代理Origin传入包内边界，跨域仍拒绝，新增回归测试。首次上传包装的NextResponse类型不匹配已修正，失败候选不能交付。

### 最终制品与验收

- 镜像：`incept-final:20261014`，Linux/amd64，非root node，image ID `sha256:f35c6cd83e679cdd08fec14bc14f8d6f1d8da86e80fe3c28c6d54a66824dcd64`。未推送registry，因此不是已发布仓库digest。save/load同一交付归档后ID一致。
- 本机构建冻结lockfile、typecheck/lint/test/ops/build/生产依赖精简与Next断链门禁通过。总464测试（67 roadmap、94 dashboard、190 music、73core、38web、2ops），Lint0错误/9既有warnings。实际运行镜像pnpm audit --prod各等级0；不宣称开发全依赖或OS全CVE为0。
- 新镜像真实迁移18个、事务回滚/并发幂等/DML禁DDL、三身份/撤销/发布/重复上传/Range通过；Caddy可信私有CA、双语高亮SSR、Owner GET无Origin、私有媒体门禁、伪造头拒绝、邀请HTTP/HTTPS含无locale策略、4KiB认证413通过。
- 实际Caddy TLS128MiB WAV上传及206 Range通过。最后一轮cgroup peak app138547200、PG27717632、Caddy22237184 bytes（约132.1/26.4/21.2MiB），Swap/max/oom/oom_kill均0。是短时合成夹具和容器限制证明，不是物理2GB整机长期/NCM/真实内容容量保证。
- Playwright独立Edge浏览器双语真实页面/图片/高亮/0控制台错误警告，代码截图已目视检查；1px白图与合成静音WAV不是实际内容或外网手机验收。浏览器仅忽略夹具CA错误；Node HTTPS独立验证该CA/hostname，未改全局信任。
- 7个变化的应用/导入/备份实现逐一校验与实际镜像字节SHA256相同；本轮未提交内容通过base d6b4540+文件哈希记录，不将镜像称为纯d6b4540版本。运维bundle含更新的主机unit/模板，与运行镜像分开交付。

交付在 `output/final-caddy-readiness-2026-10-14/release/`：images-linux-amd64.tar（应用/Caddy/PG三镜像，504249856bytes）、ops-linux.tar.gz、manifest.json、SHA256。镜像包SHA256 `e2d1c56875943096c0b65e9826ba2d9e7228a696d5f43f303131afd39235c5a3`；操作包最终SHA以manifest为准。白名单打包未含真实env、私钥或合成备份。今晚未上传服务器。

### 持久化、备份与恢复

PG独立volume、整个shared、Caddy state独立目录持久。backup.sh实际自动停app/Caddy、生成三份归档/全SHA、写最新manifest并恢复服务；以独立测试project演练，原开发库/服务不受影响。

SQLite写入一条已提交且仅在WAL的唯一sentinel，验证主db尚不含它后只终止--init包裹的测试子进程；WAL4152bytes和SHM32768bytes一并归档。独立空PG/shared/Caddy恢复后能查询该行，Caddy CA哈希不变，媒体/草稿/导入回执/会话和可信HTTPS复验通过。恢复到非空目录被拒绝，正确SQL验证docs_documents前后均5；首次校验表名错误保留为诊断，不能作为通过证据。

隔离SFTP Restic加密上传/check/限定host-tag保留及restore --verify后，database.dump/data.tar.gz/caddy.tar.gz三个SHA全部一致。服务器同版本0.18二进制副本另完成本地加密库恢复/三hash核对。Linux密码权限0777被正确拒绝，测试私有/tmp0600副本后才通过。二者均同机夹具，真实另一故障域存储按用户确认暂无，正式部署前仍需接入。

### 证据与明天门禁

证据根目录 `output/final-caddy-readiness-2026-10-14/`：server-audit/supplement/ops-prerequisites/restic-source.log；build-accepted.log、runtime-audit-final.json、source-parity.log、limits/cgroups-final、pg-settings-final；caddy-proof-final/last-smoke、tls-upload、upstream-down-final/recovery-caddy-logs；backup/wrapper/restore/wal-fixture/wal-restore/caddy-restore/nonempty-target-final/restore-data-proof；offsite/hashes/restore、restic018系列；systemd-syntax-final仅模板解析，Docker依赖占位且Node路径适配WSL，不是云主机开机测试。源码差异与脚本语法检查另有收尾结果。审批基础设施超时/断流均未执行对应操作，拆小后重新审批，无绕过。

明天先审阅适用安全更新并处理必要重启、复验SSH/Docker/Swap；确认云端80/443及受控SSH，停用无其他用途的Certbot timer；导入核验离线制品、创建私有env/数据目录、生产内容迁移，按统一Caddy入口启动并验证真实ACME/续期；落实真实离机存储、告警接收和外网设备/实际数据恢复。正式公网放行仍未发生。

Commit建议：`fix(deploy): finish Caddy delivery and consistent state recovery`。本轮变更待提交，不改动已完成的两笔历史提交。

最终交付补验：实际运行187包目录，无Vitest/ESLint/jsdom/braces，迁移schema-engine二进制19631784bytes且可执行、Worker存在。f35实际迁移再次确认18个无待执行；切换夹具运维目录导致PG重建，一次旧连接500不作为验收通过，重启测试app并等待ready后，最终Owner Worker采集200/checkedAt为本次新值（final-image-worker-accepted.log）。真实发布必须停app后执行迁移/更新，不能在仍服务的应用下重建PG。所有运行实现的7个SHA与镜像再次匹配；systemd模板仅隔离语法解析通过，非云启动证据。

收尾：交付两个归档哈希再次核验，SHA文件采用sha256sum -c标准格式。操作包最终SHA256=c073631de5906b662d20cdf5bc58ff5cef0e9a4bf2d3973d451b900fcb891d05。按标签核对停止两个测试栈及恢复原隔离SFTP为停止状态，关闭仅本轮浏览器；原snowluma/incept-postgres继续运行。保留镜像、全部合成数据、备份、制品和证据，不删除旧服务/用户文件。工作区本轮变更保留待提交，未推送或上线。


## 2026-10-14 本地材料迁移说明

原 output 下的审查/复现证据、普通日志、截图、测试夹具及备份已迁入私有 .scratch；最终发布包仍保留 output/final-caddy-readiness-2026-10-14/release。历史证据路径原文保留，当前定位与清理范围见 [本地材料规则](../runbooks/zh/local-artifacts.md) 及 [整理记录](2026-10-14-local-artifacts-and-final-commit.md)。被替代的中间构建记录不再作为最终验收依据。
