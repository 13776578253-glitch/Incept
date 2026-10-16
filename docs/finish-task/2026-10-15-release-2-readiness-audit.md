# 第二版构建、上传与上线前审查

> 后续状态：2026-10-16 已核实第二版生产切换成功，原认证配置前置已处理。当前结果见 [线上验收](2026-10-16-release-2-production-acceptance.md)。本文保留 10 月 15 日候选交付时点的事实。

日期：2026-10-15，Asia/Singapore。源码：`7bee9adcfcc951961dada18fb038cbd5e8a004d1`，`codex/production-readiness`。构建时工作区干净。本记录和主清单的更新在制品冻结后追加，应用源码未变。

## 结论

第二版已完成本地生产构建、隔离验收、离线打包、服务器上传和镜像加载。生产仍运行 `/srv/incept/releases/98b77ff`，没有执行第二版生产迁移或切换 current。

切换前两个认证前置：

1. 生产 `.env.production` 缺少 `INCEPT_AUTH_ENCRYPTION_KEY`，新启动器会拒绝启动。应在服务器生成独立 32 字节随机密钥，并纳入私有备份。
2. 生产只有首版 18 个迁移，尚无 `owner_accounts` 表。升级到 21 个迁移后须受控初始化 Owner，由用户绑定生产专用 Aegis 条目和保存恢复码。新版本已退役旧 master-secret 普通登录。

服务器不执行构建，不从本地库覆盖生产；保留当前 PG、shared、Caddy 内容及 `INCEPT_COMPOSE_OVERRIDE`。

## 31 项待办的当前状态

表中的“本地完成”包括当前代码及本轮自动/隔离验证；生产状态另列。运营外部接入事项继续按各自前置处理。

| ID | 当前完成情况 | 生产与剩余事项 |
| --- | --- | --- |
| AUTH-01 | 本地完成并已接受；真实密码、TOTP、风险追加验证、退出 | 等第二版切换及真实生产登录 |
| AUTH-02 | 本地完成；scrypt、加密 TOTP、SSH 初始化/恢复、改密、恢复码 | 生产独立密钥与账号初始化是切换前置 |
| AUTH-03 | 本地完成；七天绝对会话、单个/全部撤销、可信设备三十天 | 按当前策略，无空闲期限；生产待迁移 |
| ACL-01 | 本地完成；三身份页面/API/媒体、管理 loader 隔离 | 本轮镜像 HTTP 复验通过，生产待切换 |
| ACL-02 | 本地完成；单次/共享 Pro、期限、次数、撤销 | 迁移保留旧 Pro；生产待验收新签发流程 |
| ACL-03 | 本地完成；近期再认证、敏感操作及脱敏审计 | 生产待迁移；邮箱、Passkey 后续 |
| PUB-01 | 本地完成；About 按 Guest 读取、双语公开 | 第 21 次迁移只调整 unlisted about 的权限 |
| PUB-02 | 公开汇总代码完成；按后续决定公开现有活动统计 | 生产缺 GitHub Token/账号/仓库配置，当前 Compose 也未传入这些变量；待受控接入 |
| PUB-03 | 本地完成；公开 About 导航和活动入口 | 镜像双语匿名页面通过，待生产切换 |
| PUB-04 | 待人工选择测试命名文章、头像等公开范围 | 保留现有内容，未按名称自动删库 |
| BAK-01 | 未接入真实离机目标 | 尚无另一故障域目标和凭据 |
| BAK-02 | 本地备份实现已包含认证密钥文件 | 真实独立密钥托管与离机取回待完成 |
| BAK-03 | 生产本地每日定时备份已启用 | 离机成功、保留策略、空间/失败告警仍待接入 |
| BAK-04 | 首版真实本地恢复有既有验收；本轮新账号合成恢复通过 | 真实离机恢复、RPO/RTO 待验收 |
| MON-01 | Docker health/内存限制运行，轻量监测脚本已有 | 综合 monitor 未启用；缺离机 receipt 与真实告警配置 |
| MON-02 | 未接入独立外部检测 | 需外部运行点或服务 |
| MON-03 | 未实现 Owner 运营状态入口 | 后续功能，不阻塞候选包交付 |
| ALT-01 | 未选择真实接收端 | 需要邮件或 HTTPS 通知目的地及受控凭据 |
| ALT-02 | 已有 eventId/重试等脚本基础与测试 | 真实阈值、去重、恢复投递待联调 |
| ALT-03 | 尚未完成真实通知演练 | 依赖接收端和监测配置 |
| REP-01 | 电脑自动上报字段、来源和频率尚未冻结 | 当前服务器只读可访问来源及既有导入历史 |
| REP-02 | 未建立设备专用自动上报凭据 | 后续新增，不复用 Owner 密码或会话 |
| REP-03 | 既有人工导入/幂等能力保留 | 自动接收、设备认证、回执和离线重试未接入 |
| REP-04 | 现有 Dashboard 有来源/采集问题等诊断 | 设备自动上报状态及回滚清理仍待 REP-03 |
| UI-01 | 账户安全/授权、Docs、Projects、Music 已有设置入口 | 仍未涵盖运维状态总入口 |
| UI-02 | 用户批准的旧后台/开发页退役完成，Docs 已迁移 | `docs/reference` 保持原状，仍跳向缺失样例 |
| UI-03 | Docs 总览并入设置，旧 Roadmap 后台和独占 API 已删除 | 正式项目/条目、音乐及 docs push confirm 保留 |
| UI-04 | AI Key/默认模型/Workspace 占位分区已撤除 | 本地完成，待第二版切换 |
| OPS-01 | 生产内容卷覆盖真实存在；包内明确保留要求 | 切换时保留原 env、覆盖文件、卷和备份 |
| OPS-02 | 已有日志轮转、资源限制和宿主防火墙 | 维护频率、补丁/来源策略和预算继续运营确认 |
| OPS-03 | 本轮 Linux 构建、版本 manifest、独立验收及离线上传完成 | 候选已加载，生产切换待认证前置 |

## 本轮验证

| 检查 | 结果 |
| --- | --- |
| 全仓类型检查 | 通过，Dockerfile 门禁 |
| ESLint | 0 错误、8 个既有未使用项警告 |
| Roadmap | 63 项通过 |
| Dashboard | 137 项通过 |
| Music | 195 项通过 |
| Music core | 73 项通过 |
| Web | 107 项通过；28 项真实 DB 测试在构建内按设计跳过 |
| Ops | 3 项通过 |
| 独立真实 PostgreSQL 认证 | 28 项通过，核验测试库名和所有者后运行 |
| Windows 本地账号工具负面测试 | 4 项通过 |
| 合计 | 610 项通过 |
| Next 生产构建 | 通过；15 个动态文件访问 tracing 警告 |
| 运行镜像生产依赖审计 | 各等级漏洞均为 0，277 个依赖记录 |
| 镜像内容 | Worker、Prisma 引擎齐全；无 .scratch、.git、私有 env、Vitest/ESLint/jsdom 运行库 |

构建告警是动态路径令 Turbopack 扩大 tracing 的提示，镜像实际排除本地材料。运行包以非 root node 启动。告警后续可单独收紧 tracing；本轮没有修改业务源码来压制提示。

独立 Docker 栈先用首版镜像应用 18 个迁移，插入合成旧授权和文档标记，再用第二版执行 3 个新迁移。原 Pro 与普通 private 文档保留，只有目标 unlisted about 改为 guest。

三身份真实 HTTP 检查覆盖 Guest/Pro/private 文档及媒体、Docs/Projects 管理数据隔离、Owner 管理接口、旧 secret 拒绝、TOTP/未知设备批准、安全 Cookie、文档发布原子确认/重放、授权撤销、音乐上传/去重和 Range。批准删除的双语路由返回 404，archive/playback 兼容跳转正确。独立事务验证回滚、并发确认只执行一次，以及业务角色 DDL 被拒绝。

Caddy 使用测试专用 CA 校验证书和 hostname，检查双语、ready、私有媒体、跨域 403、登录体积 413 和实际 Owner Worker 刷新。浏览器匿名访问候选镜像，Docs/Projects 菜单隐藏，直接 section 参数回到外观设置；Dashboard 四区标题存在，观察到的控制台错误/警告均为 0。

正式备份脚本停写归档 PG/shared/Caddy/auth-key.json，逐归档 SHA256 复核后恢复到新的空数据库和目录。密码匹配、加密 TOTP 解密、8 个恢复码、审计/会话、文档确认记录、媒体、SQLite 和 Caddy CA 通过。测试栈已停止，卷/合成材料保留；原开发服务未操作。

旧 `scripts/production-integration.ts` 仍包含退役 studio/roadmaps 路由断言。本轮在私有检查脚本中按现用 settings/projects 路由适配后执行；正式脚本的这部分后续同步维护。未把旧断言结果当作当前通过证据。

## 真实生产只读核查

- 服务器 `/srv/incept/current` 仍指向 `releases/98b77ff`；原应用、PG、Caddy 均 healthy，app restart=0、OOM=false。
- 数据库 18 个已完成迁移，14 个文档、12 个音乐条目；无 owner_accounts 表。
- `INCEPT_COMPOSE_OVERRIDE` 已配置且目标存在；认证加密密钥缺失。
- 最新本地备份 createdAt 为 `2026-10-14T19:02:25.103Z`，即 10 月 15 日 03:02（UTC+8）；本地备份 timer active。
- `/srv/incept/.env.backup`、`.env.monitor` 缺失；monitor/offsite 未启用。
- 当前应用 GitHub 活动 Token、账号、仓库三项配置均缺失。
- 核查时约 29GB 磁盘可用、1290MiB available RAM、Swap 使用 0；未做本轮长期压测或系统升级。

## 制品与上传

位置：`output/release-2-2026-10-15-7bee9ad/`。服务器：`/srv/incept/incoming/release-2-20261015-7bee9ad/`。

| 项目 | 值 |
| --- | --- |
| Commit | `7bee9adcfcc951961dada18fb038cbd5e8a004d1` |
| 镜像标签 | `incept:20261015-7bee9ad` |
| 本机镜像索引 ID | `sha256:7719cddd5f9c364d3935f6069f7a5b2ab575b6f60310675991af5fe9c1fe20dc` |
| Linux/amd64 manifest | `sha256:bf4e367d743b4e9438e07c897113eea8e8f14889756e8c74589e035ab1e30c1a` |
| 镜像归档 | 366,765,568 bytes，SHA256 `4a54782eb7dd1fdb74566a21f7354d0afb3203f78cec9dc5eed9072b3292caba` |
| 运维归档 | 21,679 bytes，SHA256 `77c00c322a3369e32aaeeb93047a1aa552f65ba280edd744080dd823962f190b` |
| 上传结果 | 两份归档 sha256sum -c 均 OK |
| 服务器加载 | 成功；平台 manifest 与本机一致，linux/amd64、node |

索引和平台 manifest 是本地 Docker 内容标识，不是已经推送到 registry 的仓库 digest。本次只传候选包并加载镜像，没有生产迁移、凭据修改或服务切换。

## 下一次生产切换顺序

1. 审阅上述认证前置，确定生产 Owner 初始化与用户 Aegis 绑定安排。
2. 在服务器生成独立认证加密密钥，保留原配置和内容卷覆盖，私有备份密钥。
3. 进入短维护窗口，停写并制作发布前一致备份，记录首版版本与回退入口。
4. 使用候选镜像 migrate deploy；受控初始化 Owner、绑定生产验证器、保存恢复码。
5. 切换确切镜像/current 后验证 ready、双语、Owner/Pro/Guest、媒体和新备份。
6. 持续处理离机备份、外部监控告警、电脑上报；GitHub 活动配置和 reference 旧跳转单独收尾。

迁移新增表/列并改变授权约束与 About 权限。回退应用前审查新写入和授权语义；若需回退数据，将发布前备份恢复到新空目标。保留 `incept_content_20261014_data`、`/srv/incept/import-20261014/shared`、`/srv/incept/import-20261014/caddy` 及 `/srv/incept/compose.content-20261014.yml`。不执行生产 reset/seed/down -v。

原始构建、测试、TLS、恢复与上传检查材料位于 `.scratch/release-2-2026-10-15/`。本轮无应用源码改动、无 Git 提交。
