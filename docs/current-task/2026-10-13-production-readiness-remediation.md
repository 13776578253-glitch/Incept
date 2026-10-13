# 生产上线准备整改记录

## 2026-10-13 开始前边界

- 工作分支：`codex/production-readiness`，基点 `b623e13eaa1b09d1d20fb30eef832db06f9f47f6`。
- 对照生产审查报告的 T01–T12 和用户验收规划 Task 01–18逐项处理；保留原报告、原规划与 `.gitignore` 现有改动。
- 用户确认公开脱敏用量汇总、原始详情仅 Owner；无云服务器/域名，先做代码修复与隔离 Linux 验证。
- 采用明确公开字段投影，匿名请求只读已生成快照；强制采集限 Owner 并冷却。原始数据不能通过 SSR 或浏览器缓存换身份后残留。
- 受限文档媒体使用鉴权提供服务，保留文章/合集角色规则；持久目录可显式配置，拒绝旧公开媒体绕过。现有文件仅制定迁移程序，不擅自移动/删除真实内容。
- 只读 GET/HEAD 仍校验 Owner，写方法保持 Origin 检查；Docs单篇正文/事件整体事务，确认结果留持久回执，清理草稿失败不改变已提交事实。
- 固定 Node24/pnpm10环境；单实例最小生产配置、安全DB、HTTPS模板、备份/恢复/回退脚本和隔离容器测试，不操作现有数据库、不部署公网。
- 遵循 READAI.md：小范围修改，保留已有注释，追加验收记录。代码完成与真实服务器验收分别计数，不靠配置文件存在宣称任务完成。

## 验收证据

后续每组完成后追加执行结果、未关闭事项和对应 Task/T/R 编号。

## 2026-10-13 播放进度验收补充

浏览器走查确认现有播放器仅有播放/列表入口，没有进度拖拽 UI（B-16 已登记）。为满足 Task 10/14，展开列表接入原生 range 输入，使用已测试的 seekRequested intent；未知时长禁用，已知时长限制在 0 到总时长。仅增加进度控件，不改播放核心或下一首/上一首逻辑。保留原 TODO 注释并在本记录和 BACKLOG 追加说明它的 seek 部分已完成。

## [2026-10-13 17:45] - Update by AI完成改动

### 今日结论与计数边界

- 分支 `codex/production-readiness`；未提交、未推送、未发布。保留用户原 `.gitignore` 修改、原审查报告和原验收规划。
- 对照 Task 01–18，**本轮代码与隔离 Linux 闭环 15/18（83.3%）**：01–10、13、15–18；11、12、14 完成了本地部分，但其整体放行条件依赖真实域名/云主机/外网验收，继续保留未完成。
- 这不是“原清单正式验收通过 15 项”：Task 08/09 的云主机落实和 Task 13 的离机定时备份仍需在生产环境复验。用户本轮明确无服务器/域名，故上述百分比只统计本地工程闭环。**正式公网发布保持 NO-GO**。
- 原 T01–T12 的可本地前置工作已经达到至少 10 项目标，实测结果如下；不会用文件存在、模拟 Cookie 或容器重启替代真实公网验收。

### 按原验收规划逐项结果

| Task | 本轮状态 | 改动与本地证据 | 正式生产仍需确认 |
| --- | --- | --- | --- |
| 01 | 本地闭环 | Next 16.4.0、React 19.2.8、sharp 0.35.5、music-metadata 11.16.1；明确 scoped overrides；最终 audit prod 为 0 | 每次发布重新扫描公告 |
| 02 | 本地闭环 | 用户选择公开脱敏汇总：Guest/Pro 快照只读，原始详情仅 Owner；强制采集 Owner+30s 冷却；SSR/客户端按身份分域；4 项安全回归与真实 HTTP | 用生产快照复验脱敏字段；因此匿名 GET=200 是用户确认策略，并非原清单的全部 403 策略 |
| 03 | 本地闭环 | 私有目录+鉴权 Route Handler；已发布文章/合集角色校验；Guest/Pro/Owner 与撤销实测；beforeFiles 阻断旧 public 静态绕过 | 停写迁移真实媒体并核验引用；未移动/删除现有真实内容 |
| 04 | 本地闭环 | Web ESLint 9 Flat Config，修复 hydration/状态规则；lint exit 0，剩 9 条非阻断警告 | 警告后续按原任务维护 |
| 05 | 本地闭环 | Owner GET/HEAD 不要求 Origin，写操作仍检查；HTTP 与浏览器编辑、保存、刷新均通过 | 云代理下复验 |
| 06 | 本地闭环 | 正文、发布事件和确认回执同事务；UUID 回执+advisory lock；成功后清理失败仅日志；真 PG 故障回滚/并发一次写入；HTTP 草稿清理后重试 303 同文档 | 对真实导入样本复验，不重放历史写入 |
| 07 | 本地闭环 | 首页 4 条测试死链改 Docs，公共导航隐藏私密 About；导航回归/Guest 页面走查 | 首页仍为原 mock 内容，真实文案 B-01 未扩展 |
| 08 | 本地闭环 | Node >=24.15 <25，pnpm 10.30.3，镜像 Node 24.21.0；全新 Linux 冻结安装/生成/门禁/构建；pnpm cache 放共享镜像路径支持非 root 离线迁移 | 云主机 Docker/Node 安装与硬件资源验收 |
| 09 | 本地闭环 | 新私网 PG，无宿主数据库端口；强随机合成凭据、独立 DML 用户；完整 migrate deploy；superuser=false，CREATE TABLE 权限拒绝 | 云安全组、独立生产凭据、密码轮换与现有 volume 初始化纪律 |
| 10 | 本地闭环 | 持久目录+即时媒体 Route Handler+Range；新字节音频启动后上传即可 206；释放 metadata 流句柄；展开列表新增进度滑杆，真实鼠标/键盘跳转 9.2s | 真实内容迁移、真实 MP3/FLAC 与容量验收；采用鉴权流服务而非 Nginx alias |
| 11 | 部分，云待验 | HTTPS 模板、ACME webroot/deploy hook；本地可信自签 CA 检验转发 Origin、308、Cookie、413/429、安全头与 Host；修复内部监听地址导致的同源误拒绝及错误跳转 | 真实域名 ACME 签发/续期 dry-run、证书有效期、SSL Labs、真实网络 |
| 12 | 部分，云待验 | 非 root/只读 app、Docker restart/log caps、systemd unit、ready/live、磁盘/备份年龄 probe；SIGKILL 后 ready 约 2.59s | 主机 systemd 开机/重启、实际告警通道送达、故障/磁盘告警；本地容器不证明 systemd |
| 13 | 本地闭环 | 正式 backup/restore 脚本、二进制 PG dump+全部共享数据+SHA256；停止写入才备份；恢复另一空库成功，SQLite 哨兵/文档/音频/回执/媒体可读；生产清理强阻断；版本回退夹具通过 | 真离机存储、14 天保留策略、每日 timer、真实数据 RTO/RPO 与发布前备份 |
| 14 | 部分，公网待验 | Edge 临时会话 Guest/Pro/Owner；中英文、图片、高亮、播放/拖拽、Roadmap 操作；1440px/390px 截图与溢出检查；本地 1/5/10 并发共 180 请求 0 失败 | 手机 4G/5G、真实域名、真实内容完整走查、云容量；未声称真实移动设备测试 |
| 15 | 本地闭环 | Docs 图片/草稿、音乐发布临时文件原子 rename；哈希复用；校验流关闭避免句柄残留；媒体脚本+包测试+实际新上传 | 原子 rename 不是断电 fsync 保证；共享路径与权限复验 |
| 16 | 本地闭环 | GitHub 每次请求 5s 超时、分页 100 页上限；原聚合层异常降级保留，默认不配置 Token | 有需要时由运营者配置 Token 并验证真实外网 |
| 17 | 本地闭环 | 邀请路径在 Nginx 日志替换 redacted；不记录 query/Cookie；合成 marker 实测不落代理日志；Referrer-Policy no-referrer | 浏览器 URL 历史仍是凭证风险，单次邀请使用原兑换规则；生产日志复验 |
| 18 | 本地闭环 | 未实现 create/resources 显式 notFound，公开导航无入口；不再出现成功的空白页面 | 将来实现时单独恢复入口 |

### 自动化与运行证据

证据目录：`output/production-readiness-2026-10-13/`（忽略于 Git，含合成测试凭据和备份，勿公开）。

- `linux-build-seek.log`：最终 Linux 镜像完整 typecheck/lint/test/build 成功，**459 项测试**（Web 36 + Dashboard 93 + Roadmap 67 + Music UI/adapter 190 + core 73）。Lint 0 errors/9 warnings。构建 tracing 警告保留；当前使用完整 workspace 镜像，未将其当作最小 standalone 镜像。
- `remediation-audit-final.json`：生产漏洞 info/low/moderate/high/critical 均为 0。最终 lockfile 后未再修改依赖。
- `remediation-typecheck-final.log`、`remediation-docs-media-check.log`：Windows Node 24.19 支持环境检查、独立文档媒体检查通过；原全局 Node 24.14 不满足新版 jsdom，不能拿其运行结果作为新版门禁。
- `linux-migrate.log`：完整新空库迁移，包括 `20261013090000_add_docs_import_confirmations`。
- `linux-transactions.log`：中途异常回滚、并发确认一次提交、非 superuser、DDL 拒绝。
- `linux-http-final.log` / `linux-http-new-upload.log`：真实三身份、撤销、无 Origin Owner GET、确认重试、启动后不同字节音频上传/去重/Range，全部通过。
- `linux-https.log`：HTTPS 证书校验开启（只信任本地夹具 CA），转发 Origin/公开跳转、Secure Cookie、foreign origin 拒绝、413、429。
- `linux-legacy-static.log` / `linux-proxy.log`：旧静态目录故意包含受限图片，Guest 404；邀请合成 marker 不出现在日志。
- `linux-restart.log`：只杀本轮 app 的 Next 进程；RestartCount=1，ready 2.59s；非 root node，read-only rootfs。没有更改既有 `incept-postgres`/SnowLuma。
- `linux-backup.log`、`linux-restore.log`、`linux-restore-check.log`：静止一致备份、独立空库+空目录恢复；恢复命令约 2.94s，随后服务可用且浏览器文档/音频验收通过。小夹具恢复耗时不能作为真实数据 RTO 承诺。
- `linux-backup-running-guard.log`、`linux-cleanup-guard.log`：运行中备份拒绝与 production 测试数据清理拒绝。
- `linux-rollback-{before,after}.log` / `linux-rollback-{switch,return}.log`：安全依赖版本保持不变，从 Git 的旧播放器源码重建回退夹具，切换镜像后内容、媒体和 SQLite 保留，并切回最终版。此演练验证兼容 schema 下的切换，不证明跨不兼容 migration 的历史版本回退。
- `browser-seek.log`：音频实际时间与进度输入均 9.2 秒。`output/playwright/`：Owner Roadmap、Guest 中英文/桌面/390px、恢复后的播放进度截图。通过图片 naturalWidth、11 个高亮 span、audio readyState=4/15 秒/时间推进核验；白色 1px PNG 是合成夹具，不是实际内容视觉验收。
- `linux-capacity.log`：本地 HTTPS、2 CPU/2GiB app 配置，1/5/10 并发各 60 请求、全部 0 失败，p95 20.6/52/70.5ms。`linux-resources.log`：一次空闲快照 app ~131MiB、PG ~60MiB、Nginx ~10MiB；非峰值或云主机容量结论。
- 最终镜像 `incept-readiness:01a133a5`，摘要 `sha256:c144bac4491604bb013494bb40b0cecc488922d39fb53c1cbd593f3d2fd8dbd1`。所有运行数据为合成夹具，未在原开发数据库执行 migration/seed。

### 运维产物与下一步

- [中文生产发布与恢复手册](../runbooks/zh/production-deployment.md) / [English runbook](../runbooks/en/production-deployment.md)。`deployment/` 含生产 Compose、DB 初始化、TLS/限流模板、证书 deploy hook、systemd 主服务/备份/监测 timers、日志模板；`scripts/production-{start,backup,monitor}.mjs` 为运行入口。
- 本轮修复新发现的 3 个部署问题：Corepack 缓存对非 root 不可用、反代地址与内部监听地址导致写请求误拒绝、音频 metadata 流未释放导致新发布文件不可读。另修复 favicon 404 与播放进度入口。
- 未配置告警接收方/离机存储；没有发送外部消息、配置真实域名、证书签发或公网发布。原 mock Home 和下一首/上一首按钮仍按 BACKLOG 保留。
- 提交建议：`fix: production readiness security, persistence and deployment validation`。提交前将原用户修改与本轮修复一起人工审阅；本轮没有擅自提交原审查报告/验收规划。

### 2026-10-13 收尾补验：Owner 预览媒体

最终检查补充：Owner 可读取有效哈希文件名的草稿/未引用媒体（限配置媒体目录及常规文件），用于发布前预览；Guest/Pro 仍必须命中已发布且角色可访问的文档/合集引用。HTTP 夹具加入新图片的 Owner 发布前 200、Guest 发布前 404、提交后 Guest 200，避免鉴权破坏预览。该补充改变最终镜像，以下实际摘要和日志覆盖上文的上一摘要。

### 最终镜像与测试收尾

Owner 草稿图片补验完成：`linux-build-preview-final.log` 全门禁 459 tests 成功，`linux-http-preview-final.log` 已执行发布前 Owner 200/Guest 404、提交后 Guest 200 及全组核心 HTTP 断言。实际最终摘要更新为 `sha256:1c00b3c6bf0a1aa68070092faa49fc17339f462f5e8b5f7855778890071fbf81`；之前的 c144 摘要为补验前版本，保留历史证据。

`restored-player-mobile.png` 已检查进度滑杆在 390px 可见、无横向溢出。逐项状态、原规划、BACKLOG 和 NEXT 均追加记录；现有代码注释未改动。两套专用测试栈已按 Compose project 标签核对后停止，未删除数据/备份/镜像，不影响原开发数据库和 SnowLuma。最终 diff --check 成功。真实公网验收仍按上表待办，不宣称 GO。

## 2026-10-13 继续完成全部代码与隔离验收

用户再次确认无云主机/域名，本轮目标扩为所有可执行代码与隔离验收，不以额外时间替代外部资源证据。

执行方案：保持现有单机拓扑，补充可配置 HTTPS 告警（只发脱敏故障类型、持久去重与恢复通知）、Restic 加密外部备份和保留策略、证书部署前校验与失败恢复，以及真实 systemd 临时单元/定时器验证。所有接收端、SSH 密钥、ACME CA、数据库与数据均为本轮隔离夹具；不发送真实外部消息，不启用 WSL Docker 集成，不改变已有服务。完整浏览器补验继续使用 Playwright 临时会话。

### 2026-10-13 完整浏览器补验发现：原生表单 Origin

真实 Owner 导入预览可读，但原生 Confirm import 表单返回 404。全站 no-referrer 会使非 CORS 原生 POST 的 Origin 序列化为 null；不能通过放宽 CSRF 门禁解决。调整代理为普通页面 same-origin，邀请凭证路径 no-referrer，并隐藏上游重复 Referrer-Policy，确保最终只有一个明确策略。日志脱敏也覆盖无 locale 前缀的邀请路径，防止自动语言跳转前泄露 URL 凭证。保留严格 Origin 拒绝规则，继续实测表单与敏感响应头。

## [2026-10-13 19:40] - Update by AI 完成全部代码与隔离验收

用户再次确认“仍暂无，完成全部代码与隔离验收”。按此范围，18/18 本地工程项闭环；不将原清单的公网放行框改为已验收。历史 15/18 与旧镜像摘要保留。

| 项目 | 本轮实际验收 | 真实生产仍需复验 |
| --- | --- | --- |
| Task 11 | Nginx HTTP/HTTPS、Host/Origin、Cookie、413/403；Pebble 真实 HTTP challenge、Certbot 签发与续期、CA/域名校验；坏密钥拒绝及 Nginx 故障恢复旧证书 | DNS、Let's Encrypt、SSL Labs A、续期 timer、云防火墙 |
| Task 12 | HTTPS 脱敏告警、持久去重/稳定重试 eventId/恢复；真实 WSL systemd 用户 timer/service 故障/恢复/过期备份/磁盘阈值/SIGKILL 重启；生产 units 解析；日志上限模板 | 生产主服务开机启动、主机重启、实际通知接收者及主机日志策略 |
| Task 13 | Restic 独立密码、SFTP 固定主机密钥、上传前哈希、全量 check/receipt、host/tag 自动保留14天且至少2份；restore --verify 后两文件 SHA256一致，其他host/tag保留 | 另一故障域、密码恢复托管、真实数据RTO≤2h/RPO≤24h |
| Task 14 | Owner API强密钥登录+浏览器Cookie；原生文档预览/确认/图片；音乐库创建/重命名/上传/去重/停用恢复；Roadmap创建/修改/刷新；Guest/Pro兑换/退出/受限拒绝；双语高亮/图片/390px无溢出/实际播放与seek | 真实内容视觉、4G/5G和外网真实设备 |

Task 01–10、15–18 保持通过；最新镜像重跑全组门禁与三身份HTTP。额外 Guest/Pro Dashboard SSR 检查无原始项目、会话、路径和错误详情，公开用量仍只读脱敏汇总。

### 运维交付与发现的修复

production-alert.mjs 在发送前持久化状态，5秒HTTPS且拒绝跳转，2xx才记录送达；Idempotency-Key=eventId，接收端须去重，首次正常不通知、持续故障默认60分钟提醒。不宣称未经接收方确认的 exactly-once。production-offsite.mjs/offsite.sh/incept-offsite.service 完成校验/上传/check/receipt/保留，backup timer先依赖一致备份再加密。本机未验证/失败包不自动删除。

certificate-deploy.sh 前置域名/有效期/密钥校验，Nginx验证/重载失败恢复旧文件，唯一私有previous目录避免PID复用。Nginx普通页面same-origin、邀请no-referrer，并在各server覆盖默认access log：实测仅同级追加自定义格式仍会同时写镜像main日志，现已修复HTTP/HTTPS与无locale路径；请求级error_log=crit避免原URI泄露。

deployment/validation 提供可复现systemd和代理/SSR回归、回环合成接收端；2个native ops测试进入Docker门禁。中英文手册补齐告警/密码托管/保留/恢复及journald模板操作。

### 证据索引

本轮文件位于 `output/production-readiness-2026-10-13/ops-complete/`；本地忽略产物、Cookie/密码/SSH私钥和原始备份不提交。

- acme-issue.log / acme-renew.log / acme-endpoint-{issued,renewed}.log：未跳过challenge；真实TLS序列号356535099F852414→1221264B48DDFE13。
- certificate-rollback-proof.log：badKeyRejected、failedValidationRestored、newCertificateDeployed均true；只对本轮proxy注入故障并最终移除。
- final-proxy-proof.log / proxy-redaction-proof.log：CA验证、单个正确Referrer-Policy、Owner无Origin GET、public SSR脱敏、403/413、HTTP/HTTPS日志脱敏。
- systemd-reproducible.log / systemd-check.log / https-alert-events.json：真实transient用户单元/HTTPS送达与恢复；不修改全局信任。systemd-unit-syntax.log仅为模板解析/依赖检查，夹具执行路径与docker.service占位，非生产开机测试；现有snapd/netplan警告保留。
- retention-proof.log：快照前18、后16（含新增），其他host/tag保留；offsite-restore-hashes.log：Restic恢复后database.dump/data.tar.gz校验一致。同机SFTP容器不是实际离机故障域。
- final-linux-http.log：Guest/Pro/Owner、撤销、媒体、运行中上传/去重/206全通过。
- browser-seek-final.log / roadmap-create-snapshot.log / output/playwright/full-*：真实浏览器创建/编辑/表单/读取；seek=9.2/15s。390px是模拟尺寸，白色1px PNG是合成夹具，不能称真实内容/手机验收。
- linux-build-ops-final.log（上级目录）：Node24.21、冻结lockfile、Prisma generate、typecheck/lint/461 tests/build成功（459原测试+2ops）。Lint 0errors/9既有warnings，构建仍有动态模块警告；生产依赖零漏洞沿用本轮前段审计证据。

### 放行边界

代码与隔离演练完成，正式公网仍NO-GO：暂无主机/域名及真实外部接收/存储。没有真实外部通知、Git提交/推送、公网发布、原开发库迁移或全局WSL/Docker/journald改动。Home mock、B-16下一首/上一首等产品待办保留，不扩展为部署安全修复。实际环境具备后按runbook完成最后门禁。

### 最终运行镜像依赖补验

最终镜像检查发现 COPY 构建环境会携带开发依赖；全量安装审计为17 high/5 moderate/1 low，不能拿此前 --prod=0 证明整个镜像无告警。改为单独 production-dependencies 阶段，清除工作区 node_modules 后离线冻结安装 --prod，仅复制运行依赖与已构建产物。Prisma/tsx 是真实迁移和内容 CLI 需要，明确移为 db 生产依赖；保留已生成的 Prisma 可执行文件，避免迁移依赖启动时下载。新增 esbuild 修补覆盖至0.28.1，重新验证门禁、迁移、Dashboard Worker和业务。开发环境未修补的传递依赖另列风险，不随运行镜像安装。

补验结果：`linux-build-runtime-final.log` 全门禁461 tests/typecheck/lint/build成功；生产依赖审计 `runtime-audit-final.json` 全等级均0。`runtime-artifact-proof.log` 实际187个包目录，无Vitest/ESLint/jsdom/braces；已构建Worker及Prisma迁移引擎保留。`runtime-migrate.log` 成功连接本轮隔离库并执行migrate deploy（18个迁移，无待执行）；`runtime-http.log` 核心三身份/发布/上传/去重/Range通过；`runtime-proxy-proof.log` HTTPS及public SSR通过；`runtime-worker-proof.log` Owner真实刷新200且checkedAt为新值，非仅检查Worker文件存在。

最终运行镜像摘要：`sha256:d7109d9ed82d4af44480eae84f3dbd163713e0c1b2505b995d972bb9a7a11fcb`，标签 `incept-readiness:01a133a5`。此前2ccb镜像为精简前构建，保留为过程证据。当前开发全量审计仍17 high/5 moderate（development-audit-final.json），来源为开发工具传递依赖，未称全依赖零告警；正式运行范围按生产安装与实际镜像检查验收，开发依赖后续升级登记BACKLOG。

最终浏览器复验推翻上述d710候选的页面通过判断：健康/HTTP/Worker正常，但全文高亮页面500。递归删除所有node_modules误删了Turbopack在.next内生成的shiki哈希别名。改为只删除6个工作区依赖目录，保留全部编译产物和生成别名；加.next断链门禁，再构建及实测浏览器页面。d710仅保留为失败候选证据，不能部署。

### 真正最终候选与收尾

`linux-build-runtime-alias-final.log` 再次通过461 tests、typecheck/lint/build与.next断链检查；实际镜像摘要 `sha256:8c84cca92c2bcc7dde0c1d49721217d4079294f8399939be538abe4636f5f31c` 覆盖所有前述候选。`runtime-alias-artifact-proof.log` 确认187包、无开发测试工具/braces、Next别名可解析、迁移引擎/Worker保留；`runtime-alias-proxy-proof.log` 增加双语真实文档SSR检查，防止只用ready/API误判健康。`runtime-alias-http.log` 和 `runtime-alias-worker-proof.log` 再次通过核心HTTP及Owner真实采集。

最终浏览器重新建立空会话：英文/中文文档均HTTP200，标题、已加载图片与高亮span正常，390px无溢出；`runtime-browser-console.log` 0errors/0warnings，截图 `output/playwright/runtime-final-zh-code.png` 已目视检查。并非以失败候选的历史测试替代页面验证。原始代码注释diff检查和git diff --check通过；专用浏览器及Docker测试服务最后按标签核对后停止，保留合成数据、备份和镜像，不删除原服务或用户改动。

## 2026-10-13 23:23 Lighthouse SSH 与内存加固（追加）

服务器已具备，用户授权新的执行阶段。实际 root 公钥登录验证后关闭 password / keyboard-interactive，root保留公钥；配置校验、自动回滚定时器、reload、独立新连接确认完成。资源配置改为 app768MiB / PG384MiB / proxy96MiB / migrate320MiB，Node及Worker old-space256MiB、迁移128MiB；裁剪PG缓存/操作内存/连接和并行，保留持久性。

新独立Linux容器夹具通过真实迁移/事务/角色、核心三身份HTTP、双语SSR、Owner Worker刷新、128MiB上传/Range、10并发读及HTTPS代理；cgroup峰值与OOM计数有实际证据。云主机还未部署应用，Caddy/sslip.io和真实公网门禁待下一阶段，历史隔离验收不被改写。详见 [加固与证据](./2026-10-13-lighthouse-security-memory-hardening.md)。
